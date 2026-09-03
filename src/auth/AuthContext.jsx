import { createContext, useEffect, useReducer } from 'react'
import * as authApi from '../api/auth'

const TOKEN_KEY = 'ans_dash_token'
// 上下文对象与 Provider 同文件：仅开发态 HMR 提示，运行无影响
// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null)

function reducer(state, action) {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, loading: action.value }
        case 'SET_AUTH':
            return { loading: false, token: action.token, user: action.user }
        case 'PATCH_USER':
            // 局部更新当前用户字段（如改密后清除 forcePasswordChange）
            return { ...state, user: state.user ? { ...state.user, ...action.patch } : state.user }
        case 'CLEAR':
            return { loading: false, token: null, user: null }
        default:
            return state
    }
}

export function AuthProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, {
        token: localStorage.getItem(TOKEN_KEY),
        user: null,
        loading: !!localStorage.getItem(TOKEN_KEY)
    })

    // 初始化：有 token 就恢复用户信息
    useEffect(() => {
        const token = localStorage.getItem(TOKEN_KEY)
        if (!token) {
            dispatch({ type: 'SET_LOADING', value: false })
            return
        }
        authApi.getCurrentUser().then((res) => {
            if (res.code === 200) {
                dispatch({ type: 'SET_AUTH', token, user: res.data })
            } else {
                localStorage.removeItem(TOKEN_KEY)
                dispatch({ type: 'CLEAR' })
            }
        })
    }, [])

    async function login(email, password) {
        const res = await authApi.login(email, password)
        if (res.code === 200) {
            localStorage.setItem(TOKEN_KEY, res.data.token)
            dispatch({ type: 'SET_AUTH', token: res.data.token, user: res.data.user })
        }
        return res
    }

    // 局部更新当前用户信息（改密成功后清除强制改密标记）
    function patchUser(patch) {
        dispatch({ type: 'PATCH_USER', patch })
    }

    async function logout() {
        await authApi.logout()
        localStorage.removeItem(TOKEN_KEY)
        dispatch({ type: 'CLEAR' })
    }

    return (
        <AuthContext.Provider value={{ ...state, login, logout, patchUser }}>
            {children}
        </AuthContext.Provider>
    )
}
