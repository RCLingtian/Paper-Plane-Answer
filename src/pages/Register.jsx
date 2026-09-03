import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, Button, Select, Alert, message } from 'antd'
import { LockOutlined, MailOutlined, UserOutlined, ReadOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/useAuth'
import * as authApi from '../api/auth'
// 复用登录页样式：卡片、标题、提示区视觉一致
import './Login.css'

export default function Register() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const [loading, setLoading] = useState(false)
    // 是否开放注册：管理员关闭时，即便用户通过 URL 直达也提示并禁用表单
    const [allowRegister, setAllowRegister] = useState(true)
    const [checking, setChecking] = useState(true)

    // 进入注册页先查询开放注册状态
    useEffect(() => {
        authApi.registerStatus()
            .then((res) => {
                if (res.code === 200) setAllowRegister(res.data.allowRegister)
            })
            .catch(() => { /* 读取失败默认开放 */ })
            .finally(() => setChecking(false))
    }, [])

    async function onFinish(values) {
        if (!allowRegister) {
            message.error('管理员未开放注册')
            return
        }
        setLoading(true)
        try {
            // 1. 注册
            const regRes = await authApi.register({
                email: values.email,
                account: values.account,
                password: values.password,
                nickname: values.nickname,
                gender: values.gender
            })
            if (regRes.code !== 200) {
                // 后端二次校验：返回「管理员未开放注册」等提示
                message.error(regRes.msg)
                return
            }
            // 2. 注册成功后自动登录，体验更顺滑
            const loginRes = await login(values.email, values.password)
            if (loginRes.code !== 200) {
                message.success('注册成功，请登录')
                navigate(`/login?from=${params.get('from') || '/'}`, { replace: true })
                return
            }
            message.success(`欢迎加入，${loginRes.data.user.nickname}`)
            const from = params.get('from') || '/'
            navigate(from, { replace: true })
        } finally {
            setLoading(false)
        }
    }

    // 管理员关闭注册：显示提示，禁用表单
    if (!checking && !allowRegister) {
        return (
            <div className="login-page">
                <Card className="login-card" variant="borderless">
                    <div className="login-brand">
                        <div className="login-logo"><ReadOutlined /></div>
                        <h1 className="login-title">纸条答案 · 注册</h1>
                    </div>
                    <Alert
                        type="warning" showIcon
                        message="管理员未开放注册"
                        description="当前注册入口已被管理员关闭，暂无法自助注册账号。如有需要，请联系管理员。"
                        style={{ marginBottom: 16 }}
                    />
                    <div className="login-hint" style={{ justifyContent: 'center' }}>
                        <Link to={`/login?from=${encodeURIComponent(params.get('from') || '/')}`}>去登录</Link>
                        <Link to="/">返回首页</Link>
                    </div>
                </Card>
            </div>
        )
    }

    return (
        <div className="login-page">
            <Card className="login-card" variant="borderless">
                <div className="login-brand">
                    <div className="login-logo"><ReadOutlined /></div>
                    <h1 className="login-title">纸条答案 · 注册</h1>
                </div>
                <Form
                    layout="vertical"
                    onFinish={onFinish}
                    initialValues={{ gender: 'unknown' }}
                    disabled={checking}
                >
                    <Form.Item name="email" label="邮箱" rules={[
                        { required: true, message: '请输入邮箱' },
                        { type: 'email', message: '邮箱格式不正确' }
                    ]}>
                        <Input prefix={<MailOutlined />} placeholder="请输入邮箱" autoComplete="email" />
                    </Form.Item>
                    <Form.Item name="account" label="账户名" rules={[
                        { required: true, message: '请输入账户名' },
                        { min: 3, message: '至少 3 个字符' },
                        { max: 20, message: '不超过 20 个字符' },
                        { pattern: /^[a-zA-Z0-9_]+$/, message: '仅支持字母、数字、下划线' }
                    ]}>
                        <Input prefix={<UserOutlined />} placeholder="用于登录" autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="nickname" label="昵称" rules={[
                        { required: true, message: '请输入昵称' },
                        { max: 20, message: '不超过 20 个字符' },
                        { pattern: /^[^<>]*$/, message: '昵称不能包含 < > 字符' }
                    ]}>
                        <Input placeholder="展示名称" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[
                        { required: true, message: '请输入密码' },
                        { min: 6, message: '至少 6 位' }
                    ]}>
                        <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item name="confirm" label="确认密码" dependencies={['password']} rules={[
                        { required: true, message: '请再次输入密码' },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('password') === value) {
                                    return Promise.resolve()
                                }
                                return Promise.reject(new Error('两次输入的密码不一致'))
                            }
                        })
                    ]}>
                        <Input.Password prefix={<LockOutlined />} placeholder="再次输入密码" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item name="gender" label="性别">
                        <Select options={[
                            { value: 'male', label: '男' },
                            { value: 'female', label: '女' },
                            { value: 'unknown', label: '保密' }
                        ]} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading}>注册</Button>
                </Form>
                <div className="login-hint">
                    <span>已有账号？<Link to={`/login?from=${encodeURIComponent(params.get('from') || '/')}`}>去登录</Link></span>
                    <Link to="/">返回首页</Link>
                </div>
            </Card>
        </div>
    )
}
