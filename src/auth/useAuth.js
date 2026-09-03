import { useContext } from 'react'
import { AuthContext } from './AuthContext'

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
    return ctx
}
