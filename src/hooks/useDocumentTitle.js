import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// 站点名：首页只显示站点名，其余页面为「页面名 | 站点名」
export const SITE_NAME = '纸条答案'

// 路由 → 页面名配置（单一来源，新增页面在此加一行即可）
// 按数组顺序做前缀匹配，长路径/特殊路径放前面
const ROUTE_TITLES = [
    { match: '/login', title: '登录' },
    { match: '/reg', title: '注册' },
    { match: '/go', title: '外链跳转' },
    { match: '/view/', title: '答案详情' },
    { match: '/ans-dash/settings', title: '系统配置' },
    { match: '/ans-dash/menus', title: '菜单管理' },
    { match: '/ans-dash/files', title: '资源管理' },
    { match: '/ans-dash/users', title: '用户管理' },
    { match: '/ans-dash/schools', title: '学校管理' }, // 班级管理/学校用户在下方特判
    { match: '/ans-dash/ans', title: '答案管理' },
    { match: '/ans-dash', title: '后台管理' }
]

function resolveTitle(pathname) {
    // 学校模块的两个二级页特判（与 DashLayout 面包屑命名保持一致）
    if (pathname.startsWith('/ans-dash/schools/')) {
        if (pathname.includes('/classes')) return '班级管理'
        if (pathname.includes('/users')) return '学校用户'
        return '学校管理'
    }
    for (const item of ROUTE_TITLES) {
        if (pathname === item.match || pathname.startsWith(item.match)) return item.title
    }
    // 首页只显示站点名；其余未匹配路由即 404
    return pathname === '/' ? null : '页面不存在'
}

// 在 App 根部调用一次：路由切换时自动更新 document.title
export function useDocumentTitle() {
    const { pathname } = useLocation()
    useEffect(() => {
        const page = resolveTitle(pathname)
        document.title = page ? `${page} | ${SITE_NAME}` : SITE_NAME
    }, [pathname])
}
