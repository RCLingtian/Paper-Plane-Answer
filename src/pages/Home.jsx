import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Avatar, Dropdown, Tag, message, Input, Button, Skeleton, Empty, Typography } from 'antd'
import { UserOutlined, DashboardOutlined, LogoutOutlined, SearchOutlined, LoginOutlined, UserAddOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/useAuth'
import * as ansApi from '../api/ans'
import * as authApi from '../api/auth'
import * as settingsApi from '../api/settings'
import { useMenus } from '../hooks/useMenus'
import "./Home.css"

const { Link: TypographyLink } = Typography

// 答案自带 imagesUrl 为空时的默认封面图：本地静态资源（public/static/），
// 不依赖任何外部随机图 API；文件需放到 public/static/97f31784103f344d.jpg
const DEFAULT_ANS_IMG = '/static/97f31784103f344d.jpg'

export function Header() {
    const location = useLocation()
    const navigate = useNavigate()
    const { user, logout, loading } = useAuth()
    const isAdmin = user?.role === 'admin'
    // 是否开放注册：未开放时隐藏注册入口（即使通过 URL 直达也会被后端拒绝）
    const [allowRegister, setAllowRegister] = useState(true)
    // 顶部导航菜单：缓存优先渲染（localStorage/内置兜底瞬间出菜单），后台静默更新
    const menus = useMenus()
    // 用相对路径 + encodeURIComponent，避免把完整 URL 当成路径拼接
    const from = encodeURIComponent(location.pathname + location.search)

    useEffect(() => {
        authApi.registerStatus()
            .then((res) => {
                if (res.code === 200) setAllowRegister(res.data.allowRegister)
            })
            .catch(() => { /* 读取失败默认开放，不阻塞页面 */ })
    }, [])

    // 渲染单个菜单链接：外链用 <a>，内链用 <Link>；openInNewTab 控制 target
    function renderLink(m, cls) {
        const target = m.openInNewTab ? '_blank' : undefined
        if (m.externalLink) {
            return (
                <a href={m.url} target={target} rel="noopener noreferrer" className={cls} title={m.text}>
                    {m.text}
                </a>
            )
        }
        return (
            <Link to={m.url} target={target} className={cls} title={m.text}>
                {m.text}
            </Link>
        )
    }

    function handleMenuClick({ key }) {
        if (key === 'dash') navigate('/ans-dash')
        else if (key === 'logout') {
            logout()
            message.success('已退出登录')
            navigate('/', { replace: true })
        }
    }

    // 已登录：下拉菜单（前往仪表盘 / 退出登录）
    const userMenu = {
        items: [
            { key: 'dash', icon: <DashboardOutlined />, label: '前往仪表盘' },
            { type: 'divider' },
            { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }
        ],
        onClick: handleMenuClick
    }

    return(
        <header id="header">
            <div className="ct">
                <nav>
                    <ul className="nav-list">
                        {menus.map((item) => {
                            const hasChildren = Array.isArray(item.children) && item.children.length > 0
                            if (!hasChildren) {
                                return (
                                    <li className="nav-item" key={item.menuId}>
                                        {renderLink(item, 'link')}
                                    </li>
                                )
                            }
                            return (
                                <li className="nav-item has-children" key={item.menuId}>
                                    {renderLink(item, 'link')}
                                    <ul className="nav-sub">
                                        {item.children.map((c) => (
                                            <li key={c.menuId}>{renderLink(c, 'sublink')}</li>
                                        ))}
                                    </ul>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
                <div className="bth-list">
                    {/* 加载中不渲染右侧，避免闪烁 */}
                    {loading ? null : user ? (
                        <Dropdown menu={userMenu} placement="bottomRight">
                            <div className="header-user">
                                <Avatar size={28} icon={<UserOutlined />} />
                                <span className="header-username">{user?.nickname || '用户'}</span>
                                {isAdmin && <Tag color="blue" bordered={false}>管理员</Tag>}
                            </div>
                        </Dropdown>
                    ) : (
                        <>
                            <Link to={`/login?from=${from}`}>
                                <Button type="text" icon={<LoginOutlined />}>登录</Button>
                            </Link>
                            {/* 管理员未开放注册时隐藏注册按钮 */}
                            {allowRegister && (
                                <Link to={`/reg?from=${from}`}>
                                    <Button type="primary" ghost icon={<UserAddOutlined />}>注册</Button>
                                </Link>
                            )}
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}

export function Footer() {
    return(
        <footer id="footer">
            <div className="ct">
                <span style={{ fontSize: '0.75rem' }}>
                    本网站使用
                    <TypographyLink href="/go?url=https://react.dev/" rel="noopener noreferrer" title="点击以跳转到React">React</TypographyLink>
                    +
                    <TypographyLink href="/go?url=https://nodejs.org/" rel="noopener noreferrer" title="点击以跳转到Node.js">Node.js</TypographyLink>
                    构建
                </span>
            </div>
        </footer>
    )
}

export function AnsCard({ ansid, imagesUrl, uploader, uploadTime, avatar, title, description, imageMode, customImage }) {
    // 卡片图：custom 模式用管理员配置的自定义图；否则用答案自带 imagesUrl，为空时用本地默认封面图
    const cardImg = (imageMode === 'custom' && customImage)
        ? customImage
        : (imagesUrl || DEFAULT_ANS_IMG)
    return (
        <Link to={`/view/${ansid}`} className="anscard">
            <div className="anscard-image">
                <img src={cardImg} alt="展示图" />
            </div>
            <div className="anscard-content">
                <div className="anscard-info">
                    <Avatar className="anscard-avatar" size={24} icon={<UserOutlined />} />
                    <span className="anscard-uploader">{uploader}</span>
                    <span className="anscard-time">{uploadTime}</span>
                </div>
                <h3 className="anscard-title">{title}</h3>
                <p className="anscard-desc">{description}</p>
            </div>
        </Link>
    )
}

function Recommended() {
    // 数据从数据库获取（GET /api/ans/recommended）
    const [list, setList] = useState([])
    const [loading, setLoading] = useState(false)
    const [keyword, setKeyword] = useState('')
    // anscard 图片源配置：custom=统一用配置图；api=用答案自带图
    const [imageCfg, setImageCfg] = useState({ mode: 'api', url: '' })

    // 统一处理推荐列表结果：load() 与 effect 共用
    function applyResult(res) {
        setLoading(false)
        if (res.code === 200) setList(res.data)
        else message.error(res.msg)
    }

    // 搜索时调用：会先显示 loading
    async function load(kw = keyword) {
        setLoading(true)
        applyResult(await ansApi.listRecommended({ keyword: kw, limit: 20 }))
    }

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await ansApi.listRecommended({ keyword: '', limit: 20 })
            if (!cancelled) applyResult(res)
        })()
        // 读取 anscard 图源配置（统一自定义图 / 答案自带图）
        settingsApi.getSettings()
            .then((res) => {
                if (cancelled) return
                if (res.code === 200) {
                    setImageCfg({ mode: res.data.ansImageMode || 'api', url: res.data.ansImageUrl || '' })
                }
            })
            .catch(() => { /* 读取失败用默认答案自带图 */ })
        return () => { cancelled = true }
    }, [])

    // 搜索：回车触发，避免每个字都打接口
    function handleSearch(value) {
        const kw = (value || '').trim()
        if (!kw) {
            message.info('请输入搜索内容')
            return
        }
        setKeyword(kw)
        load(kw)
    }

    return(
        <main>
            <div className="ct">
                <section>
                    <div className="title-card">
                        <div className="title-card-head">
                            {/* 默认不展示标题/副标题；仅在搜索时显示搜索结果信息 */}
                            <div>
                                {keyword ? (
                                    <>
                                        <h2>搜索：{keyword}</h2>
                                        <p>为你找到 {list.length} 条相关结果</p>
                                    </>
                                ) : null}
                            </div>
                            <Input.Search
                                placeholder="搜索答案标题/描述"
                                allowClear
                                enterButton
                                size="middle"
                                style={{ maxWidth: 320 }}
                                onSearch={handleSearch}
                                prefix={<SearchOutlined />}
                            />
                        </div>
                        {loading ? (
                            <ul className="title-card-skeleton">
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <li key={i}>
                                        <div className="anscard-skeleton">
                                            <Skeleton.Image active style={{ width: '100%', height: '100%' }} />
                                            <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : list.length === 0 ? (
                            <div className="title-card-empty">
                                <Empty
                                    description={keyword ? '没有找到匹配的答案' : '暂无答案，去后台上传一份试试吧'}
                                />
                            </div>
                        ) : (
                            <ul>
                                {list.map((ans) => (
                                    <li key={ans.ansId}>
                                        <AnsCard
                                            ansid={ans.ansId}
                                            imagesUrl={ans.imagesUrl}
                                            uploader={ans.uploader}
                                            uploadTime={ans.uploadTime}
                                            avatar={ans.avatar}
                                            title={ans.title}
                                            description={ans.description}
                                            imageMode={imageCfg.mode}
                                            customImage={imageCfg.url}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>
            </div>
        </main>
    )
}

export default function App() {
    return(
        <div className="page home">
            <Header />
            <Recommended />
            <Footer />
        </div>
    )
}
