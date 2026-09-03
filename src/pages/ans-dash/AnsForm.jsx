import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Radio, Upload, Button, Space, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import SliderCaptcha from '../../components/SliderCaptcha'
import * as ansApi from '../../api/ans'
import { useAuth } from '../../auth/useAuth'

const { TextArea } = Input
const { Dragger } = Upload

// 用法：父组件 Modal 传 ansid/onSuccess/onCancel；新建模式不传 ansid
export default function AnsForm({ ansid, onSuccess, onCancel }) {
    const isEdit = !!ansid
    const navigate = useNavigate()
    const { user } = useAuth()
    const [form] = Form.useForm()
    const [uploadType, setUploadType] = useState('html')
    const [fileName, setFileName] = useState('')
    const [captchaPassed, setCaptchaPassed] = useState(false)
    const [captchaKey, setCaptchaKey] = useState(0)
    const [loading, setLoading] = useState(false)

    // HTML 内容用「原生 textarea + 非受控」管理，避免粘贴超长 HTML 时
    // antd TextArea 内部 onChange/ResizeObserver 触发频繁重渲染导致手机端卡死。
    // - editHtmlRef：用 ref 同步持有最新 HTML，避免 React state 异步时序导致
    //   textarea 首次挂载时拿不到 defaultValue（"点 2 次才回填"bug 的根因）
    // - htmlKey：改变则强制 textarea 重挂载，挂载时通过 ref callback 直接写 value
    // - htmlRef：直接指向原生 textarea DOM，提交时直接读 .value
    const htmlRef = useRef(null)
    const editHtmlRef = useRef('')
    const [htmlKey, setHtmlKey] = useState(0)

    // textarea 挂载/重挂载时通过 ref callback 直接写 value，绕开 defaultValue 时序问题
    function setTextareaRef(node) {
        htmlRef.current = node
        if (node && editHtmlRef.current) {
            node.value = editHtmlRef.current
        }
    }

    // 编辑模式：拉取详情回填
    // 标题/描述走 Form.setFieldsValue；HTML 走 editHtmlRef + key 重挂载 + ref callback 写 value
    useEffect(() => {
        if (!isEdit) return
        let mounted = true
        ;(async () => {
            const res = await ansApi.getAns(ansid)
            if (!mounted) return
            if (res.code === 200) {
                form.setFieldsValue({
                    title: res.data.title,
                    description: res.data.description
                })
                const html = res.data.contentHtml || ''
                if (html) {
                    // 1) 先把 HTML 写入 ref（同步），textarea 挂载时 ref callback 会读到
                    // 2) bump key 强制 textarea 卸载/重挂载，触发 ref callback 写 value
                    // 3) 切到 text 模式让 textarea 进入 DOM
                    editHtmlRef.current = html
                    setHtmlKey((k) => k + 1)
                    setUploadType('text')
                }
            } else {
                message.error(res.msg)
                if (onCancel) onCancel()
                else navigate('/ans-dash/ans', { replace: true })
            }
        })()
        return () => { mounted = false }
    }, [ansid, isEdit, form, navigate, onCancel])

    // 读取 .html 文件文本，写入 editHtmlRef 并重挂载 textarea
    function beforeUpload(file) {
        const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html'
        if (!isHtml) {
            message.error('仅支持 .html 文件')
            return false
        }
        file.text().then((text) => {
            editHtmlRef.current = text
            if (uploadType !== 'text') {
                setUploadType('text')
            }
            setHtmlKey((k) => k + 1)
            setFileName(file.name)
            message.success(`已加载 ${file.name}`)
        })
        return false // 阻止真实上传
    }

    async function onFinish(values) {
        // 提交时直接从原生 textarea DOM 读取 HTML 内容
        const contentHtml = htmlRef.current?.value || ''
        if (!contentHtml.trim()) {
            message.error('请上传 HTML 文件或粘贴文本内容')
            return
        }
        if (!captchaPassed) {
            message.error('请先完成滑块验证')
            return
        }
        setLoading(true)
        const payload = {
            title: values.title,
            description: values.description || '',
            contentHtml,
            uploader: user?.nickname || '未知'
        }
        try {
            const res = isEdit
                ? await ansApi.updateAns(ansid, payload)
                : await ansApi.createAns(payload)
            if (res.code === 200) {
                message.success(isEdit ? '更新成功' : '上传成功')
                if (onSuccess) onSuccess()
                else navigate('/ans-dash/ans', { replace: true })
            } else {
                message.error(res.msg)
                setCaptchaPassed(false)
                setCaptchaKey((k) => k + 1) // 重置验证码
            }
        } catch {
            // 网络异常 / 超时 / 后端不可达：必须复位 loading，否则按钮永久转圈
            message.error('上传失败，请稍后重试')
            setCaptchaPassed(false)
            setCaptchaKey((k) => k + 1)
        } finally {
            setLoading(false)
        }
    }

    function handleCancel() {
        if (onCancel) onCancel()
        else navigate(-1)
    }

    // 切换上传方式时重置 textarea（key 改变 → 重新挂载，避免脏数据）
    function handleUploadTypeChange(e) {
        const v = e.target.value
        setUploadType(v)
        if (v === 'text') {
            setHtmlKey((k) => k + 1)
        }
    }

    // 始终返回纯表单（由 Modal 提供标题/容器）
    const formNode = (
        <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{ uploadType: 'html' }}
        >
            <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }, { max: 30, message: '标题不超过 30 字' }]}>
                <Input placeholder="请输入答案标题（最多 30 字）" maxLength={30} showCount style={{ maxWidth: 320 }} />
            </Form.Item>
            <Form.Item label="描述" name="description" rules={[{ max: 500, message: '描述不超过 500 字' }]}>
                <TextArea rows={5} placeholder="可选，简单描述这份答案（最多 500 字）" maxLength={500} showCount />
            </Form.Item>
            <Form.Item label="内容来源" name="uploadType">
                <Radio.Group onChange={handleUploadTypeChange} value={uploadType}>
                    <Radio.Button value="html">上传 HTML 文件</Radio.Button>
                    <Radio.Button value="text">粘贴文本</Radio.Button>
                </Radio.Group>
            </Form.Item>

            {uploadType === 'html' ? (
                <Form.Item label="HTML 文件" required>
                    <Dragger accept=".html,.htm" beforeUpload={beforeUpload} maxCount={1} fileList={fileName ? [{ uid: '-1', name: fileName, status: 'done' }] : []}>
                        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                        <p className="ant-upload-text">点击或拖拽 .html 文件到此区域</p>
                        {fileName && <p className="ant-upload-hint">已加载：{fileName}</p>}
                    </Dragger>
                </Form.Item>
            ) : (
                <Form.Item label="粘贴 HTML/文本内容" required>
                    {/* 原生 textarea + 非受控：粘贴超长 HTML 不触发 React 重渲染，手机端不卡
                        ref callback 在挂载时直接写 value，绕开 defaultValue 时序问题 */}
                    <textarea
                        key={htmlKey}
                        ref={setTextareaRef}
                        className="raw-textarea"
                        rows={8}
                        placeholder="将 HTML 内容粘贴到此处"
                    />
                </Form.Item>
            )}

            <Form.Item label="滑块验证" required>
                <SliderCaptcha
                    key={captchaKey}
                    onSuccess={() => setCaptchaPassed(true)}
                    onFail={() => setCaptchaPassed(false)}
                />
            </Form.Item>

            <Form.Item>
                <Space>
                    <Button type="primary" htmlType="submit" disabled={!captchaPassed} loading={loading}>
                        {isEdit ? '确认' : '上传'}
                    </Button>
                    <Button onClick={handleCancel}>取消</Button>
                </Space>
            </Form.Item>
        </Form>
    )

    return formNode
}
