import { Router } from 'express'
import { pool } from '../db.js'
import { ok, fail, rowToCamel, genId, md5, isUnsafeText } from '../utils.js'

const router = Router()

// GET /api/users?page=1&pageSize=10&schoolId=&status=&keyword=
router.get('/', async (req, res) => {
    const page = Number(req.query.page) || 1
    const pageSize = Number(req.query.pageSize) || 10
    const offset = (page - 1) * pageSize
    const { schoolId, status, keyword } = req.query

    const where = []
    const params = []
    if (schoolId) { where.push('school_id = ?'); params.push(schoolId) }
    if (status) { where.push('status = ?'); params.push(status) }
    if (keyword) {
        where.push('(nickname LIKE ? OR email LIKE ? OR account LIKE ?)')
        const k = `%${keyword}%`
        params.push(k, k, k)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM users ${whereSql}`, params
    )
    const total = countRows[0].total

    const [rows] = await pool.query(
        `SELECT user_id, email, account, nickname, gender, school_id, class_id, status, role, create_time
         FROM users ${whereSql}
         ORDER BY create_time DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return res.json(ok({
        list: rows.map(rowToCamel),
        total
    }))
})

// GET /api/users/:userid
router.get('/:userid', async (req, res) => {
    const [rows] = await pool.query(
        `SELECT user_id, email, account, nickname, gender, school_id, class_id, status, role, create_time
         FROM users WHERE user_id = ? LIMIT 1`, [req.params.userid]
    )
    if (rows.length === 0) return res.json(fail('用户不存在', 404))
    return res.json(ok(rowToCamel(rows[0])))
})

// POST /api/users
router.post('/', async (req, res) => {
    const body = req.body || {}
    if (!body.email || !body.account || !body.password) {
        return res.json(fail('邮箱/账户名/密码必填', 400))
    }
    // XSS 防护：拒绝含 HTML 标签的纯文本字段
    if (isUnsafeText(body.nickname) || isUnsafeText(body.account)) {
        return res.json(fail('昵称/账户名不能包含 HTML 标签', 400))
    }

    // 唯一性校验
    const [emailRows] = await pool.query('SELECT user_id FROM users WHERE email = ?', [body.email])
    if (emailRows.length > 0) return res.json(fail('邮箱已被注册', 409))
    const [accRows] = await pool.query('SELECT user_id FROM users WHERE account = ?', [body.account])
    if (accRows.length > 0) return res.json(fail('账户名已存在', 409))

    const userid = genId('u')
    await pool.query(
        `INSERT INTO users (user_id, email, account, password, nickname, gender, school_id, class_id, status, role, create_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW())`,
        [
            userid,
            body.email,
            body.account,
            md5(body.password),   // 密码统一存 MD5，不落明文
            body.nickname || body.account,
            body.gender || 'unknown',
            body.schoolId || null,
            body.classId || null,
            body.role || 'user'
        ]
    )
    return res.json(ok({ userid }))
})

// PUT /api/users/:userid  更新用户信息（不含 role/status，二者有专门接口）
router.put('/:userid', async (req, res) => {
    const { userid } = req.params
    const body = req.body || {}

    // XSS 防护：拒绝含 HTML 标签的纯文本字段
    if (isUnsafeText(body.nickname) || isUnsafeText(body.account)) {
        return res.json(fail('昵称/账户名不能包含 HTML 标签', 400))
    }

    const [rows] = await pool.query(
        'SELECT user_id, email, account FROM users WHERE user_id = ? LIMIT 1', [userid]
    )
    if (rows.length === 0) return res.json(fail('用户不存在', 404))

    // 唯一性校验（排除自身）
    if (body.email) {
        const [emailRows] = await pool.query(
            'SELECT user_id FROM users WHERE email = ? AND user_id <> ?', [body.email, userid]
        )
        if (emailRows.length > 0) return res.json(fail('邮箱已被占用', 409))
    }
    if (body.account) {
        const [accRows] = await pool.query(
            'SELECT user_id FROM users WHERE account = ? AND user_id <> ?', [body.account, userid]
        )
        if (accRows.length > 0) return res.json(fail('账户名已存在', 409))
    }

    // 动态拼装需要更新的字段
    const fields = []
    const params = []
    const allowed = ['email', 'account', 'nickname', 'gender', 'school_id', 'class_id']
    const bodyMap = {
        email: body.email,
        account: body.account,
        nickname: body.nickname,
        gender: body.gender,
        school_id: body.schoolId || null,
        class_id: body.classId || null
    }
    for (const key of allowed) {
        if (bodyMap[key] !== undefined) {
            fields.push(`${key} = ?`)
            params.push(bodyMap[key])
        }
    }
    // 密码可选：传了才更新
    if (body.password) {
        fields.push('password = ?')
        params.push(md5(body.password))
    }

    if (fields.length === 0) return res.json(fail('没有需要更新的字段', 400))
    params.push(userid)
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, params)
    return res.json(ok(null))
})

// PATCH /api/users/:userid/toggle  body={status}
router.patch('/:userid/toggle', async (req, res) => {
    const { userid } = req.params
    const { status } = req.body || {}
    if (!['active', 'disabled'].includes(status)) {
        return res.json(fail('status 取值非法', 400))
    }
    const [rows] = await pool.query(
        'SELECT role FROM users WHERE user_id = ? LIMIT 1', [userid]
    )
    if (rows.length === 0) return res.json(fail('用户不存在', 404))
    if (rows[0].role === 'admin' && status === 'disabled') {
        return res.json(fail('不能停用管理员账号', 403))
    }
    await pool.query('UPDATE users SET status = ? WHERE user_id = ?', [status, userid])
    return res.json(ok(null))
})

// DELETE /api/users/:userid  删除用户（管理员账号受保护，不可删）
router.delete('/:userid', async (req, res) => {
    const { userid } = req.params
    const [rows] = await pool.query(
        'SELECT role FROM users WHERE user_id = ? LIMIT 1', [userid]
    )
    if (rows.length === 0) return res.json(fail('用户不存在', 404))
    if (rows[0].role === 'admin') {
        return res.json(fail('不能删除管理员账号', 403))
    }
    await pool.query('DELETE FROM users WHERE user_id = ?', [userid])
    return res.json(ok(null))
})

export default router
