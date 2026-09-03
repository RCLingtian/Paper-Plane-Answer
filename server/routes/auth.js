import { Router } from 'express'
import { pool } from '../db.js'
import { ok, fail, rowToCamel, genId, md5, isUnsafeText } from '../utils.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {}
    if (!email || !password) return res.json(fail('请输入邮箱和密码', 400))

    const [rows] = await pool.query(
        'SELECT * FROM users WHERE email = ? LIMIT 1', [email]
    )
    const u = rows[0]
    // 数据库存的是 MD5，登录时把明文密码 MD5 后再比对
    if (!u || u.password !== md5(password)) {
        return res.json(fail('邮箱或密码错误', 401))
    }
    if (u.status === 'disabled') {
        return res.json(fail('账号已被停用，请联系管理员', 403))
    }
    // 生成 mock token（不含敏感信息）
    const token = `mock_token_${u.user_id}_${Date.now()}`
    const user = rowToCamel(u)
    delete user.password
    return res.json(ok({ token, user }))
})

// POST /api/auth/register  前台自助注册（仅普通用户）
router.post('/register', async (req, res) => {
    const body = req.body || {}
    if (!body.email || !body.account || !body.password) {
        return res.json(fail('邮箱/账户名/密码必填', 400))
    }
    // XSS 防护：拒绝含 HTML 标签的纯文本字段
    if (isUnsafeText(body.nickname) || isUnsafeText(body.account)) {
        return res.json(fail('昵称/账户名不能包含 HTML 标签', 400))
    }
    // 校验是否开放注册
    const [regRows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'allow_register'")
    const allow = regRows[0]?.svalue
    // 未配置视为开放；'0' 表示关闭
    if (allow === '0') {
        return res.json(fail('管理员未开放注册', 403))
    }
    // 唯一性校验
    const [emailRows] = await pool.query('SELECT user_id FROM users WHERE email = ?', [body.email])
    if (emailRows.length > 0) return res.json(fail('邮箱已被注册', 409))
    const [accRows] = await pool.query('SELECT user_id FROM users WHERE account = ?', [body.account])
    if (accRows.length > 0) return res.json(fail('账户名已存在', 409))

    const userid = genId('u')
    await pool.query(
        `INSERT INTO users (user_id, email, account, password, nickname, gender, status, role, create_time)
         VALUES (?, ?, ?, ?, ?, ?, 'active', 'user', NOW())`,
        [
            userid,
            body.email,
            body.account,
            md5(body.password),
            body.nickname || body.account,
            body.gender || 'unknown'
        ]
    )
    return res.json(ok({ userid }))
})

// GET /api/auth/register-status  前台用于决定是否显示注册入口
router.get('/register-status', async (req, res) => {
    const [rows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'allow_register'")
    const allow = rows[0]?.svalue
    return res.json(ok({ allowRegister: allow == null ? true : allow !== '0' }))
})

// GET /api/auth/me  凭 token 恢复用户信息
router.get('/me', async (req, res) => {
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const m = /mock_token_(u\d+)_/.exec(token)
    if (!m) return res.json(fail('token 无效', 401))

    const [rows] = await pool.query(
        'SELECT * FROM users WHERE user_id = ? LIMIT 1', [m[1]]
    )
    const u = rows[0]
    if (!u) return res.json(fail('用户不存在', 404))

    const user = rowToCamel(u)
    delete user.password
    return res.json(ok(user))
})

// POST /api/auth/change-password  修改自己的密码
// 用于「首次登录强制改密」（force_password_change=1）及日常修改密码；
// 修改成功后清除强制改密标记
router.post('/change-password', async (req, res) => {
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const m = /mock_token_(u\d+)_/.exec(token)
    if (!m) return res.json(fail('登录状态无效，请重新登录', 401))

    const { oldPassword, newPassword } = req.body || {}
    if (!oldPassword || !newPassword) {
        return res.json(fail('请填写原密码和新密码', 400))
    }
    if (String(newPassword).length < 6) {
        return res.json(fail('新密码至少 6 位', 400))
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE user_id = ? LIMIT 1', [m[1]])
    const u = rows[0]
    if (!u) return res.json(fail('用户不存在', 404))
    if (u.status === 'disabled') return res.json(fail('账号已被停用', 403))
    if (u.password !== md5(oldPassword)) return res.json(fail('原密码不正确', 400))
    if (md5(newPassword) === u.password) return res.json(fail('新密码不能与原密码相同', 400))

    await pool.query(
        'UPDATE users SET password = ?, force_password_change = 0 WHERE user_id = ?',
        [md5(newPassword), u.user_id]
    )
    return res.json(ok(null))
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    return res.json(ok(null))
})

export default router
