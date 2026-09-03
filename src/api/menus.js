import { request } from './request'

export function listMenus() {
    return request('GET', '/api/menus')
}

export function createMenu(payload) {
    return request('POST', '/api/menus', payload)
}

export function updateMenu(menuId, payload) {
    return request('PUT', `/api/menus/${menuId}`, payload)
}

export function deleteMenu(menuId) {
    return request('DELETE', `/api/menus/${menuId}`)
}
