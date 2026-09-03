import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { Layout, Menu, Dropdown, Avatar, Breadcrumb, Tag, Typography, Drawer, Button, message } from 'antd'
import {
    FileTextOutlined,
    TeamOutlined,
    BankOutlined,
    HomeOutlined,
    LogoutOutlined,
    UserOutlined,
    SettingOutlined,
    MenuOutlined,
    FolderOpenOutlined
} from '@ant-design/icons'
import { useAuth } from '../auth/useAuth'
import './DashLayout.css'

const { Text } = Typography

const { Sider, Header, Content } = Layout

export default function DashLayout() {
    const { user, logout } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const isAdmin = user?.role === 'admin'
    // 手机端抽屉式侧边栏开关
    const [drawerOpen, setDrawerOpen] = useState(false)

    // 菜单扁平化：每项直接跳对应列表页，新建/编辑通过列表页内 Modal 完成
    const items = useMemo(() => {
        const list = [
            { key: '/ans-dash/ans', icon: <FileTextOutlined />, label: <Link to="/ans-dash/ans">答案管理</Link> },
            { key: '/ans-dash/files', icon: <FolderOpenOutlined />, label: <Link to="/ans-dash/files">资源管理</Link> }
        ]
        if (isAdmin) {
            list.push({ key: '/ans-dash/users', icon: <TeamOutlined />, label: <Link to="/ans-dash/users">用户管理</Link> })
            list.push({ key: '/ans-dash/schools', icon: <BankOutlined />, label: <Link to="/ans-dash/schools">学校管理</Link> })
            list.push({ key: '/ans-dash/menus', icon: <MenuOutlined />, label: <Link to="/ans-dash/menus">菜单管理</Link> })
            list.push({ key: '/ans-dash/settings', icon: <SettingOutlined />, label: <Link to="/ans-dash/settings">系统配置</Link> })
        }
        return list
    }, [isAdmin])

    // 选中态：取最长匹配路径
    const selectedKeys = useMemo(() => {
        const path = location.pathname
        if (path.startsWith('/ans-dash/ans')) return ['/ans-dash/ans']
        if (path.startsWith('/ans-dash/files')) return ['/ans-dash/files']
        if (path.startsWith('/ans-dash/users')) return ['/ans-dash/users']
        if (path.startsWith('/ans-dash/schools')) return ['/ans-dash/schools']
        if (path.startsWith('/ans-dash/menus')) return ['/ans-dash/menus']
        if (path.startsWith('/ans-dash/settings')) return ['/ans-dash/settings']
        return ['/ans-dash/ans']
    }, [location.pathname])

    // 面包屑：根据 path 解析；最后一项加粗强调当前页
    const breadcrumbItems = useMemo(() => {
        const path = location.pathname
        const items = [{ title: <Link to="/ans-dash">后台</Link> }]
        if (path.startsWith('/ans-dash/ans')) {
            items.push({ title: '答案管理' })
        } else if (path.startsWith('/ans-dash/files')) {
            items.push({ title: '资源管理' })
        } else if (path.startsWith('/ans-dash/users')) {
            items.push({ title: '用户管理' })
        } else if (path.includes('/schools') && path.includes('/classes')) {
            items.push({ title: '学校管理' })
            items.push({ title: '班级管理' })
        } else if (path.includes('/schools') && path.includes('/users')) {
            items.push({ title: '学校管理' })
            items.push({ title: '学校用户' })
        } else if (path.startsWith('/ans-dash/schools')) {
            items.push({ title: '学校管理' })
        } else if (path.startsWith('/ans-dash/menus')) {
            items.push({ title: '菜单管理' })
        } else if (path.startsWith('/ans-dash/settings')) {
            items.push({ title: '系统配置' })
        }
        // 最后一项（当前页）用粗体强调
        if (items.length > 0) {
            const last = items[items.length - 1]
            if (typeof last.title === 'string') {
                items[items.length - 1] = { title: <Text strong>{last.title}</Text> }
            }
        }
        return items
    }, [location.pathname])

    function handleMenuClick({ key }) {
        if (key === 'home') navigate('/')
        else if (key === 'logout') {
            logout()
            message.success('已退出登录')
            navigate('/login', { replace: true })
        }
    }

    const userMenu = {
        items: [
            { key: 'home', icon: <HomeOutlined />, label: '返回前台' },
            { type: 'divider' },
            { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }
        ],
        onClick: handleMenuClick
    }

    return (
        <Layout className="dash-layout" hasSider>
            {/* 桌面端固定侧边栏（手机端由 CSS 隐藏，改用抽屉） */}
            <Sider width={224} theme="light" className="dash-sider">
                <div className="dash-logo">纸条答案 · Dash</div>
                <Menu
                    mode="inline"
                    theme="light"
                    selectedKeys={selectedKeys}
                    items={items}
                />
            </Sider>
            <Layout className="dash-main">
                <Header className="dash-header">
                    <div className="dash-header-left">
                        {/* 手机端汉堡按钮，触发抽屉式侧边栏 */}
                        <Button
                            className="dash-menu-btn"
                            type="text"
                            icon={<MenuOutlined />}
                            onClick={() => setDrawerOpen(true)}
                            aria-label="菜单"
                        />
                        <Breadcrumb items={breadcrumbItems} />
                    </div>
                    <Dropdown menu={userMenu} placement="bottomRight">
                        <div className="dash-user">
                            <Avatar size={28} icon={<UserOutlined />} />
                            <span className="dash-username">{user?.nickname || '未登录'}</span>
                            {isAdmin && <Tag color="blue" bordered={false}>管理员</Tag>}
                        </div>
                    </Dropdown>
                </Header>
                <Content className="dash-content">
                    <Outlet />
                </Content>
            </Layout>
            {/* 手机端抽屉式侧边栏：选中菜单项后自动收起 */}
            <Drawer
                className="dash-drawer"
                placement="left"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                closable={false}
                width={224}
                styles={{ body: { padding: 0 } }}
            >
                <div className="dash-logo">纸条答案 · Dash</div>
                <Menu
                    mode="inline"
                    theme="light"
                    selectedKeys={selectedKeys}
                    items={items}
                    onClick={() => setDrawerOpen(false)}
                />
            </Drawer>
        </Layout>
    )
}
