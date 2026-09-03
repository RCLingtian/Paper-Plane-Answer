// 通用请求封装：所有 API 调用走 fetch，返回后端统一响应 {code, msg, data}
// 开发期 /api/* 由 Vite proxy 转发到 Express 后端

export async function request(method, url, body) {
    const opts = { method, headers: {} }
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json'
        opts.body = JSON.stringify(body)
    }
    // 携带 token（如果有）—— 仅对需要鉴权的接口生效，登录接口本身不需要
    const token = localStorage.getItem('ans_dash_token')
    if (token) {
        opts.headers['Authorization'] = `Bearer ${token}`
    }
    const res = await fetch(url, opts)
    // 兜底：后端返回非 JSON（如 413 HTML 错误页、502 网关页）时，
    // res.json() 会抛 SyntaxError 导致调用方 Promise reject 且无错误提示。
    // 这里统一转成标准 {code,msg,data} 错误结构，便于上层处理。
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
        return { code: res.status, msg: `请求失败（HTTP ${res.status}）`, data: null }
    }
    return res.json()
}

// 以下为旧 mock 实现的辅助函数，保留供参考但已不再使用
// 真实时间戳与 ID 现由后端生成
export function nowstamp() {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function genId(prefix = '') {
    const t = Date.now().toString().slice(-6)
    const r = Math.floor(Math.random() * 900 + 100).toString()
    return `${prefix}${t}${r}`
}
