import { request } from './request'

// 首页推荐列表：取最新若干条，支持 keyword 搜索
export function listRecommended({ keyword = '', limit = 10 } = {}) {
    const qs = new URLSearchParams({ keyword, limit }).toString()
    return request('GET', `/api/ans/recommended?${qs}`)
}

// 答案列表：支持 keyword 模糊搜索、分页
export function listAns({ page = 1, pageSize = 10, keyword = '' } = {}) {
    const qs = new URLSearchParams({ page, pageSize, keyword }).toString()
    return request('GET', `/api/ans?${qs}`)
}

export function getAns(ansid) {
    return request('GET', `/api/ans/${ansid}`)
}

export function createAns(payload) {
    return request('POST', '/api/ans', payload)
}

export function updateAns(ansid, payload) {
    return request('PUT', `/api/ans/${ansid}`, payload)
}

export function deleteAns(ansid) {
    return request('DELETE', `/api/ans/${ansid}`)
}
