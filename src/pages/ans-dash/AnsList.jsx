import { useEffect, useState } from 'react'
import { Table, Button, Space, Input, Modal, Popconfirm, message, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import * as ansApi from '../../api/ans'
import { useAuth } from '../../auth/useAuth'
import AnsForm from './AnsForm'

const { Text } = Typography

export default function AnsList() {
    const { user } = useAuth()
    // 首次挂载即 loading，配合 load() 中 await 后再 setLoading(false)，避免 effect 内同步 setState
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [keyword, setKeyword] = useState('')
    // Modal 状态：mode 决定新建/编辑；editingAns=编辑时的记录；modalOpen=弹窗开关
    const [modalMode, setModalMode] = useState('add')   // 'add' | 'edit'
    const [editingAns, setEditingAns] = useState(null)
    const [modalOpen, setModalOpen] = useState(false)

    // 统一处理列表结果：load() 与 effect 共用，避免重复
    function applyResult(res) {
        setLoading(false)
        if (res.code === 200) {
            setData(res.data.list)
            setTotal(res.data.total)
        } else {
            message.error(res.msg)
        }
    }

    // 事件处理（搜索/删除后刷新）用此函数：会先显示 loading
    async function load() {
        setLoading(true)
        applyResult(await ansApi.listAns({ page, pageSize, keyword }))
    }

    // 分页/页大小变化时拉取：setStates 都在 await 后的异步回调中，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await ansApi.listAns({ page, pageSize, keyword })
            if (!cancelled) applyResult(res)
        })()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize])

    async function handleDelete(ansId) {
        const res = await ansApi.deleteAns(ansId)
        if (res.code === 200) {
            message.success('删除成功')
            load()
        } else {
            message.error(res.msg)
        }
    }

    // 打开新建 Modal
    function openAdd() {
        setModalMode('add')
        setEditingAns(null)
        setModalOpen(true)
    }

    // 打开编辑 Modal
    function openEdit(record) {
        setModalMode('edit')
        setEditingAns(record)
        setModalOpen(true)
    }

    // 关闭 Modal（提交成功或取消）
    function closeModal() {
        setModalOpen(false)
        setEditingAns(null)
    }

    // Modal 提交成功：关闭并刷新
    function handleSuccess() {
        closeModal()
        load()
    }

    // 编辑/删除权限：管理员或答案作者本人；非作者不可编辑（隐藏编辑按钮）
    const canEdit = (record) => user?.role === 'admin' || record.uploader === user?.nickname
    const canDelete = (record) => user?.role === 'admin' || record.uploader === user?.nickname

    const columns = [
        { title: '标题', dataIndex: 'title', ellipsis: true, render: (t) => <Text strong>{t}</Text> },
        { title: '描述', dataIndex: 'description', ellipsis: true, width: 220 },
        { title: '上传者', dataIndex: 'uploader', width: 120 },
        { title: '上传时间', dataIndex: 'uploadTime', width: 160 },
        {
            title: '操作',
            key: 'action',
            width: 160, fixed: 'right',
            render: (_, record) => (
                <Space>
                    {/* 仅作者本人或管理员可见编辑按钮 */}
                    {canEdit(record) && (
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                    )}
                    {/* 仅作者本人或管理员可见删除按钮 */}
                    {canDelete(record) && (
                        <Popconfirm title="确认删除该答案？" onConfirm={() => handleDelete(record.ansId)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                        </Popconfirm>
                    )}
                </Space>
            )
        }
    ]

    return (
        <div className="ans-list-wrap">
            <div className="ans-list-toolbar">
                <h2 className="ans-list-title">答案管理</h2>
                <Space>
                    <Input
                        className="ans-list-search"
                        placeholder="搜索标题/描述"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onPressEnter={() => { setPage(1); load() }}
                        allowClear
                        suffix={<SearchOutlined onClick={() => { setPage(1); load() }} style={{ cursor: 'pointer' }} />}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>上传答案</Button>
                </Space>
            </div>
            <Table
                rowKey="ansId"
                columns={columns}
                dataSource={data}
                loading={loading}
                /* 手机端列多装不下，开启横向滚动而非撑破容器 */
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

            {/* 新建/编辑答案：浮动窗口，内嵌 AnsForm（Modal 模式） */}
            <Modal
                title={modalMode === 'edit' ? '编辑答案' : '上传答案'}
                open={modalOpen}
                onCancel={closeModal}
                footer={null}   // 用 AnsForm 内部的提交/取消按钮
                width={640}
                className="ans-modal"
                destroyOnClose  // 关闭时卸载内部组件，重置表单与验证码状态
                maskClosable={false}
            >
                {/* 新建模式不传 ansid；编辑模式传 ansId 强制重挂载 */}
                <AnsForm
                    key={modalMode === 'edit' ? editingAns?.ansId : 'add'}
                    ansid={modalMode === 'edit' ? editingAns?.ansId : undefined}
                    onSuccess={handleSuccess}
                    onCancel={closeModal}
                />
            </Modal>
        </div>
    )
}
