import { Router } from 'express'
import { pool } from '../db.js'
import { ok, fail, rowToCamel, genId, isUnsafeText } from '../utils.js'

const router = Router()

// GET /api/ans/recommended  首页推荐：取最新若干条，关联 users 拿头像
router.get('/recommended', async (req, res) => {
    const keyword = (req.query.keyword || '').trim()
    const limit = Number(req.query.limit) || 10
    let where = ''
    const params = []
    if (keyword) {
        where = 'WHERE a.title LIKE ? OR a.description LIKE ?'
        const k = `%${keyword}%`
        params.push(k, k)
    }
    const [rows] = await pool.query(
        `SELECT a.ans_id, a.title, a.description, a.images_url,
                a.uploader, a.upload_time,
                u.avatar
         FROM ans a
         LEFT JOIN users u ON u.nickname = a.uploader
         ${where}
         ORDER BY a.upload_time DESC
         LIMIT ?`,
        [...params, limit]
    )
    // rowToCamel 会把 ans_id→ansId, images_url→imagesUrl, upload_time→uploadTime（并格式化时间）
    const list = rows.map((r) => ({
        ...rowToCamel(r),
        avatar: r.avatar || ''
    }))
    return res.json(ok(list))
})

// GET /api/ans?page=1&pageSize=10&keyword=
router.get('/', async (req, res) => {
    const page = Number(req.query.page) || 1
    const pageSize = Number(req.query.pageSize) || 10
    const keyword = (req.query.keyword || '').trim()
    const offset = (page - 1) * pageSize

    let where = ''
    const params = []
    if (keyword) {
        where = 'WHERE title LIKE ? OR description LIKE ?'
        const k = `%${keyword}%`
        params.push(k, k)
    }

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM ans ${where}`, params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
        `SELECT * FROM ans ${where} ORDER BY upload_time DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return res.json(ok({
        list: rows.map(rowToCamel),
        total
    }))
})

// GET /api/ans/:ansid
router.get('/:ansid', async (req, res) => {
    const [rows] = await pool.query(
        'SELECT * FROM ans WHERE ans_id = ? LIMIT 1', [req.params.ansid]
    )
    if (rows.length === 0) return res.json(fail('答案不存在', 404))
    return res.json(ok(rowToCamel(rows[0])))
})

// POST /api/ans
router.post('/', async (req, res) => {
    const body = req.body || {}
    if (!body.title) return res.json(fail('请输入标题', 400))
    // XSS 防护：title/description/uploader 是纯文本字段，禁止 HTML 标签
    // contentHtml 例外：它本身就是 HTML，通过 iframe sandbox 隔离渲染
    if (isUnsafeText(body.title) || isUnsafeText(body.description) || isUnsafeText(body.uploader)) {
        return res.json(fail('标题/描述/上传者不能包含 HTML 标签', 400))
    }

    const ansid = genId()
    await pool.query(
        `INSERT INTO ans (ans_id, title, description, content_html, images_url, uploader, upload_time)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
            ansid,
            body.title,
            body.description || '',
            body.contentHtml || '',
            body.imagesUrl || '',
            body.uploader || '未知'
        ]
    )
    return res.json(ok({ ansid }))
})

// PUT /api/ans/:ansid  仅作者本人或管理员可改
router.put('/:ansid', async (req, res) => {
    const { ansid } = req.params
    // 权限校验：与 DELETE 一致，防止前端绕过
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const m = /mock_token_(u\d+)_/.exec(token)
    if (!m) return res.json(fail('请先登录', 401))
    const [uRows] = await pool.query(
        'SELECT nickname, role FROM users WHERE user_id = ? LIMIT 1', [m[1]]
    )
    const currentUser = uRows[0]
    if (!currentUser) return res.json(fail('用户不存在', 401))

    const [rows] = await pool.query(
        'SELECT uploader FROM ans WHERE ans_id = ? LIMIT 1', [ansid]
    )
    if (rows.length === 0) return res.json(fail('答案不存在', 404))
    if (currentUser.role !== 'admin' && rows[0].uploader !== currentUser.nickname) {
        return res.json(fail('只能修改自己上传的答案', 403))
    }

    const body = req.body || {}
    // XSS 防护：title/description/uploader 是纯文本字段，禁止 HTML 标签
    if (isUnsafeText(body.title) || isUnsafeText(body.description) || isUnsafeText(body.uploader)) {
        return res.json(fail('标题/描述/上传者不能包含 HTML 标签', 400))
    }
    await pool.query(
        `UPDATE ans SET title = ?, description = ?, content_html = ?, images_url = ?, uploader = ?, upload_time = NOW()
         WHERE ans_id = ?`,
        [
            body.title || '',
            body.description || '',
            body.contentHtml || '',
            body.imagesUrl || '',
            body.uploader || '未知',
            ansid
        ]
    )
    return res.json(ok({ ansid }))
})

// DELETE /api/ans/:ansid  仅作者本人或管理员可删
router.delete('/:ansid', async (req, res) => {
    // 解析当前登录用户（token 格式：mock_token_{userId}_{ts}）
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const m = /mock_token_(u\d+)_/.exec(token)
    if (!m) return res.json(fail('请先登录', 401))
    const [uRows] = await pool.query(
        'SELECT nickname, role FROM users WHERE user_id = ? LIMIT 1', [m[1]]
    )
    const currentUser = uRows[0]
    if (!currentUser) return res.json(fail('用户不存在', 401))

    const [rows] = await pool.query(
        'SELECT uploader FROM ans WHERE ans_id = ? LIMIT 1', [req.params.ansid]
    )
    if (rows.length === 0) return res.json(fail('答案不存在', 404))
    // 仅作者本人或管理员可删
    if (currentUser.role !== 'admin' && rows[0].uploader !== currentUser.nickname) {
        return res.json(fail('只能删除自己上传的答案', 403))
    }
    await pool.query('DELETE FROM ans WHERE ans_id = ?', [req.params.ansid])
    return res.json(ok(null))
})

export default router
