import { Router } from 'express'
import { pool } from '../db.js'
import { ok, fail, genId, rowToCamel, isUnsafeText } from '../utils.js'

const router = Router()

// 解析 mock_token 提取 userId（与 auth.js / settings.js 一致）
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
        return { ok: false, msg: '无权限，仅管理员可管理菜单', code: 403 }
    }
    return { ok: true }
}

// 行 → 菜单对象（布尔字段转 boolean，parentId 空字符串归一为 null）
function rowToMenu(r) {
    const m = rowToCamel(r)
    m.openInNewTab = !!r.open_in_new_tab
    m.externalLink = !!r.external_link
    m.parentId = r.parent_id || null
    return m
}

// GET /api/menus：返回树形（前台 Header 渲染用）
router.get('/', async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM menus ORDER BY sort_order ASC, create_time ASC')
    const all = rows.map(rowToMenu)
    const top = all.filter((m) => !m.parentId)
    const tree = top.map((p) => ({ ...p, children: all.filter((c) => c.parentId === p.menuId) }))
    return res.json(ok(tree))
})

// XSS 防护：菜单 url 拒绝 javascript:/data: 等危险协议（防止 href 注入）
function isUnsafeUrl(url) {
    if (!url) return false
    const u = String(url).trim().toLowerCase()
    // 允许 http/https/相对路径/mailto/tel
    return /^\s*(javascript|data|vbscript|file):/i.test(u)
}

// POST /api/menus：新增（仅 admin）
router.post('/', async (req, res) => {
    const guard = await requireAdmin(req)
    if (!guard.ok) return res.json(fail(guard.msg, guard.code))
    const { text, url, openInNewTab, externalLink, parentId, sortOrder } = req.body || {}
    if (!text || !url) return res.json(fail('文本和地址必填', 400))
    // XSS 防护
    if (isUnsafeText(text)) return res.json(fail('菜单文本不能包含 HTML 标签', 400))
    if (isUnsafeUrl(url)) return res.json(fail('URL 协议不被允许', 400))
    // 二级菜单：parentId 必须指向某个顶级菜单（其本身 parent_id 为空）
    if (parentId) {
        const [pRows] = await pool.query(
            'SELECT menu_id FROM menus WHERE menu_id = ? AND parent_id IS NULL LIMIT 1', [parentId]
        )
        if (pRows.length === 0) return res.json(fail('父菜单不存在或不支持二级嵌套', 400))
    }
    const menuId = genId('m')
    await pool.query(
        'INSERT INTO menus (menu_id, parent_id, text, url, open_in_new_tab, external_link, sort_order) VALUES (?,?,?,?,?,?,?)',
        [menuId, parentId || null, text, url, openInNewTab ? 1 : 0, externalLink ? 1 : 0, Number(sortOrder) || 0]
    )
    return res.json(ok({ menuId }))
})

// PUT /api/menus/:id：更新（仅 admin）
router.put('/:id', async (req, res) => {
    const guard = await requireAdmin(req)
    if (!guard.ok) return res.json(fail(guard.msg, guard.code))
    const { id } = req.params
    const { text, url, openInNewTab, externalLink, parentId, sortOrder } = req.body || {}
    const [exRows] = await pool.query('SELECT menu_id FROM menus WHERE menu_id = ? LIMIT 1', [id])
    if (exRows.length === 0) return res.json(fail('菜单不存在', 404))
    // XSS 防护
    if (isUnsafeText(text)) return res.json(fail('菜单文本不能包含 HTML 标签', 400))
    if (isUnsafeUrl(url)) return res.json(fail('URL 协议不被允许', 400))
    const newParent = parentId || null
    // 不允许把菜单设为自己的子菜单
    if (newParent === id) return res.json(fail('不能将菜单设为自己的子菜单', 400))
    if (newParent) {
        const [pRows] = await pool.query(
            'SELECT menu_id FROM menus WHERE menu_id = ? AND parent_id IS NULL LIMIT 1', [newParent]
        )
        if (pRows.length === 0) return res.json(fail('父菜单不存在或不支持二级嵌套', 400))
    }
    await pool.query(
        'UPDATE menus SET text=?, url=?, open_in_new_tab=?, external_link=?, parent_id=?, sort_order=? WHERE menu_id=?',
        [text || '', url || '', openInNewTab ? 1 : 0, externalLink ? 1 : 0, newParent, Number(sortOrder) || 0, id]
    )
    return res.json(ok({ menuId: id }))
})

// DELETE /api/menus/:id：删除（仅 admin，级联删除其二级子菜单）
router.delete('/:id', async (req, res) => {
    const guard = await requireAdmin(req)
    if (!guard.ok) return res.json(fail(guard.msg, guard.code))
    const { id } = req.params
    await pool.query('DELETE FROM menus WHERE parent_id = ?', [id])
    await pool.query('DELETE FROM menus WHERE menu_id = ?', [id])
    return res.json(ok({}))
})

export default router
