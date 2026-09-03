import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Table, Button, Space, Modal, Form, Input, Popconfirm, message, Breadcrumb } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import * as schoolsApi from '../../api/schools'
import { Link } from 'react-router-dom'

export default function ClassesManage() {
    const { id: schoolId } = useParams()
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState([])
    const [schoolName, setSchoolName] = useState('')
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form] = Form.useForm()
    const [submitting, setSubmitting] = useState(false)

    // 统一处理班级列表结果：load() 与 effect 共用
    function applyResult(clsRes, schRes) {
        setLoading(false)
        if (clsRes.code === 200) setData(clsRes.data)
        if (schRes.code === 200) {
            const s = schRes.data.find((x) => x.schoolId === schoolId)
            setSchoolName(s?.name || '未知学校')
        }
    }

    // 提交/删除后刷新用：会先显示 loading
    async function load() {
        setLoading(true)
        const [clsRes, schRes] = await Promise.all([
            schoolsApi.listClasses(schoolId),
            schoolsApi.listSchools()
        ])
        applyResult(clsRes, schRes)
    }

    // 切换学校时拉取：setstates 都在 await 后的异步回调中，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const [clsRes, schRes] = await Promise.all([
                schoolsApi.listClasses(schoolId),
                schoolsApi.listSchools()
            ])
            if (!cancelled) applyResult(clsRes, schRes)
        })()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId])

    function openCreate() {
        setEditing(null)
        form.resetFields()
        setModalOpen(true)
    }

    function openEdit(record) {
        setEditing(record)
        form.setFieldsValue(record)
        setModalOpen(true)
    }

    async function handleSubmit() {
        const values = await form.validateFields()
        setSubmitting(true)
        const res = editing
            ? await schoolsApi.updateClass(editing.classId, values)
            : await schoolsApi.createClass({ ...values, schoolId })
        setSubmitting(false)
        if (res.code === 200) {
            message.success(editing ? '更新成功' : '创建成功')
            setModalOpen(false)
            load()
        } else {
            message.error(res.msg)
        }
    }

    async function handleDelete(classId) {
        const res = await schoolsApi.deleteClass(classId)
        if (res.code === 200) {
            message.success('删除成功')
            load()
        } else {
            message.error(res.msg)
        }
    }

    const columns = [
        { title: '班级名称', dataIndex: 'name', render: (t) => <strong>{t}</strong> },
        { title: '年级', dataIndex: 'grade', width: 100 },
        { title: '创建时间', dataIndex: 'createTime', width: 160 },
        {
            title: '操作', key: 'action', width: 200,
            render: (_, record) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                    <Popconfirm title="确认删除该班级？" onConfirm={() => handleDelete(record.classId)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
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
                    { title: <Link to="/ans-dash/schools">学校管理</Link> },
                    { title: `${schoolName} · 班级管理` }
                ]}
                style={{ marginBottom: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{schoolName} · 班级列表</h2>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建班级</Button>
            </div>
            <Table
                rowKey="classId"
                columns={columns}
                dataSource={data}
                loading={loading}
                pagination={false}
                size="middle"
            />

            <Modal
                title={editing ? '编辑班级' : '新建班级'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={submitting}
                okText={editing ? '更新' : '创建'}
                cancelText="取消"
            >
                <Form form={form} layout="vertical" preserve={false}>
                    <Form.Item label="班级名称" name="name" rules={[{ required: true, message: '请输入班级名称' }]}>
                        <Input placeholder="如：高三1班" />
                    </Form.Item>
                    <Form.Item label="年级" name="grade" rules={[{ required: true, message: '请输入年级' }]}>
                        <Input placeholder="如 22级" maxLength={20} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    )
}
