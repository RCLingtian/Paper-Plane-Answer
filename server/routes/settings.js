import express, { Router } from 'express'
import { pool } from '../db.js'
import { ok, fail } from '../utils.js'
import { DEFAULT_JS_INJECTION } from '../initDb.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'

const router = Router()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 上传文件存放目录：server/uploads/，前端通过 /api/settings/uploads/<file> 访问
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// 解析 mock_token 提取 userId（与 auth.js 一致）
function parseToken(req) {
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const m = /mock_token_(u\d+)_/.exec(token)
    return m ? m[1] : null
}

// admin 校验
async function requireAdmin(req) {
    const userId = parseToken(req)
    if (!userId) return { ok: false, msg: '未登录', code: 401 }
    const [rows] = await pool.query('SELECT role FROM users WHERE user_id = ? LIMIT 1', [userId])
    if (!rows[0] || rows[0].role !== 'admin') {
        return { ok: false, msg: '无权限，仅管理员可修改配置', code: 403 }
    }
    return { ok: true }
}

// 删除指定相对路径的上传文件（仅限 uploads 目录内，防越权）
function safeDeleteUploadFile(relUrl) {
    if (!relUrl || typeof relUrl !== 'string') return
    // 只处理 /api/settings/uploads/ 开头的本地文件
    const prefix = '/api/settings/uploads/'
    if (!relUrl.startsWith(prefix)) return
    const fileName = relUrl.slice(prefix.length)
    if (!fileName || fileName.includes('..') || fileName.includes('/')) return
    const abs = path.join(UPLOAD_DIR, fileName)
    if (abs.startsWith(UPLOAD_DIR) && fs.existsSync(abs)) {
        try { fs.unlinkSync(abs) } catch { /* 忽略删除失败 */ }
    }
}

// GET /api/settings/default-js  返回默认 JS 注入代码（供前端「恢复默认」按钮使用）
router.get('/default-js', (req, res) => {
    return res.json(ok({ jsInjection: DEFAULT_JS_INJECTION }))
})

// GET /api/settings  返回所有配置（含默认值兜底）
router.get('/', async (req, res) => {
    const [rows] = await pool.query('SELECT skey, svalue FROM settings')
    const map = {}
    for (const r of rows) map[r.skey] = r.svalue
    return res.json(ok({
        jsInjection: map.js_injection || '',
        highlightLib: map.highlight_lib || 'prism',
        // 验证码背景图：留空时前端用 picsum.photos seed 兜底（fuukei API 已失效）
        captchaBgUrl: map.captcha_bg_url || '',
        // anscard 图片源：custom=统一用配置的上传图；api=用答案自带图
        ansImageMode: map.ans_image_mode || 'api',
        ansImageUrl: map.ans_image_url || '',
        // 站点图标 favicon：空表示用默认 /favicon.svg
        faviconUrl: map.favicon_url || '',
        // 是否开放注册
        allowRegister: map.allow_register == null ? '1' : map.allow_register
    }))
})

// PUT /api/settings  仅 admin 可更新
router.put('/', async (req, res) => {
    const guard = await requireAdmin(req)
    if (!guard.ok) return res.json(fail(guard.msg, guard.code))

    const body = req.body || {}
    // 先取旧的 anscard 图 URL，便于切换/替换时删旧文件
    const [oldRows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'ans_image_url'")
    const oldAnsImg = oldRows[0]?.svalue || ''

    const items = []
    if (typeof body.jsInjection === 'string') {
        items.push(['js_injection', body.jsInjection])
    }
    if (['prism', 'highlight', 'none'].includes(body.highlightLib)) {
        items.push(['highlight_lib', body.highlightLib])
    }
    if (typeof body.captchaBgUrl === 'string') {
        items.push(['captcha_bg_url', body.captchaBgUrl])
    }
    if (['custom', 'api'].includes(body.ansImageMode)) {
        items.push(['ans_image_mode', body.ansImageMode])
    }
    // anscard 自定义图：切换/替换为新图时删除上一张本地图
    if (typeof body.ansImageUrl === 'string') {
        items.push(['ans_image_url', body.ansImageUrl])
        if (oldAnsImg && oldAnsImg !== body.ansImageUrl) {
            safeDeleteUploadFile(oldAnsImg)
        }
    }
    if (typeof body.allowRegister === 'string' || typeof body.allowRegister === 'boolean') {
        const v = body.allowRegister === true || body.allowRegister === '1' || body.allowRegister === 1 ? '1' : '0'
        items.push(['allow_register', v])
    }
    if (items.length === 0) return res.json(fail('没有可更新的字段', 400))

    for (const [k, v] of items) {
        // UPSERT：存在则更新，不存在则插入
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
            [k, v]
        )
    }
    return res.json(ok(null))
})

// POST /api/settings/upload-image  仅 admin，接收 base64 图片，存盘并返回 URL
// body: { image: "data:image/png;base64,xxx", fileName?: "xx.png" }
// 返回 { url: "/api/settings/uploads/xxxx.png" }
router.post('/upload-image', async (req, res) => {
    const guard = await requireAdmin(req)
    if (!guard.ok) return res.json(fail(guard.msg, guard.code))

    const { image, fileName } = req.body || {}
    if (!image || typeof image !== 'string') {
        return res.json(fail('缺少图片数据', 400))
    }
    // 解析 data URL：data:image/png;base64,<data>
    const m = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(image)
    if (!m) return res.json(fail('图片格式不正确', 400))
    const mime = m[1]   // image/png ...
    const b64 = m[2]
    const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
    const ext = extMap[mime] || 'png'
    const rand = crypto.randomBytes(8).toString('hex')
    const fname = `${rand}.${ext}`
    const abs = path.join(UPLOAD_DIR, fname)
    try {
        fs.writeFileSync(abs, Buffer.from(b64, 'base64'))
    } catch (e) {
        return res.json(fail('保存图片失败: ' + e.message, 500))
    }
    const url = `/api/settings/uploads/${fname}`
    // 透传可选 fileName 仅用于日志
    void fileName
    return res.json(ok({ url }))
})

// 读取/写入 favicon 配置（值为 /api/settings/uploads/favicon_xxx.ext，空=默认 /favicon.svg）
async function getFaviconSetting() {
    const [rows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'favicon_url'")
    return rows[0]?.svalue || ''
}
async function setFaviconSetting(url) {
    await pool.query(
        `INSERT INTO settings (skey, svalue) VALUES ('favicon_url', ?)
         ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
        [url]
    )
}

// POST /api/settings/upload-favicon  仅 admin，上传站点图标
// 存盘后删除上一张已上传的图标文件，再更新配置（默认 favicon.svg 不受影响）
router.post('/upload-favicon', async (req, res) => {
    const guard = await requireAdmin(req)
    if (!guard.ok) return res.json(fail(guard.msg, guard.code))

    const { image } = req.body || {}
    if (!image || typeof image !== 'string') {
        return res.json(fail('缺少图标数据', 400))
    }
    // 解析 data URL（兼容 image/x-icon 等含连字符的 MIME）
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(image)
    if (!m) return res.json(fail('图标格式不正确，请上传图片文件', 400))
    const mime = m[1]
    const b64 = m[2]
    const extMap = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico'
    }
    const ext = extMap[mime]
    if (!ext) return res.json(fail('不支持的图标格式，请用 svg/png/ico/jpg/gif/webp', 400))

    const rand = crypto.randomBytes(8).toString('hex')
    const fname = `favicon_${rand}.${ext}`
    const abs = path.join(UPLOAD_DIR, fname)
    try {
        fs.writeFileSync(abs, Buffer.from(b64, 'base64'))
    } catch (e) {
        return res.json(fail('保存图标失败: ' + e.message, 500))
    }

    // 删除上一张已上传的图标（favicon.svg 是 public 静态资源，不在 uploads 目录，永远不会被删）
    const oldUrl = await getFaviconSetting()
    if (oldUrl) safeDeleteUploadFile(oldUrl)

    const url = `/api/settings/uploads/${fname}`
    await setFaviconSetting(url)
    return res.json(ok({ url }))
})

// DELETE /api/settings/favicon  仅 admin，恢复默认图标：删除已上传文件并清空配置
router.delete('/favicon', async (req, res) => {
    const guard = await requireAdmin(req)
    if (!guard.ok) return res.json(fail(guard.msg, guard.code))

    const oldUrl = await getFaviconSetting()
    if (oldUrl) {
        safeDeleteUploadFile(oldUrl)
        await setFaviconSetting('')
    }
    return res.json(ok({ url: '' }))
})

// 静态托管上传的图片
router.use('/uploads', express.static(UPLOAD_DIR, {
    maxAge: '7d',
    immutable: true
}))

export default router
