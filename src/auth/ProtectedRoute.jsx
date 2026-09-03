import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth } from './useAuth'

// 未登录 → 跳登录页并携带 from；加载中显示 Spin
// 已登录 → 渲染 children（DashLayout），由 children 内部的 <Outlet/> 渲染子路由
export default function ProtectedRoute({ children }) {
    const { user, loading } = useAuth()
    const location = useLocation()
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin tip="加载中..." size="large" />
            </div>
        )
    }
    if (!user) {
        const from = encodeURIComponent(location.pathname + location.search)
        return <Navigate to={`/login?from=${from}`} replace />
    }
    return children
}
