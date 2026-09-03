import { useState } from 'react'
import { Modal, Form, Input, Button, Alert, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useAuth } from './useAuth'
import * as authApi from '../api/auth'

// 强制改密闸门：当前登录用户 forcePasswordChange=1（内置管理员首次登录/密码被重置）时，
// 弹出不可关闭的改密弹窗，未修改成功前无法操作任何功能。
// 后端同步拦截：标记为 1 时除改密/登出等接口外一律 403，前后端双重保证。
export default function ForcePasswordGate() {
    const { user, patchUser, logout } = useAuth()
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const needChange = !!user && Number(user.forcePasswordChange) === 1

    async function onFinish(vals) {
        setLoading(true)
        const res = await authApi.changePassword({
            oldPassword: vals.oldPassword,
            newPassword: vals.newPassword
        })
        setLoading(false)
        if (res.code !== 200) {
            message.error(res.msg)
            return
        }
        message.success('密码修改成功，请妥善保管新密码')
        form.resetFields()
        patchUser({ forcePasswordChange: 0 })
    }

    return (
        <Modal
            open={needChange}
            title="首次登录，请先修改密码"
            closable={false}
            maskClosable={false}
            keyboard={false}
            footer={null}
            width={420}
            centered
            destroyOnClose
        >
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="当前使用的是初始密码"
                description="为保证账号安全，必须先修改密码才能继续使用系统。修改成功后将自动进入系统。"
            />
            <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
                <Form.Item
                    name="oldPassword"
                    label="原密码"
                    rules={[{ required: true, message: '请输入原密码（登录用的初始密码）' }]}
                >
                    <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="登录使用的初始密码"
                        autoComplete="current-password"
                    />
                </Form.Item>
                <Form.Item
                    name="newPassword"
                    label="新密码"
                    rules={[
                        { required: true, message: '请输入新密码' },
                        { min: 6, message: '新密码至少 6 位' }
                    ]}
                >
                    <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="至少 6 位，请勿与原密码相同"
                        autoComplete="new-password"
                    />
                </Form.Item>
                <Form.Item
                    name="confirmPassword"
                    label="确认新密码"
                    dependencies={['newPassword']}
                    rules={[
                        { required: true, message: '请再次输入新密码' },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || value === getFieldValue('newPassword')) return Promise.resolve()
                                return Promise.reject(new Error('两次输入的新密码不一致'))
                            }
                        })
                    ]}
                >
                    <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="再次输入新密码"
                        autoComplete="new-password"
                    />
                </Form.Item>
                <Button type="primary" htmlType="submit" block loading={loading} size="large">
                    确认修改并进入系统
                </Button>
                <Button block type="link" danger onClick={logout} style={{ marginTop: 8 }}>
                    退出登录
                </Button>
            </Form>
        </Modal>
    )
}
