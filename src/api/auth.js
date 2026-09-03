import { request } from './request'

export function login(email, password) {
    return request('POST', '/api/auth/login', { email, password })
}

// 前台自助注册：仅创建普通用户
export function register(payload) {
    return request('POST', '/api/auth/register', payload)
}

// 查询是否开放注册（前台用于决定是否显示注册入口）
export function registerStatus() {
    return request('GET', '/api/auth/register-status')
}

export function getCurrentUser() {
    // 后端读 Authorization header（token 由 request 拦截器附带）
    return request('GET', '/api/auth/me')
}

// 修改自己的密码（首次登录强制改密 / 日常改密）
export function changePassword({ oldPassword, newPassword }) {
    return request('POST', '/api/auth/change-password', { oldPassword, newPassword })
}

export function logout() {
    return request('POST', '/api/auth/logout')
}
