import { useEffect, useMemo, useState } from 'react'
import { Form, Input, Select, Button, Alert, message, Card, Radio, Switch, Upload, Divider, Space } from 'antd'
import { InboxOutlined, UndoOutlined } from '@ant-design/icons'
import * as settingsApi from '../../api/settings'

const { TextArea } = Input
const { Dragger } = Upload

// 代码高亮库可选项（作用于「系统配置的 JS 注入代码」预览，非答案正文）
const HIGHLIGHT_OPTIONS = [
    { value: 'prism', label: 'Prism.js（推荐，按需加载语言）' },
    { value: 'highlight', label: 'Highlight.js（自动检测语言）' },
    { value: 'none', label: '不使用代码高亮' }
]

// 动态加载 CDN 脚本/样式（只在系统配置页用于 JS 注入代码预览）
const CDN = {
    prism: {
        css: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css',
        js: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js',
        autoloader: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js'
    },
    highlight: {
        css: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css',
        js: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'
    }
}

function loadCss(url) {
    if (document.querySelector(`link[href="${url}"]`)) return
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = url
    document.head.appendChild(l)
}

function loadScript(url) {
    return new Promise((resolve) => {
        if (document.querySelector(`script[src="${url}"]`)) return resolve()
        const s = document.createElement('script')
        s.src = url
        s.onload = () => resolve()
        s.onerror = () => resolve() // 失败也放行，降级为纯文本预览
        document.head.appendChild(s)
    })
}

function escapeHtml(s) {
    if (s == null) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

// JS 注入代码预览：依据高亮库实时高亮显示
function CodePreview({ code, lib, ready }) {
    const html = useMemo(() => {
        if (!code) return ''
        if (lib === 'prism' && ready && window.Prism) {
            return window.Prism.highlight(code, window.Prism.languages.javascript, 'javascript')
        }
        if (lib === 'highlight' && ready && window.hljs) {
            try { return window.hljs.highlight(code, { language: 'javascript' }).value } catch { return escapeHtml(code) }
        }
        return escapeHtml(code)
    }, [code, lib, ready])
    return (
        <pre className="js-injection-preview" style={{ margin: 0 }}>
            <code dangerouslySetInnerHTML={{ __html: html || '<span style="color:#999">// 预览区：输入 JS 后实时高亮显示</span>' }} />
        </pre>
    )
}

export default function Settings() {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [highlightReady, setHighlightReady] = useState(false)
    const [uploadingImg, setUploadingImg] = useState(false)
    const [ansImagePreview, setAnsImagePreview] = useState('')
    // 用 Form.useWatch 监听 jsInjection/highlightLib 变化，驱动预览
    const jsInjection = Form.useWatch('jsInjection', form) || ''
    const highlightLib = Form.useWatch('highlightLib', form) || 'prism'

    // 挂载时拉取配置回填：setstates 都在 await 后的异步回调中，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await settingsApi.getSettings()
            if (cancelled) return
            setLoading(false)
            if (res.code === 200) {
                form.setFieldsValue({
                    highlightLib: res.data.highlightLib || 'prism',
                    jsInjection: res.data.jsInjection || '',
                    captchaBgUrl: res.data.captchaBgUrl || '',
                    ansImageMode: res.data.ansImageMode || 'api',
                    ansImageUrl: res.data.ansImageUrl || '',
                    allowRegister: res.data.allowRegister === '1' || res.data.allowRegister === true
                })
                setAnsImagePreview(res.data.ansImageUrl || '')
            } else {
                message.error(res.msg)
            }
        })()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 切换高亮库时加载对应 CDN，加载完触发预览刷新
    useEffect(() => {
        let alive = true
        async function ensureLib() {
            setHighlightReady(false)
            if (highlightLib === 'prism') {
                loadCss(CDN.prism.css)
                await loadScript(CDN.prism.js)
                await loadScript(CDN.prism.autoloader)
            } else if (highlightLib === 'highlight') {
                loadCss(CDN.highlight.css)
                await loadScript(CDN.highlight.js)
            }
            if (alive) setHighlightReady(true)
        }
        ensureLib()
        return () => { alive = false }
    }, [highlightLib])

    async function handleSubmit() {
        const values = await form.validateFields()
        setSaving(true)
        const payload = {
            ...values,
            // Switch 布尔转 '1'/'0'
            allowRegister: values.allowRegister ? '1' : '0'
        }
        const res = await settingsApi.updateSettings(payload)
        setSaving(false)
        if (res.code === 200) {
            message.success('配置已保存')
        } else {
            message.error(res.msg)
        }
    }

    // anscard 自定义图上传：转 base64 → 后端存盘 → 返回 URL
    function beforeUploadImg(file) {
        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = reader.result
            setUploadingImg(true)
            settingsApi.uploadImage(dataUrl, file.name).then((res) => {
                setUploadingImg(false)
                if (res.code === 200) {
                    form.setFieldsValue({ ansImageUrl: res.data.url })
                    setAnsImagePreview(res.data.url)
                    message.success('图片已上传，记得点击「保存配置」生效')
                } else {
                    message.error(res.msg)
                }
            }).catch(() => {
                setUploadingImg(false)
                message.error('上传失败，请稍后重试')
            })
        }
        reader.readAsDataURL(file)
        return false // 阻止 antd 自动上传
    }

    // 恢复默认 JS 注入代码：从后端拉取默认值，填入表单（不自动保存，需用户点「保存配置」）
    async function handleRestoreDefaultJs() {
        try {
            const res = await settingsApi.getDefaultJs()
            if (res.code === 200) {
                form.setFieldsValue({ jsInjection: res.data.jsInjection })
                message.success('已恢复为默认代码，记得点击「保存配置」生效')
            } else {
                message.error(res.msg)
            }
        } catch (e) {
            message.error('恢复失败：' + e.message)
        }
    }

    return (
        <div>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>系统配置</h2>
            <Card loading={loading}>
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ highlightLib: 'prism', jsInjection: '', ansImageMode: 'api', allowRegister: true }}
                >
                    {/* 注册开关 */}
                    <Form.Item label="开放注册" name="allowRegister" valuePropName="checked">
                        <Switch checkedChildren="开放" unCheckedChildren="关闭" />
                    </Form.Item>
                    <Alert
                        type="info" showIcon
                        message="关闭后，前台 Header 注册按钮隐藏，注册接口也会拒绝"
                        style={{ marginBottom: 24 }}
                    />

                    <Divider orientation="left">前台展示</Divider>

                    {/* anscard 图片源：api=答案自带封面，缺失用本地默认图；custom=统一用管理员上传的图 */}
                    <Form.Item label="答案卡片图片来源" name="ansImageMode">
                        <Radio.Group>
                            <Radio.Button value="api">答案自带封面（缺失用本地默认图）</Radio.Button>
                            <Radio.Button value="custom">统一使用自定义图（可上传）</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.ansImageMode !== cur.ansImageMode}>
                        {({ getFieldValue }) => getFieldValue('ansImageMode') === 'custom' ? (
                            <Form.Item label="自定义卡片图片" required name="ansImageUrl">
                                <Dragger accept="image/*" beforeUpload={beforeUploadImg} maxCount={1} showUploadList={false} disabled={uploadingImg}>
                                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                                    <p className="ant-upload-text">{uploadingImg ? '上传中...' : '点击或拖拽图片到此'}</p>
                                    <p className="ant-upload-hint">上传后会替换旧图；支持 png/jpg/gif/webp</p>
                                </Dragger>
                                {ansImagePreview && (
                                    <div style={{ marginTop: 12 }}>
                                        <img src={ansImagePreview} alt="卡片图预览" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6 }} />
                                    </div>
                                )}
                            </Form.Item>
                        ) : (
                            <Alert type="info" showIcon message="使用答案自带封面图；答案未设置封面时，统一显示本地默认图 /static/97f31784103f344d.jpg（不请求任何外部随机图 API）" style={{ marginBottom: 24 }} />
                        )}
                    </Form.Item>

                    {/* 验证码背景图：滑块验证码专用随机图（保留）；留空时用 picsum.photos 随机图 */}
                    <Form.Item label="验证码背景图 URL（滑块验证码专用）" name="captchaBgUrl" extra="留空使用默认随机图（picsum.photos 按 seed 取图，背景与拼图块同图）；填写固定 URL 则所有验证码使用同一张图">
                        <Input placeholder="https://..." />
                    </Form.Item>

                    <Divider orientation="left">答案详情页 JS 注入</Divider>

                    <Alert
                        type="info" showIcon
                        message="不需要写 &lt;script&gt; 标签，直接写 JS 代码即可"
                        description="代码会在答案详情页 DOMContentLoaded 后自动执行（包裹在 try/catch 中）。可使用 console.log 调试，可访问 document 操作答案 DOM。"
                        style={{ marginBottom: 16 }}
                    />

                    <Form.Item
                        label="代码高亮库（仅作用于下方 JS 注入代码预览，不影响答案正文）"
                        name="highlightLib"
                        rules={[{ required: true, message: '请选择代码高亮库' }]}
                    >
                        <Select options={HIGHLIGHT_OPTIONS} style={{ maxWidth: 360 }} />
                    </Form.Item>

                    <Form.Item
                        label={
                            <Space>
                                <span>JS 注入代码</span>
                                <Button
                                    size="small"
                                    type="link"
                                    icon={<UndoOutlined />}
                                    onClick={handleRestoreDefaultJs}
                                >
                                    恢复默认
                                </Button>
                            </Space>
                        }
                        name="jsInjection"
                        extra="所有答案详情页都会注入并执行这段代码。点击「恢复默认」可填入内置的默认净化脚本。"
                    >
                        <TextArea
                            rows={12}
                            placeholder="// 示例：&#10;console.log('答案页已加载');&#10;document.title = document.title + ' ✨';"
                            style={{
                                fontFamily: 'Consolas, "Cascadia Code", Menlo, monospace',
                                fontSize: 13
                            }}
                        />
                    </Form.Item>

                    {/* JS 注入代码高亮预览 */}
                    <Form.Item label="代码预览">
                        <div className="js-preview-wrap">
                            <CodePreview code={jsInjection} lib={highlightLib} ready={highlightReady} />
                        </div>
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" onClick={handleSubmit} loading={saving}>
                            保存配置
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    )
}
