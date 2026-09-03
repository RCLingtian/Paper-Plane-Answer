import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Result, Button, Space, Typography } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { Header, Footer } from './Home'

const { Text, Paragraph } = Typography

// 外链跳转中转页：/go?url=<encoded>
// 不自动跳转，由用户点击「在新窗口打开」主动跳转，避免被钓鱼链接诱导
export default function Go() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const rawUrl = params.get('url') || ''

    // 校验 URL 合法性：必须是 http/https 协议；拒绝 javascript:/data: 等危险协议
    let parsed = null
    let urlError = ''
    try {
        parsed = rawUrl ? new URL(rawUrl) : null
        if (parsed && !/^https?:$/.test(parsed.protocol)) {
            urlError = `不支持的协议：${parsed.protocol}`
            parsed = null
        }
    } catch {
        urlError = 'URL 格式不正确'
    }

    function handleOpenInNewTab() {
        if (!parsed) return
        // noopener/noreferrer 防止新窗口通过 window.opener 访问原页面（反钓鱼）
        window.open(parsed.href, '_blank', 'noopener,noreferrer')
    }

    function handleCancel() {
        navigate('/', { replace: true })
    }

    return (
        <div className="page">
            <Header />
            <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0.75rem' }}>
                {parsed ? (
                    <Result
                        icon={<CheckCircleOutlined style={{ color: '#1677ff' }} />}
                        title="即将跳转到外部链接"
                        subTitle={
                            <Space direction="vertical" size={0} style={{ alignItems: 'stretch' }}>
                                <Text type="secondary">目标地址：</Text>
                                <Paragraph copyable style={{ margin: 0, wordBreak: 'break-all' }}>
                                    {parsed.href}
                                </Paragraph>
                                <Text type="warning" style={{ fontSize: '0.75rem' }}>
                                    请确认链接来源可信后再继续
                                </Text>
                            </Space>
                        }
                        extra={
                            <Space>
                                <Button type="primary" onClick={handleOpenInNewTab}>在新窗口打开</Button>
                                <Button onClick={handleCancel}>取消</Button>
                            </Space>
                        }
                    />
                ) : (
                    <Result
                        status="warning"
                        icon={<CloseCircleOutlined style={{ color: '#faad14' }} />}
                        title="无法跳转"
                        subTitle={urlError || '链接参数缺失'}
                        extra={<Link to="/"><Button type="primary">返回首页</Button></Link>}
                    />
                )}
            </main>
            <Footer />
        </div>
    )
}
