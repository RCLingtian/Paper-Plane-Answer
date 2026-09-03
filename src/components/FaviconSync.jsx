import { useEffect } from 'react'
import * as settingsApi from '../api/settings'

// 默认站点图标（public/favicon.svg，构建时复制到 dist 根）
export const DEFAULT_FAVICON = '/favicon.svg'

// 根据扩展名推断 MIME，写回 <link type>
function mimeOf(href) {
    if (/\.svg(\?|#|$)/i.test(href)) return 'image/svg+xml'
    if (/\.png(\?|#|$)/i.test(href)) return 'image/png'
    if (/\.ico(\?|#|$)/i.test(href)) return 'image/x-icon'
    if (/\.gif(\?|#|$)/i.test(href)) return 'image/gif'
    if (/\.webp(\?|#|$)/i.test(href)) return 'image/webp'
    if (/\.jpe?g(\?|#|$)/i.test(href)) return 'image/jpeg'
    return ''
}

// 直接操作 <link rel="icon">：上传/恢复成功后立即生效，无需刷新
export function applyFavicon(url) {
    const href = url || DEFAULT_FAVICON
    let link = document.querySelector('link[rel="icon"]')
    if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
    }
    link.href = href
    const type = mimeOf(href)
    if (type) link.type = type
    else link.removeAttribute('type')
}

// 挂载在 App 根部：读取后台配置的 favicon 并应用（所有页面共用一个标签图标）
export default function FaviconSync() {
    useEffect(() => {
        settingsApi.getSettings()
            .then((res) => {
                if (res.code === 200) applyFavicon(res.data.faviconUrl || '')
            })
            .catch(() => { /* 读取失败保持默认 favicon.svg */ })
    }, [])
    return null
}
