import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { message } from 'antd'
import { useAuth } from './useAuth'

// 角色不匹配 → 弹提示并跳回 /ans-dash
export default function RoleGuard({ roles, children }) {
    const { user } = useAuth()
    const allowed = user && roles.includes(user.role)
    useEffect(() => {
        if (!allowed) {
            message.error('无权限访问该模块')
        }
    }, [allowed])
    if (!allowed) {
        return <Navigate to="/ans-dash" replace />
    }
    return children
}
