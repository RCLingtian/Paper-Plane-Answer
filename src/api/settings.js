import { request } from './request'

// 获取系统配置（公开：含验证码图/anscard图/开放注册/JS注入/高亮库）
export function getSettings() {
    return request('GET', '/api/settings')
}

// 获取默认 JS 注入代码（供「恢复默认」按钮使用）
export function getDefaultJs() {
    return request('GET', '/api/settings/default-js')
}

// 更新系统配置（仅 admin）
export function updateSettings(payload) {
    return request('PUT', '/api/settings', payload)
}

// 上传图片（base64），返回 { url }，用于 anscard 自定义图等
export function uploadImage(image, fileName) {
    return request('POST', '/api/settings/upload-image', { image, fileName })
}

// 上传站点图标 favicon（仅 admin）：存盘、删旧图、更新配置，返回 { url }
export function uploadFavicon(image) {
    return request('POST', '/api/settings/upload-favicon', { image })
}

// 恢复默认 favicon（仅 admin）：删除已上传图标，配置清空回退到 /favicon.svg
export function resetFavicon() {
    return request('DELETE', '/api/settings/favicon')
}
