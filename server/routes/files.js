import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import express from 'express'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'
import { pool } from '../db.js'
import { ok, fail, rowToCamel, genId } from '../utils.js'

const router = Router()

// ESM 下 __dirname 不存在，需要用 import.meta.url 推导
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 资源文件存放目录：server/uploads/files/，与系统配置的 uploads 同根不同子目录
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'files')
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// 解析 Authorization 头中的当前登录用户（与 ans.js 一致）
async function getCurrentUser(req) {
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const m = /mock_token_(u\d+)_/.exec(token)
    if (!m) return null
    const [uRows] = await pool.query(
        'SELECT user_id, nickname, role FROM users WHERE user_id = ? LIMIT 1', [m[1]]
    )
    return uRows[0] || null
}

// 大小格式化：bytes → KB/MB（前端展示用）
function formatSize(bytes) {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// GET /api/files：列出所有文件（按时间倒序）
router.get('/', async (req, res) => {
    const [rows] = await pool.query(
        'SELECT file_id, original_name, storage_name, size, mime, uploader, create_time FROM files ORDER BY create_time DESC'
    )
    const list = rows.map((r) => {
        const camel = rowToCamel(r)
        return {
            ...camel,
            url: `/api/files/raw/${r.storage_name}`,
            sizeText: formatSize(Number(r.size))
        }
    })
    return res.json(ok(list))
})

// POST /api/files/upload：上传文件（base64），返回直链
// body: { name, mime, data(base64), uploader }
router.post('/upload', async (req, res) => {
    const body = req.body || {}
    if (!body.name || !body.data) return res.json(fail('请提供文件名和文件内容', 400))

    const user = await getCurrentUser(req)
    if (!user) return res.json(fail('请先登录', 401))

    // 限制单文件 20MB（base64 解码后），防止滥用
    const b64 = body.data.split(',')[1] || body.data
    let buf
    try {
        buf = Buffer.from(b64, 'base64')
    } catch {
        return res.json(fail('文件内容格式错误', 400))
    }
    if (buf.length > 20 * 1024 * 1024) return res.json(fail('文件过大，最大 20MB', 400))

    // 存储名：固定前缀 + 时间戳 + 随机后缀 + 保留原扩展名
    const ext = path.extname(body.name).toLowerCase() || ''
    const safeExt = /^\\.[a-z0-9]{1,10}$/.test(ext) ? ext : ''
    const storageName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`
    const abs = path.join(UPLOAD_DIR, storageName)
    if (!abs.startsWith(UPLOAD_DIR)) return res.json(fail('非法路径', 400))

    fs.writeFileSync(abs, buf)

    const fileId = 'f_' + genId()
    await pool.query(
        `INSERT INTO files (file_id, original_name, storage_name, size, mime, uploader, create_time)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [fileId, body.name, storageName, buf.length, body.mime || '', user.nickname]
    )

    return res.json(ok({
        fileId,
        originalName: body.name,
        storageName,
        url: `/api/files/raw/${storageName}`,
        size: buf.length,
        sizeText: formatSize(buf.length)
    }))
})

// DELETE /api/files/:fileId：删除文件（仅作者本人或管理员可删）
router.delete('/:fileId', async (req, res) => {
    const user = await getCurrentUser(req)
    if (!user) return res.json(fail('请先登录', 401))

    const [rows] = await pool.query(
        'SELECT storage_name, uploader FROM files WHERE file_id = ? LIMIT 1', [req.params.fileId]
    )
    if (rows.length === 0) return res.json(fail('文件不存在', 404))
    if (user.role !== 'admin' && rows[0].uploader !== user.nickname) {
        return res.json(fail('只能删除自己上传的文件', 403))
    }

    const abs = path.join(UPLOAD_DIR, rows[0].storage_name)
    if (abs.startsWith(UPLOAD_DIR) && fs.existsSync(abs)) {
        fs.unlinkSync(abs)
    }
    await pool.query('DELETE FROM files WHERE file_id = ?', [req.params.fileId])
    return res.json(ok(null))
})

// 判断是否为文本文件（用于在线编辑）
function isTextFile(mime, name) {
    if (mime && mime.startsWith('text/')) return true
    if (mime === 'application/json' || mime === 'application/xml' || mime === 'application/javascript') return true
    const ext = (name.split('.').pop() || '').toLowerCase()
    return ['txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'html', 'htm',
        'css', 'scss', 'less', 'py', 'java', 'go', 'c', 'cpp', 'h', 'hpp', 'cs',
        'sh', 'bash', 'yml', 'yaml', 'xml', 'ini', 'conf', 'log', 'sql', 'vue'].includes(ext)
}

// 文本编码检测 + 解码：用 iconv-lite 解决 GBK/GB2312 中文文本乱码
// iconv-lite 是纯 JS 实现，不依赖 Node ICU 配置，比 TextDecoder('gb18030') 更可靠
// 顺序：BOM 标记 → UTF-8 严格校验 → GB18030 兜底（兼容 GBK/GB2312）
// 返回 { content, encoding }，encoding 用于前端展示实际编码
function decodeTextBuffer(buf) {
    // 1. BOM 检测：UTF-8 BOM = EF BB BF
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        return { content: iconv.decode(buf.slice(3), 'utf8'), encoding: 'UTF-8-BOM' }
    }
    // 2. 尝试 UTF-8：iconv-lite 的 utf8 解码器遇到非法字节会输出替换字符
    //    用 buf.toString('utf8') 做严格校验：如果含 U+FFFD 替换符说明不是合法 UTF-8
    const utf8Str = iconv.decode(buf, 'utf8')
    // 检查是否有替换字符（说明原始字节不是合法 UTF-8）
    if (utf8Str.indexOf('\uFFFD') === -1) {
        return { content: utf8Str, encoding: 'UTF-8' }
    }
    // 3. 非 UTF-8 → 按 GB18030 解码（向下兼容 GBK/GB2312/GB18030）
    try {
        const gbStr = iconv.decode(buf, 'gb18030')
        // GB18030 解码后如果仍有替换字符，说明也不是 GBK，兜底用 UTF-8
        if (gbStr.indexOf('\uFFFD') === -1) {
            return { content: gbStr, encoding: 'GB18030' }
        }
    } catch { /* iconv-lite 极少抛错，但防御性 catch */ }
    // 4. 兜底：返回 UTF-8 容错解码结果
    return { content: utf8Str, encoding: 'UTF-8(容错)' }
}

// 判断是否为图片文件（用于在线预览）
function isImageFile(mime, name) {
    if (mime && mime.startsWith('image/')) return true
    const ext = (name.split('.').pop() || '').toLowerCase()
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'].includes(ext)
}

// GET /api/files/:fileId/content：获取文件内容
// - 文本文件：返回 { type: 'text', content, mime }
// - 图片文件：返回 { type: 'image', dataUrl, mime }
// - 其他：返回 { type: 'unsupported' }
router.get('/:fileId/content', async (req, res) => {
    const [rows] = await pool.query(
        'SELECT storage_name, original_name, mime FROM files WHERE file_id = ? LIMIT 1',
        [req.params.fileId]
    )
    if (rows.length === 0) return res.json(fail('文件不存在', 404))
    const abs = path.join(UPLOAD_DIR, rows[0].storage_name)
    if (!abs.startsWith(UPLOAD_DIR) || !fs.existsSync(abs)) {
        return res.json(fail('文件不存在', 404))
    }

    const mime = rows[0].mime || ''
    const name = rows[0].original_name || ''

    if (isImageFile(mime, name)) {
        const b64 = fs.readFileSync(abs).toString('base64')
        // svg 实际是文本，但 mime 通常是 image/svg+xml，按图片处理预览
        const finalMime = mime || 'image/png'
        return res.json(ok({ type: 'image', dataUrl: `data:${finalMime};base64,${b64}`, mime: finalMime }))
    }

    if (isTextFile(mime, name)) {
        // 编码检测：自动识别 UTF-8(BOM)/UTF-8/GB18030(GBK/GB2312)，
        // 避免 Windows 记事本默认 GBK 中文文本被强制 UTF-8 解码导致乱码
        const buf = fs.readFileSync(abs)
        const { content, encoding } = decodeTextBuffer(buf)
        return res.json(ok({ type: 'text', content, mime, encoding }))
    }

    return res.json(ok({ type: 'unsupported', mime }))
})

// PUT /api/files/:fileId/content：更新文本内容（仅作者本人或管理员可改）
router.put('/:fileId/content', async (req, res) => {
    const user = await getCurrentUser(req)
    if (!user) return res.json(fail('请先登录', 401))

    const [rows] = await pool.query(
        'SELECT storage_name, original_name, uploader, mime FROM files WHERE file_id = ? LIMIT 1',
        [req.params.fileId]
    )
    if (rows.length === 0) return res.json(fail('文件不存在', 404))
    if (user.role !== 'admin' && rows[0].uploader !== user.nickname) {
        return res.json(fail('只能修改自己上传的文件', 403))
    }

    const mime = rows[0].mime || ''
    const name = rows[0].original_name || ''
    // 仅文本文件可在线编辑，图片/视频/二进制 不支持
    if (!isTextFile(mime, name)) {
        return res.json(fail('该文件类型不支持在线编辑', 400))
    }

    const abs = path.join(UPLOAD_DIR, rows[0].storage_name)
    if (!abs.startsWith(UPLOAD_DIR)) return res.json(fail('非法路径', 400))

    const content = req.body?.content ?? ''
    // 文本内容大小限制 5MB（避免超大文本撑爆）
    if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) {
        return res.json(fail('文本内容过大，最大 5MB', 400))
    }
    fs.writeFileSync(abs, content, 'utf8')
    const newSize = fs.statSync(abs).size
    await pool.query('UPDATE files SET size = ? WHERE file_id = ?', [newSize, req.params.fileId])
    return res.json(ok({ size: newSize, sizeText: formatSize(newSize) }))
})

// GET /api/files/download/:fileId：下载文件，强制 attachment 并使用 original_name 作为文件名
// 解决 a download 属性被 Content-Disposition 覆盖、文件名变成 storage_name 的问题
router.get('/download/:fileId', async (req, res) => {
    const [rows] = await pool.query(
        'SELECT storage_name, original_name, mime FROM files WHERE file_id = ? LIMIT 1',
        [req.params.fileId]
    )
    if (rows.length === 0) return res.status(404).json(fail('文件不存在', 404))
    const abs = path.join(UPLOAD_DIR, rows[0].storage_name)
    if (!abs.startsWith(UPLOAD_DIR) || !fs.existsSync(abs)) {
        return res.status(404).json(fail('文件不存在', 404))
    }
    // RFC 5987：filename*=UTF-8''<percent-encoded> 支持中文/特殊字符
    const encoded = encodeURIComponent(rows[0].original_name)
    res.setHeader('Content-Type', rows[0].mime || 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`)
    return fs.createReadStream(abs).pipe(res)
})

// 静态托管：/api/files/raw/<storage_name>，用于内联预览（图片/PDF 直接打开）
router.use('/raw', express.static(UPLOAD_DIR, {
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        // 不设 Content-Disposition，让浏览器内联预览；下载走 /download/:fileId 路由
    }
}))

export default router
