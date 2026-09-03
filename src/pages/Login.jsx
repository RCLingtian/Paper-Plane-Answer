import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, Button, message } from 'antd'
import { LockOutlined, MailOutlined, ReadOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/useAuth'
import './Login.css'

export default function Login() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const [loading, setLoading] = useState(false)

    async function onFinish({ email, password }) {
        setLoading(true)
        const res = await login(email, password)
        setLoading(false)
        if (res.code !== 200) {
            message.error(res.msg)
            return
        }
        message.success(`欢迎回来，${res.data.user.nickname}`)
        const from = params.get('from') || '/ans-dash'
        navigate(from, { replace: true })
    }

    return (
        <div className="login-page">
            <Card className="login-card" variant="borderless">
                <div className="login-brand">
                    <div className="login-logo"><ReadOutlined /></div>
                    <h1 className="login-title">纸条答案 · 后台登录</h1>
                </div>
                <Form layout="vertical" onFinish={onFinish}>
                    <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
                        <Input prefix={<MailOutlined />} placeholder="请输入邮箱" autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                        <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} size="large">登录</Button>
                </Form>
                <div className="login-hint">
                    <Link to="/">返回首页</Link>
                </div>
            </Card>
        </div>
    )
}
