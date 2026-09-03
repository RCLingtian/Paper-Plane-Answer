import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb } from './initDb.js'
import { pool } from './db.js'
import { fail } from './utils.js'
import authRoutes from './routes/auth.js'
import ansRoutes from './routes/ans.js'
import usersRoutes from './routes/users.js'
import schoolsRoutes from './routes/schools.js'
import settingsRoutes from './routes/settings.js'
import menusRoutes from './routes/menus.js'
import viewRoutes from './routes/view.js'
import filesRoutes from './routes/files.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
// 答案 HTML 内容可能很大（粘贴完整文档/带内联资源），默认 100KB 会触发 413
// content_html 字段为 LONGTEXT，足以承载大文本，这里放宽到 50MB
app.use(express.json({ limit: '50mb' }))

// 安全响应头：基础 XSS 防护与 MIME 嗅探防护
// - X-Content-Type-Options: 阻止浏览器嗅探响应类型，防止 text/plain 被当 HTML 执行
// - X-XSS-Protection: 旧版 IE 反射 XSS 过滤（现代浏览器已内置，无副作用）
// - Referrer-Policy: 仅向同源发送完整 Referer，避免敏感 URL 泄露到外站
// - X-Frame-Options: DENY 会禁止所有 iframe 嵌入（含站内答案页），故不启用；
//   答案页通过 Sec-Fetch-Dest 校验已防止外站 iframe 嵌入
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    res.setHeader('Referrer-Policy', 'same-origin')
    next()
})

// 强制改密拦截：登录用户 force_password_change=1 时（内置管理员首次登录），
// 除改密/登出/查自身等 auth 接口外，其他 /api 接口一律 403；
// 前端会弹出不可关闭的改密弹窗，未携带 token 的公开接口不受影响
const FPC_ALLOW = new Set([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/register-status',
    '/api/auth/me',
    '/api/auth/change-password',
    '/api/auth/logout'
])
app.use(async (req, res, next) => {
    try {
        // GET /api/settings 是公开只读接口（favicon/菜单/注册开关等），改密期间也放行
        if (req.method === 'GET' && req.path === '/api/settings') return next()
        if (!req.path.startsWith('/api/') || FPC_ALLOW.has(req.path)) return next()
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
        const m = /mock_token_(u\d+)_/.exec(token)
        if (!m) return next() // 未登录：公开接口放行
        const [rows] = await pool.query(
            'SELECT force_password_change FROM users WHERE user_id = ? LIMIT 1', [m[1]]
        )
        if (rows[0] && Number(rows[0].force_password_change) === 1) {
            return res.json(fail('请先修改初始密码后再进行其他操作', 403))
        }
        return next()
    } catch {
        return next() // 查询异常不阻断请求，改密校验以前端弹窗为准
    }
})

// 路由挂载
app.use('/api/auth', authRoutes)
app.use('/api/ans', ansRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/schools', schoolsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/menus', menusRoutes)
app.use('/api/view', viewRoutes)
app.use('/api/files', filesRoutes)

// 健康检查
app.get('/api/health', (req, res) => res.json({ code: 200, msg: 'ok', data: { ts: Date.now() } }))

// ===== 生产环境：托管 Vite 构建产物 dist/ =====
// 开发环境由 Vite dev server(5173) 提供前端并代理 /api，不存在 dist/ 时跳过；
// npm run build 后 dist/ 存在，Express 直接托管静态文件并做 SPA 回退，
// 此时前端与 API 同源（均在 :3001），无需 Nginx/代理，刷新子页面也不会 404。
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')
if (fs.existsSync(DIST_DIR)) {
    // 1) 静态资源：assets/ static/ favicon.svg 等
    app.use(express.static(DIST_DIR))
    // 2) SPA 回退：非 /api 的 GET 请求（且未命中静态文件）统一返回 index.html，
    //    交给 React Router 处理（BrowserRouter history 模式刷新/直达不 404）
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
        res.sendFile(path.join(DIST_DIR, 'index.html'))
    })
    console.log('[server] 已托管前端构建产物 dist/（同源访问 :3001 即可）')
} else {
    console.log('[server] 未发现 dist/，仅提供 API（开发模式请用 npm run dev:all）')
}

// 启动：先建表+种子，再监听端口
initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`[server] 后端已启动: http://localhost:${PORT}`)
        })
    })
    .catch((err) => {
        console.error('[server] 初始化失败:', err.message)
        console.error('[server] 请检查 .env 中数据库配置，并确保已手动创建数据库：')
        console.error('           CREATE DATABASE ans_dash DEFAULT CHARACTER SET utf8mb4;')
        process.exit(1)
    })
