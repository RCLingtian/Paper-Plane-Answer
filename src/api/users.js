import { request } from './request'

// 用户列表：支持 schoolId 过滤、status 过滤、keyword 搜索、分页
export function listUsers({ page = 1, pageSize = 10, schoolId, status, keyword = '' } = {}) {
    const qs = new URLSearchParams({
        page, pageSize,
        schoolId: schoolId || '',
        status: status || '',
        keyword
    }).toString()
    return request('GET', `/api/users?${qs}`)
}

export function getUser(userid) {
    return request('GET', `/api/users/${userid}`)
}

export function createUser(payload) {
    return request('POST', '/api/users', payload)
}

// 更新用户信息（不含 role/status）
export function updateUser(userId, payload) {
    return request('PUT', `/api/users/${userId}`, payload)
}

// 启用/停用
export function toggleUser(userid, status) {
    return request('PATCH', `/api/users/${userid}/toggle`, { status })
}

// 删除用户
export function deleteUser(userid) {
    return request('DELETE', `/api/users/${userid}`)
}
