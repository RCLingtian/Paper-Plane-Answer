import { useEffect, useState } from 'react'
import * as menusApi from '../api/menus'

// 顶部导航菜单缓存键（localStorage）
const CACHE_KEY = 'ans_dash_menus'
// 首次访问（本地无缓存）时的内置兜底菜单，与后端种子一致，
// 保证导航栏在网络请求返回前就瞬间可见，不出现空白闪烁
const FALLBACK_MENUS = [
    {
        menuId: 'builtin-home',
        parentId: null,
        text: '首页',
        url: '/',
        openInNewTab: false,
        externalLink: false,
        sortOrder: 1,
        children: []
    }
]

// 模块级内存缓存：同一次会话内多个页面（Home/View/Go）共享，避免重复请求
let memoryCache = null
let inflight = null

function readCache() {
    if (memoryCache) return memoryCache
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (raw) {
            memoryCache = JSON.parse(raw)
            return memoryCache
        }
    } catch { /* 缓存损坏则忽略，走兜底 */ }
    return null
}

function writeCache(data) {
    memoryCache = data
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* 存储不可用忽略 */ }
}

// 后台拉取菜单；并发调用共享同一个 Promise，避免多组件同时挂载时重复请求
function fetchMenus() {
    if (!inflight) {
        inflight = menusApi.listMenus()
            .then((res) => {
                if (res.code === 200 && Array.isArray(res.data)) writeCache(res.data)
                return res
            })
            .catch((err) => err)
            .finally(() => { inflight = null })
    }
    return inflight
}

// 后台菜单增删改后调用：使缓存失效，下次渲染即拉取最新
export function invalidateMenus() {
    memoryCache = null
    try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

// 顶部导航菜单：缓存优先渲染 + 后台静默更新（stale-while-revalidate）
export function useMenus() {
    const [menus, setMenus] = useState(() => readCache() || FALLBACK_MENUS)

    useEffect(() => {
        let cancelled = false
        fetchMenus().then((res) => {
            if (!cancelled && res && res.code === 200 && Array.isArray(res.data)) {
                setMenus(res.data)
            }
        })
        return () => { cancelled = true }
    }, [])

    return menus
}
