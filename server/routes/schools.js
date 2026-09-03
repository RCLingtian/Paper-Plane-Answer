import { Router } from 'express'
import { pool } from '../db.js'
import { ok, fail, rowToCamel, genId, isUnsafeText } from '../utils.js'

const router = Router()

/* ===== 学校 ===== */

// GET /api/schools?keyword=&type=
router.get('/', async (req, res) => {
    const keyword = (req.query.keyword || '').trim()
    const type = (req.query.type || '').trim()
    const conditions = []
    const params = []
    if (keyword) {
        conditions.push('(name LIKE ? OR address LIKE ?)')
        const k = `%${keyword}%`
        params.push(k, k)
    }
    if (type) {
        conditions.push('school_type = ?')
        params.push(type)
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const [rows] = await pool.query(
        `SELECT * FROM schools ${where} ORDER BY create_time DESC`, params
    )
    return res.json(ok(rows.map(rowToCamel)))
})

// POST /api/schools
router.post('/', async (req, res) => {
    const body = req.body || {}
    if (!body.name) return res.json(fail('请输入学校名称', 400))
    // XSS 防护：纯文本字段禁止 HTML 标签
    if (isUnsafeText(body.name) || isUnsafeText(body.address)) {
        return res.json(fail('学校名称/地址不能包含 HTML 标签', 400))
    }
    const schoolId = genId('s')
    await pool.query(
        'INSERT INTO schools (school_id, name, school_type, address, create_time) VALUES (?, ?, ?, ?, NOW())',
        [schoolId, body.name, body.schoolType || 'senior', body.address || '']
    )
    return res.json(ok({ schoolId }))
})

// PUT /api/schools/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params
    const [rows] = await pool.query('SELECT school_id FROM schools WHERE school_id = ?', [id])
    if (rows.length === 0) return res.json(fail('学校不存在', 404))
    const body = req.body || {}
    // XSS 防护：纯文本字段禁止 HTML 标签
    if (isUnsafeText(body.name) || isUnsafeText(body.address)) {
        return res.json(fail('学校名称/地址不能包含 HTML 标签', 400))
    }
    await pool.query(
        'UPDATE schools SET name = ?, school_type = ?, address = ? WHERE school_id = ?',
        [body.name || '', body.schoolType || 'senior', body.address || '', id]
    )
    return res.json(ok({ schoolId: id }))
})

// DELETE /api/schools/:id  （级联删除班级）
router.delete('/:id', async (req, res) => {
    const { id } = req.params
    const [result] = await pool.query('DELETE FROM schools WHERE school_id = ?', [id])
    if (result.affectedRows === 0) return res.json(fail('学校不存在', 404))
    await pool.query('DELETE FROM classes WHERE school_id = ?', [id])
    return res.json(ok(null))
})

/* ===== 班级 ===== */

// GET /api/schools/:id/classes
router.get('/:id/classes', async (req, res) => {
    const [rows] = await pool.query(
        'SELECT * FROM classes WHERE school_id = ? ORDER BY create_time DESC',
        [req.params.id]
    )
    return res.json(ok(rows.map(rowToCamel)))
})

// POST /api/schools/:id/classes
router.post('/:id/classes', async (req, res) => {
    const { id: schoolId } = req.params
    const body = req.body || {}
    if (!body.name) return res.json(fail('请输入班级名称', 400))
    // XSS 防护：纯文本字段禁止 HTML 标签
    if (isUnsafeText(body.name) || isUnsafeText(body.grade)) {
        return res.json(fail('班级名称/年级不能包含 HTML 标签', 400))
    }
    const classId = genId('c')
    await pool.query(
        'INSERT INTO classes (class_id, school_id, name, grade, create_time) VALUES (?, ?, ?, ?, NOW())',
        [classId, schoolId, body.name, body.grade || '']
    )
    return res.json(ok({ classId }))
})

// PUT /api/schools/:id/classes/:classId
router.put('/:id/classes/:classId', async (req, res) => {
    const { classId } = req.params
    const [rows] = await pool.query('SELECT class_id FROM classes WHERE class_id = ?', [classId])
    if (rows.length === 0) return res.json(fail('班级不存在', 404))
    const body = req.body || {}
    // XSS 防护：纯文本字段禁止 HTML 标签
    if (isUnsafeText(body.name) || isUnsafeText(body.grade)) {
        return res.json(fail('班级名称/年级不能包含 HTML 标签', 400))
    }
    await pool.query(
        'UPDATE classes SET name = ?, grade = ? WHERE class_id = ?',
        [body.name || '', body.grade || '', classId]
    )
    return res.json(ok({ classId }))
})

// DELETE /api/schools/:id/classes/:classId
router.delete('/:id/classes/:classId', async (req, res) => {
    const { classId } = req.params
    const [result] = await pool.query('DELETE FROM classes WHERE class_id = ?', [classId])
    if (result.affectedRows === 0) return res.json(fail('班级不存在', 404))
    return res.json(ok(null))
})

/* ===== 学校下用户列表 ===== */

// GET /api/schools/:id/users
router.get('/:id/users', async (req, res) => {
    const [rows] = await pool.query(
        `SELECT user_id, email, account, nickname, gender, school_id, class_id, status, role, create_time
         FROM users WHERE school_id = ? ORDER BY create_time DESC`,
        [req.params.id]
    )
    return res.json(ok(rows.map(rowToCamel)))
})

export default router
