import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Table, Button, Space, Modal, Form, Input, InputNumber, Switch, Select, Popconfirm, message, Breadcrumb, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import * as menusApi from '../../api/menus'

export default function MenusManage() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState([])
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form] = Form.useForm()
    const [submitting, setSubmitting] = useState(false)

    // 统一处理菜单树结果：load() 与 effect 共用
    function applyResult(res) {
        setLoading(false)
        if (res.code === 200) setData(res.data)
        else message.error(res.msg)
    }

    // 提交/删除后刷新用：会先显示 loading
    async function load() {
        setLoading(true)
        applyResult(await menusApi.listMenus())
    }

    // 挂载时拉取：setstates 都在 await 后的异步回调中，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await menusApi.listMenus()
            if (!cancelled) applyResult(res)
        })()
        return () => { cancelled = true }
    }, [])

    // 顶级菜单：用于父菜单下拉（二级菜单只能挂在顶级下）
    const topMenus = data

    function openCreate() {
        setEditing(null)
        form.resetFields()
        setModalOpen(true)
    }

    function openEdit(record) {
        setEditing(record)
        form.setFieldsValue({
            text: record.text,
            url: record.url,
            openInNewTab: record.openInNewTab,
            externalLink: record.externalLink,
            parentId: record.parentId || null,
            sortOrder: record.sortOrder
        })
        setModalOpen(true)
    }

    async function handleSubmit() {
        const values = await form.validateFields()
        setSubmitting(true)
        const res = editing
            ? await menusApi.updateMenu(editing.menuId, values)
            : await menusApi.createMenu(values)
        setSubmitting(false)
        if (res.code === 200) {
            message.success(editing ? '更新成功' : '创建成功')
            setModalOpen(false)
            load()
        } else {
            message.error(res.msg)
        }
    }

    async function handleDelete(menuId) {
        const res = await menusApi.deleteMenu(menuId)
        if (res.code === 200) {
            message.success('删除成功')
            load()
        } else {
            message.error(res.msg)
        }
    }

    const columns = [
        { title: '文本', dataIndex: 'text', render: (t) => <strong>{t}</strong> },
        { title: '地址', dataIndex: 'url', ellipsis: true },
        { title: '新标签页', dataIndex: 'openInNewTab', width: 100, render: (v) => v ? <Tag color="blue" bordered={false}>是</Tag> : '否' },
        { title: '外链', dataIndex: 'externalLink', width: 80, render: (v) => v ? <Tag color="blue" bordered={false}>是</Tag> : '否' },
        { title: '排序', dataIndex: 'sortOrder', width: 80 },
        {
            title: '操作', key: 'action', width: 200,
            render: (_, record) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                    <Popconfirm
                        title="确认删除该菜单？其二级子菜单也会一并删除"
                        onConfirm={() => handleDelete(record.menuId)}
                        okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ]

    return (
        <div>
            <Breadcrumb
                items={[
                    { title: <Link to="/ans-dash">后台</Link> },
                    { title: '菜单管理' }
                ]}
                style={{ marginBottom: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>菜单管理</h2>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增菜单</Button>
            </div>
            <Table
                rowKey="menuId"
                loading={loading}
                columns={columns}
                dataSource={data}
                childrenColumnName="children"
                pagination={false}
            />
            <Modal
                title={editing ? '编辑菜单' : '新增菜单'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={() => setModalOpen(false)}
                confirmLoading={submitting}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ openInNewTab: false, externalLink: false, sortOrder: 0, parentId: null }}
                >
                    <Form.Item label="菜单文本" name="text" rules={[{ required: true, message: '请输入菜单文本' }]}>
                        <Input placeholder="如 推荐" maxLength={30} />
                    </Form.Item>
                    <Form.Item label="地址" name="url" rules={[{ required: true, message: '请输入地址' }]}>
                        <Input placeholder="如 / 或 https://..." />
                    </Form.Item>
                    <Form.Item label="父菜单（留空为顶级，选择某顶级则为二级菜单）" name="parentId">
                        <Select placeholder="留空为顶级菜单" allowClear>
                            {topMenus.map((m) => (
                                <Select.Option
                                    key={m.menuId}
                                    value={m.menuId}
                                    disabled={editing && editing.menuId === m.menuId}
                                >
                                    {m.text}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item label="排序（数字越小越靠前）" name="sortOrder">
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Space size="large">
                        <Form.Item label="在新标签页打开" name="openInNewTab" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item label="外链" name="externalLink" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>
        </div>
    )
}
