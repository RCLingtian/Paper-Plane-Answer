import { useEffect, useState } from 'react'
import { Table, Button, Space, Input, Tag, Popconfirm, Modal, message, Typography, Select } from 'antd'
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import * as usersApi from '../../api/users'
import * as schoolsApi from '../../api/schools'
import UserForm from './UserForm'

const { Text } = Typography

const genderMap = { male: '男', female: '女', unknown: '未知' }
const genderColor = { male: 'blue', female: 'magenta', unknown: 'default' }

export default function UsersList() {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [keyword, setKeyword] = useState('')
    const [statusFilter, setStatusFilter] = useState(undefined)
    const [schools, setSchools] = useState([])
    // 创建用户 Modal
    const [modalOpen, setModalOpen] = useState(false)
    // 编辑用户 Modal
    const [editModalOpen, setEditModalOpen] = useState(false)
    const [editingUser, setEditingUser] = useState(null)

    // 统一处理用户列表结果：load() 与 effect 共用
    function applyResult(res) {
        setLoading(false)
        if (res.code === 200) {
            setData(res.data.list)
            setTotal(res.data.total)
        } else {
            message.error(res.msg)
        }
    }

    // 切换/搜索后刷新用：会先显示 loading
    async function load() {
        setLoading(true)
        applyResult(await usersApi.listUsers({ page, pageSize, keyword, status: statusFilter }))
    }

    // 挂载时拉取学校下拉数据：setstate 在 await 后，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await schoolsApi.listSchools()
            if (!cancelled && res.code === 200) setSchools(res.data)
        })()
        return () => { cancelled = true }
    }, [])

    // 分页/状态筛选变化时拉取：setstates 都在 await 后的异步回调中，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await usersApi.listUsers({ page, pageSize, keyword, status: statusFilter })
            if (!cancelled) applyResult(res)
        })()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, statusFilter])

    async function handleToggle(userId, current) {
        const next = current === 'active' ? 'disabled' : 'active'
        const res = await usersApi.toggleUser(userId, next)
        if (res.code === 200) {
            message.success(next === 'active' ? '已启用' : '已停用')
            load()
        } else {
            message.error(res.msg)
        }
    }

    async function handleDelete(userId) {
        const res = await usersApi.deleteUser(userId)
        if (res.code === 200) {
            message.success('删除成功')
            load()
        } else {
            message.error(res.msg)
        }
    }

    // Modal 提交成功：关闭并刷新
    function handleCreateSuccess() {
        setModalOpen(false)
        load()
    }

    // 编辑 Modal 提交成功：关闭并刷新
    function handleEditSuccess() {
        setEditModalOpen(false)
        setEditingUser(null)
        load()
    }

    function openEdit(record) {
        setEditingUser(record)
        setEditModalOpen(true)
    }

    const schoolName = (id) => schools.find((s) => s.schoolId === id)?.name || '-'

    const columns = [
        { title: '昵称', dataIndex: 'nickname', render: (t) => <Text strong>{t}</Text> },
        { title: '账户名', dataIndex: 'account', width: 120 },
        { title: '邮箱', dataIndex: 'email', width: 200 },
        { title: '性别', dataIndex: 'gender', width: 70, render: (g) => <Tag color={genderColor[g]}>{genderMap[g]}</Tag> },
        { title: '所属学校', dataIndex: 'schoolId', width: 140, render: (id) => schoolName(id) },
        { title: '角色', dataIndex: 'role', width: 90, render: (r) => <Tag color={r === 'admin' ? 'gold' : 'default'}>{r === 'admin' ? '管理员' : '普通用户'}</Tag> },
        {
            title: '状态', dataIndex: 'status', width: 90,
            render: (s) => <Tag color={s === 'active' ? 'green' : 'red'}>{s === 'active' ? '启用' : '停用'}</Tag>
        },
        { title: '创建时间', dataIndex: 'createTime', width: 150 },
        {
            title: '操作', key: 'action', width: 240, fixed: 'right',
            render: (_, record) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                    <Popconfirm
                        title={record.status === 'active' ? '确认停用该用户？' : '确认启用该用户？'}
                        onConfirm={() => handleToggle(record.userId, record.status)}
                        okText="确认" cancelText="取消"
                    >
                        <Button size="small" danger={record.status === 'active'} type={record.status === 'active' ? 'default' : 'primary'}>
                            {record.status === 'active' ? '停用' : '启用'}
                        </Button>
                    </Popconfirm>
                    {/* 管理员账号受保护，不显示删除 */}
                    {record.role !== 'admin' && (
                        <Popconfirm
                            title="确认删除该用户？此操作不可恢复"
                            onConfirm={() => handleDelete(record.userId)}
                            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
                        >
                            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                        </Popconfirm>
                    )}
                </Space>
            )
        }
    ]

    return (
        <div>
            <div className="ans-list-toolbar">
                <h2 className="ans-list-title">用户管理</h2>
                <Space>
                    <Select
                        placeholder="状态筛选"
                        allowClear
                        style={{ width: 140 }}
                        value={statusFilter}
                        onChange={(v) => { setStatusFilter(v); setPage(1) }}
                        options={[
                            { value: 'active', label: '启用' },
                            { value: 'disabled', label: '停用' }
                        ]}
                    />
                    <Input
                        className="ans-list-search"
                        placeholder="搜索昵称/邮箱/账户"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onPressEnter={() => { setPage(1); load() }}
                        allowClear
                        suffix={<SearchOutlined onClick={() => { setPage(1); load() }} style={{ cursor: 'pointer' }} />}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>创建用户</Button>
                </Space>
            </div>
            <Table
                rowKey="userId"
                columns={columns}
                dataSource={data}
                loading={loading}
                scroll={{ x: 'max-content' }}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps) }
                }}
                size="middle"
            />

            {/* 创建用户：浮动窗口，内嵌 UserForm（Modal 模式） */}
            <Modal
                title="创建用户"
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={null}   // 用 UserForm 内部的提交/取消按钮
                width={560}
                className="ans-modal"
                destroyOnClose
                maskClosable={false}
            >
                <UserForm
                    onSuccess={handleCreateSuccess}
                    onCancel={() => setModalOpen(false)}
                />
            </Modal>

            {/* 编辑用户：内嵌 UserForm（编辑模式，传 user） */}
            <Modal
                title="编辑用户"
                open={editModalOpen}
                onCancel={() => { setEditModalOpen(false); setEditingUser(null) }}
                footer={null}
                width={560}
                className="ans-modal"
                destroyOnClose
                maskClosable={false}
            >
                {editingUser && (
                    <UserForm
                        user={editingUser}
                        onSuccess={handleEditSuccess}
                        onCancel={() => { setEditModalOpen(false); setEditingUser(null) }}
                    />
                )}
            </Modal>
        </div>
    )
}
