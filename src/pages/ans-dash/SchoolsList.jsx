import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Space, Input, Modal, Form, Select, Popconfirm, message, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, BankOutlined } from '@ant-design/icons'
import * as schoolsApi from '../../api/schools'

// 学校类型映射：value → 中文标签 + 颜色
const SCHOOL_TYPES = [
    { value: 'primary', label: '小学' },
    { value: 'junior', label: '初中' },
    { value: 'senior', label: '高中' },
    { value: 'vocational', label: '中专' },
    { value: 'college', label: '大学' }
]
const typeLabel = (v) => SCHOOL_TYPES.find((t) => t.value === v)?.label || '高中'
const typeColor = { primary: 'green', junior: 'blue', senior: 'gold', vocational: 'purple', college: 'magenta' }

export default function SchoolsList() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState([])
    const [keyword, setKeyword] = useState('')
    const [typeFilter, setTypeFilter] = useState(undefined)
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form] = Form.useForm()
    const [submitting, setSubmitting] = useState(false)

    // 统一处理学校列表结果：load() 与 effect 共用
    function applyResult(res) {
        setLoading(false)
        if (res.code === 200) setData(res.data)
        else message.error(res.msg)
    }

    // 提交/删除后刷新用：会先显示 loading
    async function load() {
        setLoading(true)
        applyResult(await schoolsApi.listSchools({ keyword, type: typeFilter || '' }))
    }

    // 类型筛选变化时拉取：setstates 都在 await 后的异步回调中，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await schoolsApi.listSchools({ keyword, type: typeFilter || '' })
            if (!cancelled) applyResult(res)
        })()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typeFilter])

    function openCreate() {
        setEditing(null)
        setModalOpen(true)
    }

    function openEdit(record) {
        setEditing(record)
        setModalOpen(true)
    }

    async function handleSubmit() {
        const values = await form.validateFields()
        setSubmitting(true)
        const res = editing
            ? await schoolsApi.updateSchool(editing.schoolId, values)
            : await schoolsApi.createSchool(values)
        setSubmitting(false)
        if (res.code === 200) {
            message.success(editing ? '更新成功' : '创建成功')
            setModalOpen(false)
            load()
        } else {
            message.error(res.msg)
        }
    }

    async function handleDelete(schoolId) {
        const res = await schoolsApi.deleteSchool(schoolId)
        if (res.code === 200) {
            message.success('删除成功')
            load()
        } else {
            message.error(res.msg)
        }
    }

    const columns = [
        { title: '学校名称', dataIndex: 'name', render: (t) => <strong>{t}</strong> },
        {
            title: '类型', dataIndex: 'schoolType', width: 90,
            render: (t) => <Tag color={typeColor[t] || 'default'}>{typeLabel(t)}</Tag>
        },
        { title: '地址', dataIndex: 'address', ellipsis: true },
        { title: '创建时间', dataIndex: 'createTime', width: 160 },
        {
            title: '操作', key: 'action', width: 280, fixed: 'right',
            render: (_, record) => (
                <Space>
                    <Button size="small" icon={<TeamOutlined />} onClick={() => navigate(`/ans-dash/schools/${record.schoolId}/users`)}>
                        用户
                    </Button>
                    <Button size="small" icon={<BankOutlined />} onClick={() => navigate(`/ans-dash/schools/${record.schoolId}/classes`)}>
                        班级
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                    <Popconfirm title="确认删除该学校？班级将一并删除" onConfirm={() => handleDelete(record.schoolId)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ]

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>学校管理</h2>
                <Space>
                    <Select
                        placeholder="按类型筛选"
                        allowClear
                        style={{ width: 130 }}
                        value={typeFilter}
                        onChange={(v) => setTypeFilter(v)}
                        options={SCHOOL_TYPES}
                    />
                    <Input
                        placeholder="搜索学校名/地址"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onPressEnter={load}
                        allowClear
                        style={{ width: 220 }}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建学校</Button>
                </Space>
            </div>
            <Table
                rowKey="schoolId"
                columns={columns}
                dataSource={data}
                loading={loading}
                pagination={false}
                size="middle"
                scroll={{ x: 'max-content' }}
            />

            <Modal
                title={editing ? '编辑学校' : '新建学校'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={submitting}
                okText={editing ? '更新' : '创建'}
                cancelText="取消"
            >
                <Form
                    // editing 变化时让 Form 重新挂载，配合 initialValues 直接填充原值，
                    // 避免首次打开时 Form.Item 未注册导致 setFieldsValue 丢失
                    key={editing ? editing.schoolId : 'new'}
                    form={form}
                    layout="vertical"
                    preserve={false}
                    initialValues={editing || { schoolType: 'senior' }}
                >
                    <Form.Item label="学校名称" name="name" rules={[{ required: true, message: '请输入学校名称' }]}>
                        <Input placeholder="如：北京一中" />
                    </Form.Item>
                    <Form.Item label="学校类型" name="schoolType" rules={[{ required: true, message: '请选择学校类型' }]}>
                        <Select placeholder="请选择" options={SCHOOL_TYPES} />
                    </Form.Item>
                    <Form.Item label="地址" name="address">
                        <Input placeholder="可选" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    )
}
