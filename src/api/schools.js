import { request } from './request'

/* ===== 学校 ===== */
export function listSchools({ keyword = '', type = '' } = {}) {
    const qs = new URLSearchParams({ keyword, type }).toString()
    return request('GET', `/api/schools?${qs}`)
}

export function createSchool(payload) {
    return request('POST', '/api/schools', payload)
}

export function updateSchool(schoolId, payload) {
    return request('PUT', `/api/schools/${schoolId}`, payload)
}

export function deleteSchool(schoolId) {
    return request('DELETE', `/api/schools/${schoolId}`)
}

/* ===== 班级 ===== */
export function listClasses(schoolId) {
    return request('GET', `/api/schools/${schoolId}/classes`)
}

export function createClass(payload) {
    return request('POST', `/api/schools/${payload.schoolId}/classes`, payload)
}

export function updateClass(classId, payload) {
    // schoolId 在路径中需要回传，但更新时通常不变；这里用 payload.schoolId
    return request('PUT', `/api/schools/${payload.schoolId}/classes/${classId}`, payload)
}

export function deleteClass(classId) {
    // 后端路由是 /api/schools/:id/classes/:classId，删除时 schoolId 仍是路径变量
    // 这里通过现有 mock 行为保留兼容：直接用占位路径，后端按 classId 查
    return request('DELETE', `/api/schools/_/classes/${classId}`)
}

/* ===== 学校下用户列表 ===== */
export function listUsersBySchool(schoolId) {
    return request('GET', `/api/schools/${schoolId}/users`)
}
