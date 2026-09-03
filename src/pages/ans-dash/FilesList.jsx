import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Space, Upload, message, Popconfirm, Typography, Tag, Tooltip, Modal, Image, Spin, Result } from 'antd'
import { DeleteOutlined, UploadOutlined, FileOutlined, ReloadOutlined, InboxOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons'
import { useAuth } from '../../auth/useAuth'
import * as filesApi from '../../api/files'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

// 文件类型 → Tag 颜色（粗粒度区分）
function fileTag(mime, name) {
    const ext = (name.split('.').pop() || '').toLowerCase()
    if (mime?.startsWith('image/')) return <Tag color="blue" bordered={false}>图片</Tag>
    if (mime?.startsWith('video/')) return <Tag color="purple" bordered={false}>视频</Tag>
    if (mime?.startsWith('audio/')) return <Tag color="geekblue" bordered={false}>音频</Tag>
    if (['pdf'].includes(ext)) return <Tag color="red" bordered={false}>PDF</Tag>
    if (['doc', 'docx'].includes(ext)) return <Tag color="blue" bordered={false}>Word</Tag>
    if (['xls', 'xlsx'].includes(ext)) return <Tag color="green" bordered={false}>Excel</Tag>
    if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return <Tag color="orange" bordered={false}>压缩包</Tag>
    if (['js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'py', 'java', 'go', 'c', 'cpp', 'sql', 'vue'].includes(ext)) return <Tag color="cyan" bordered={false}>代码</Tag>
    if (['txt', 'md', 'log', 'ini', 'conf', 'yml', 'yaml'].includes(ext)) return <Tag color="default" bordered={false}>文本</Tag>
    return <Tag bordered={false}>文件</Tag>
}

export default function FilesList() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)

    // 编辑器 Modal 状态：file 当前文件，type 内容类型(text/image/unsupported)，
    // content 文本内容，dataUrl 图片 base64，contentLoading 内容加载中，saving 保存中
    // encoding 后端检测到的源文件编码（UTF-8/UTF-8-BOM/GB18030 等），用于提示用户
    const [editor, setEditor] = useState({ visible: false, file: null, type: '', content: '', dataUrl: '', encoding: '', contentLoading: false, saving: false })
    // 原生 textarea ref：用 ref callback 直接写 value，避免大文本受控导致手机端卡死
    const textareaRef = useRef(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await filesApi.listFiles()
            if (res.code === 200) setData(res.data)
            else message.error(res.msg)
        } catch (e) {
            message.error('加载失败：' + e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    // 上传前钩子：阻止 antd 默认上传行为，自定义走 base64 上传
    // multiple=true 时 antd 会逐个调用 beforeUpload，用 ref 计数器跟踪并发数
    const uploadCount = useRef(0)
    function beforeUpload(file) {
        if (file.size > 20 * 1024 * 1024) {
            message.error(`${file.name} 过大，最大 20MB`)
            return false
        }
        uploadCount.current++
        setUploading(true)
        filesApi.uploadFile(file, user?.nickname)
            .then((res) => {
                if (res.code === 200) {
                    message.success(`${file.name} 上传成功`)
                    load()
                } else {
                    message.error(`${file.name}: ${res.msg}`)
                }
            })
            .catch((e) => message.error(`${file.name} 上传失败：${e.message}`))
            .finally(() => {
                uploadCount.current--
                if (uploadCount.current <= 0) {
                    uploadCount.current = 0
                    setUploading(false)
                }
            })
        return false
    }

    async function handleDelete(fileId) {
        const res = await filesApi.deleteFile(fileId)
        if (res.code === 200) {
            message.success('已删除')
            load()
        } else {
            message.error(res.msg)
            if (res.code === 401) navigate('/login', { replace: true })
        }
    }

    // 点击文件名打开编辑器/预览：拉取文件内容
    async function openEditor(record) {
        setEditor({ visible: true, file: record, type: '', content: '', dataUrl: '', encoding: '', contentLoading: true, saving: false })
        try {
            const res = await filesApi.getFileContent(record.fileId)
            if (res.code === 200) {
                setEditor((s) => ({
                    ...s,
                    type: res.data.type,
                    content: res.data.content || '',
                    dataUrl: res.data.dataUrl || '',
                    encoding: res.data.encoding || '',
                    contentLoading: false
                }))
            } else {
                message.error(res.msg)
                setEditor((s) => ({ ...s, contentLoading: false }))
            }
        } catch (e) {
            message.error('加载内容失败：' + e.message)
            setEditor((s) => ({ ...s, contentLoading: false }))
        }
    }

    // 保存文本内容
    async function handleSaveContent() {
        if (!editor.file || !textareaRef.current) return
        const content = textareaRef.current.value
        setEditor((s) => ({ ...s, saving: true }))
        try {
            const res = await filesApi.updateFileContent(editor.file.fileId, content)
            if (res.code === 200) {
                message.success('已保存')
                setEditor((s) => ({ ...s, saving: false }))
                load()
            } else {
                message.error(res.msg)
                setEditor((s) => ({ ...s, saving: false }))
                if (res.code === 401) navigate('/login', { replace: true })
            }
        } catch (e) {
            message.error('保存失败：' + e.message)
            setEditor((s) => ({ ...s, saving: false }))
        }
    }

    function closeEditor() {
        setEditor({ visible: false, file: null, type: '', content: '', dataUrl: '', encoding: '', contentLoading: false, saving: false })
    }

    // 修改/删除权限：管理员或上传者本人
    const canModify = (record) => user?.role === 'admin' || record.uploader === user?.nickname

    // 完整直链（含 origin），方便复制后直接使用
    function fullUrl(url) {
        return window.location.origin + url
    }

    // textarea ref callback：挂载时直接写 content，绕开 defaultValue 时序
    function setTextareaRef(node) {
        textareaRef.current = node
        if (node && editor.content) {
            node.value = editor.content
        }
    }

    // 兜底：content 变化时同步写入 textarea（解决 ref callback 时序不稳定导致内容不回填）
    useEffect(() => {
        if (editor.type === 'text' && textareaRef.current && editor.content !== undefined) {
            textareaRef.current.value = editor.content
        }
    }, [editor.content, editor.type])

    const columns = [
        {
            title: '文件名',
            dataIndex: 'originalName',
            render: (name, record) => (
                <Space>
                    <FileOutlined style={{ color: '#1677ff' }} />
                    {/* 点击文件名打开编辑器（文本）或图片预览；不再直接 a 标签跳转 */}
                    <a onClick={() => openEditor(record)} title="点击查看/编辑">
                        {name}
                    </a>
                </Space>
            )
        },
        { title: '类型', dataIndex: 'mime', width: 90, render: (m, r) => fileTag(m, r.originalName) },
        { title: '大小', dataIndex: 'sizeText', width: 100 },
        { title: '上传者', dataIndex: 'uploader', width: 120 },
        { title: '上传时间', dataIndex: 'createTime', width: 160 },
        {
            title: '直链',
            dataIndex: 'url',
            width: 280,
            render: (url) => (
                <Paragraph copyable={{ tooltips: '复制直链' }} style={{ margin: 0, fontSize: '0.75rem' }}>
                    {fullUrl(url)}
                </Paragraph>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: 200, fixed: 'right',
            render: (_, record) => (
                <Space>
                    {/* 下载：走专用 /download/:fileId 路由，后端用 original_name 设置 Content-Disposition，避免文件名变成 storage_name */}
                    <Tooltip title="下载">
                        <a href={`/api/files/download/${record.fileId}`} download={record.originalName}>
                            <Button size="small" icon={<DownloadOutlined />} />
                        </a>
                    </Tooltip>
                    {/* 编辑/预览：与点文件名一致 */}
                    <Tooltip title="查看/编辑">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => openEditor(record)} />
                    </Tooltip>
                    {canModify(record) ? (
                        <Popconfirm
                            title="确认删除该文件？"
                            description="删除后直链将失效，已引用此资源的地方会显示异常"
                            onConfirm={() => handleDelete(record.fileId)}
                            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
                        >
                            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                        </Popconfirm>
                    ) : (
                        <Tooltip title="仅上传者或管理员可删除">
                            <Button size="small" icon={<DeleteOutlined />} disabled>删除</Button>
                        </Tooltip>
                    )}
                </Space>
            )
        }
    ]

    // Modal 底部按钮：文本类型显示「保存」+「取消」，其他仅显示「关闭」
    function modalFooter() {
        if (editor.contentLoading) return null
        if (editor.type === 'text' && editor.file && canModify(editor.file)) {
            return [
                <Button key="cancel" onClick={closeEditor}>取消</Button>,
                <Button key="save" type="primary" loading={editor.saving} onClick={handleSaveContent}>保存</Button>
            ]
        }
        return [<Button key="close" onClick={closeEditor}>关闭</Button>]
    }

    // Modal 标题：显示文件名 + 类型 + 编码（编码用于让用户知道源文件是什么编码）
    function modalTitle() {
        if (!editor.file) return '查看'
        return (
            <Space>
                <FileOutlined style={{ color: '#1677ff' }} />
                <span>{editor.file.originalName}</span>
                {editor.type === 'text' && <Tag color="cyan" bordered={false}>可编辑</Tag>}
                {editor.type === 'image' && <Tag color="blue" bordered={false}>图片预览</Tag>}
                {editor.type === 'unsupported' && <Tag bordered={false}>暂不支持预览</Tag>}
                {editor.type === 'text' && editor.encoding && (
                    <Tag color={editor.encoding === 'UTF-8' || editor.encoding === 'UTF-8-BOM' ? 'green' : 'orange'} bordered={false}>
                        {editor.encoding}
                    </Tag>
                )}
            </Space>
        )
    }

    return (
        <div className="ans-list-wrap">
            <div className="ans-list-toolbar">
                <h2 className="ans-list-title">资源管理</h2>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
                </Space>
            </div>
            <Text type="secondary" style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
                上传后可获取直链，可在答案 HTML / 系统配置中直接引用；单文件最大 20MB。点击文件名可在线编辑文本或预览图片。
            </Text>
            {/* 拖拽上传区：支持拖入文件或点击选择 */}
            <Dragger
                beforeUpload={beforeUpload}
                showUploadList={false}
                multiple={true}
                style={{ marginBottom: '1rem' }}
            >
                <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                </p>
                <p className="ant-upload-text" style={{ margin: '0 0 0.5rem' }}>
                    点击或拖拽文件到此区域上传（支持多文件）
                </p>
                <p className="ant-upload-hint" style={{ margin: 0, fontSize: '0.75rem' }}>
                    支持多文件批量上传，单个文件最大 20MB
                </p>
            </Dragger>
            <Table
                rowKey="fileId"
                columns={columns}
                dataSource={data}
                loading={loading}
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                size="middle"
            />
            {/* 文件查看/编辑 Modal：文本走原生 textarea，图片走 antd Image */}
            <Modal
                open={editor.visible}
                title={modalTitle()}
                footer={modalFooter()}
                onCancel={closeEditor}
                width="60rem"
                destroyOnClose
            >
                {editor.contentLoading ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <Spin tip="加载中..." />
                    </div>
                ) : editor.type === 'text' ? (
                    <>
                        <Text type="secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                            {editor.file && canModify(editor.file)
                                ? '可直接编辑下方内容并点击保存；原生 textarea，大文本也不会卡。'
                                : '只读模式：仅上传者或管理员可编辑。'}
                        </Text>
                        {/* 非 UTF-8 编码提示：保存后统一转为 UTF-8，避免后续乱码 */}
                        {editor.file && canModify(editor.file) && editor.encoding && editor.encoding !== 'UTF-8' && editor.encoding !== 'UTF-8-BOM' && (
                            <div style={{ marginBottom: '0.5rem', padding: '0.5rem 0.75rem', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '0.375rem', fontSize: '0.75rem', color: '#874d00' }}>
                                源文件编码为 {editor.encoding}，保存后将统一转为 UTF-8 编码存储，避免后续乱码。
                            </div>
                        )}
                        <textarea
                            ref={setTextareaRef}
                            className="raw-textarea"
                            rows={16}
                            style={{ readOnly: editor.file ? !canModify(editor.file) : true }}
                            placeholder="文件内容为空"
                        />
                    </>
                ) : editor.type === 'image' ? (
                    // 图片预览：加 min-height 容器避免小图看不见，浅灰背景突显透明区域
                    <div style={{ textAlign: 'center', minHeight: '12rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '1rem', borderRadius: '0.5rem' }}>
                        <Image
                            src={editor.dataUrl}
                            alt={editor.file?.originalName || '预览'}
                            style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
                            placeholder={<Spin tip="加载中..." />}
                            fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+5aSx6LSl5a+86Ieui+WKqDwvdGV4dD48L3N2Zz4="
                        />
                    </div>
                ) : (
                    <Result
                        status="info"
                        title="该文件类型暂不支持在线预览"
                        subTitle={editor.file ? `类型：${editor.file.mime || '未知'}` : ''}
                        extra={
                            editor.file && (
                                <a href={editor.file.url} download={editor.file.originalName}>
                                    <Button type="primary" icon={<DownloadOutlined />}>下载查看</Button>
                                </a>
                            )
                        }
                    />
                )}
            </Modal>
        </div>
    )
}
