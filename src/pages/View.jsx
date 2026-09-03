import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { message, FloatButton } from 'antd'
import { ArrowLeftOutlined, ShareAltOutlined } from '@ant-design/icons'
import { Header, Footer } from './Home'
import './View.css'

// 答案详情页：用 iframe 加载后端渲染的完整 HTML 文档（/api/view/:ansid）
// 布局：Header + main(iframe) + Footer，main 不使用 .ct 容器
export default function View() {
    const { ansid } = useParams()
    const navigate = useNavigate()
    const iframeRef = useRef(null)

    // 分享：复制当前页链接到剪贴板
    function handleShare() {
        const url = window.location.href
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(url).then(
                () => message.success('链接已复制到剪贴板'),
                () => message.error('复制失败，请手动复制地址栏链接')
            )
        } else {
            // 降级：选中文本兜底
            message.info('请手动复制地址栏链接')
        }
    }

    // iframe 加载完成后挂载 copy 监听器
    // 用户在 iframe 内 Ctrl+C / 右键复制选中内容时弹出提示
    function handleIframeLoad() {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return
        // 已挂载过则跳过，避免重复绑定
        if (doc.__copyBound) return
        doc.__copyBound = true
        doc.addEventListener('copy', () => {
            // 选中内容为空时不弹提示，避免误触
            const sel = doc.getSelection()
            if (sel && sel.toString().trim()) {
                message.success('复制成功')
            }
        })
    }

    // 兜底：iframe onLoad 可能在 React 注册前触发，useEffect 再绑一次
    useEffect(() => {
        handleIframeLoad()
    }, [ansid])

    return (
        <div className="page view-page">
            <Header />
            <main className="view-main">
                {/* 左上角浮动工具按钮：返回 + 分享
                    antd FloatButton 根元素自带 position:fixed + right/bottom 默认值，
                    必须用 inline style 把 right/bottom 置为 auto，否则会同时拥有
                    top/left/right/bottom 把按钮拉伸成全屏高度。
                    top 必须避开顶部 Header（高 3rem），否则按钮被 Header 遮挡 */}
                <FloatButton
                    shape="square"
                    type="default"
                    icon={<ArrowLeftOutlined />}
                    tooltip="返回"
                    onClick={() => navigate(-1)}
                    className="view-float-back"
                    style={{ top: '3.5rem', left: '0.75rem', right: 'auto', bottom: 'auto' }}
                />
                <FloatButton
                    shape="square"
                    type="default"
                    icon={<ShareAltOutlined />}
                    tooltip="分享"
                    onClick={handleShare}
                    className="view-float-share"
                    style={{ top: '3.5rem', left: '3.5rem', right: 'auto', bottom: 'auto' }}
                />
                <iframe
                    ref={iframeRef}
                    src={`/api/view/${ansid}`}
                    title="答案详情"
                    className="view-iframe"
                    onLoad={handleIframeLoad}
                    // sandbox 隔离用户粘贴的 HTML：允许脚本/表单/弹窗/下载，
                    // 但禁止访问 parent 同源资源（localStorage 中的 token 等），
                    // 避免 content_html 中的恶意脚本窃取登录态
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads"
                />
            </main>
            <Footer />
        </div>
    )
}
