// 统一响应封装 + snake_case ↔ camelCase 转换 + 时间格式化
import crypto from 'node:crypto'

// 成功响应
export function ok(data = null, msg = '请求成功') {
    return { code: 200, msg, data }
}

// 密码 MD5 加密：数据库统一存 MD5，避免明文落库
// 传输层安全靠 HTTPS，存储层加密防止数据库泄露时密码直接暴露
export function md5(str) {
    return crypto.createHash('md5').update(String(str || '')).digest('hex')
}

// 失败响应
export function fail(msg = '请求失败', code = 500) {
    return { code, msg, data: null }
}

// DATETIME → 'YYYY/MM/DD HH:mm' 字符串（与原 mock 行为一致）
export function formatTime(date) {
    if (!date) return ''
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// snake_case → camelCase（用于 SELECT 结果返回前端）
// 同时把 create_time / upload_time 这类 DATETIME 字段格式化成字符串
const TIME_FIELDS = new Set(['create_time', 'upload_time'])

export function rowToCamel(row) {
    if (!row) return null
    const out = {}
    for (const key of Object.keys(row)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
        let val = row[key]
        if (TIME_FIELDS.has(key) && val instanceof Date) {
            val = formatTime(val)
        }
        out[camelKey] = val
    }
    return out
}

// camelCase → snake_case（用于接收前端 body 写入数据库）
export function camelToRow(obj) {
    if (!obj) return {}
    const out = {}
    for (const key of Object.keys(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
        out[snakeKey] = obj[key]
    }
    return out
}

// 生成 9 位纯数字 ID（沿用前端 mock 的 genId 逻辑，保证一致）
export function genId(prefix = '') {
    const t = Date.now().toString().slice(-6)
    const r = Math.floor(Math.random() * 900 + 100).toString()
    return `${prefix}${t}${r}`
}

// XSS 防护：检测字符串是否含 HTML 标签起始字符 < >
// 用于纯文本字段（昵称/标题/账户名等）的后端校验，拒绝含 HTML 标签的输入
// 注意：React 渲染会自动转义，此校验为防御深度，避免绕过前端的情况
export function containsHtmlTag(str) {
    if (str == null) return false
    return /[<>]/.test(String(str))
}

// XSS 防护：校验纯文本字段，含 HTML 标签则返回 true（视为不安全）
// 与 containsHtmlTag 等价，语义化命名便于在路由中阅读
export function isUnsafeText(str) {
    return containsHtmlTag(str)
}
