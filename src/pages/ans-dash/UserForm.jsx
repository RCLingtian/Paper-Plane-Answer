import { useEffect, useState } from 'react'
import { Form, Input, Button, Space, Select, message } from 'antd'
import * as usersApi from '../../api/users'
import * as schoolsApi from '../../api/schools'

// 同时支持两种用法：
// 1. 路由模式：不传 props（保留兼容，但目前无路由使用）
// 2. Modal 模式：父组件传 onSuccess/onCancel
// 3. 编辑模式：传 user（待编辑的用户对象），此时密码可选
export default function UserForm({ user, onSuccess, onCancel }) {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [schools, setSchools] = useState([])
    const [classes, setClasses] = useState([])
    // 是否在 Modal 内：决定提交后的行为
    const inModal = onSuccess !== undefined
    const isEdit = !!user

    useEffect(() => {
        schoolsApi.listSchools().then((res) => {
            if (res.code === 200) setSchools(res.data)
        })
    }, [])

    // 编辑模式：初始挂载时根据 user.schoolId 联动加载班级
    useEffect(() => {
        if (!user) return
        const init = { ...user }
        if (user.schoolId) {
            schoolsApi.listClasses(user.schoolId).then((res) => {
                if (res.code === 200) setClasses(res.data)
            })
        }
        form.setFieldsValue(init)
    }, [user, form])

    // 选中学校后联动加载班级
    async function handleSchoolChange(schoolId) {
        form.setFieldValue('classId', undefined)
        if (!schoolId) {
            setClasses([])
            return
        }
        const res = await schoolsApi.listClasses(schoolId)
        if (res.code === 200) setClasses(res.data)
    }

    async function onFinish(values) {
        setLoading(true)
        let res
        if (isEdit) {
            // 编辑模式：密码留空则不传，避免误改密码
            const payload = { ...values }
            if (!payload.password) delete payload.password
            res = await usersApi.updateUser(user.userId, payload)
        } else {
            res = await usersApi.createUser({
                email: values.email,
                account: values.account,
                password: values.password,
                nickname: values.nickname,
                gender: values.gender,
                schoolId: values.schoolId,
                classId: values.classId,
                role: 'user'
            })
        }
        setLoading(false)
        if (res.code === 200) {
            message.success(isEdit ? '用户更新成功' : '用户创建成功')
            if (inModal && onSuccess) onSuccess()
        } else {
            message.error(res.msg)
        }
    }

    function handleCancel() {
        if (inModal && onCancel) onCancel()
    }

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            style={inModal ? undefined : { maxWidth: 560, margin: '0 auto' }}
        >
            <Form.Item label="邮箱" name="email" rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' }
            ]}>
                <Input placeholder="user@example.com" />
            </Form.Item>
            <Form.Item label="账户名" name="account" rules={[
                { required: true, message: '请输入账户名' },
                { min: 3, message: '至少 3 个字符' },
                { max: 20, message: '不超过 20 个字符' },
                { pattern: /^[a-zA-Z0-9_]+$/, message: '仅支持字母、数字、下划线' }
            ]}>
                <Input placeholder="用于登录" />
            </Form.Item>
            <Form.Item
                label={isEdit ? '密码（留空则不修改）' : '密码'}
                name="password"
                rules={isEdit
                    ? []   // 编辑时密码可选
                    : [
                        { required: true, message: '请输入密码' },
                        { min: 6, message: '至少 6 位' }
                    ]
                }
            >
                <Input.Password placeholder={isEdit ? '留空保持原密码' : '至少 6 位'} />
            </Form.Item>
            <Form.Item label="昵称" name="nickname" rules={[
                { required: true, message: '请输入昵称' },
                { pattern: /^[^<>]*$/, message: '昵称不能包含 < > 字符' }
            ]}>
                <Input placeholder="显示名称" />
            </Form.Item>
            <Form.Item label="性别" name="gender" rules={[{ required: true, message: '请选择性别' }]}>
                <Select placeholder="请选择" options={[
                    { value: 'male', label: '男' },
                    { value: 'female', label: '女' },
                    { value: 'unknown', label: '保密' }
                ]} />
            </Form.Item>
            <Form.Item label="所属学校" name="schoolId">
                <Select
                    placeholder="请选择学校"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={schools.map((s) => ({ value: s.schoolId, label: s.name }))}
                    onChange={handleSchoolChange}
                />
            </Form.Item>
            <Form.Item label="班级" name="classId">
                <Select
                    placeholder={classes.length === 0 ? '请先选择学校' : '请选择班级'}
                    allowClear
                    disabled={classes.length === 0}
                    options={classes.map((c) => ({ value: c.classId, label: `${c.grade}·${c.name}` }))}
                />
            </Form.Item>
            <Form.Item>
                <Space>
                    <Button type="primary" htmlType="submit" loading={loading}>
                        {isEdit ? '保存' : '创建'}
                    </Button>
                    <Button onClick={handleCancel}>取消</Button>
                </Space>
            </Form.Item>
        </Form>
    )
}
