import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import View from './pages/View'
import Go from './pages/Go'
import NotFound from './pages/NotFound'
import ProtectedRoute from './auth/ProtectedRoute'
import RoleGuard from './auth/RoleGuard'
import ForcePasswordGate from './auth/ForcePasswordGate'
import DashLayout from './layouts/DashLayout'
import AnsList from './pages/ans-dash/AnsList'
import UsersList from './pages/ans-dash/UsersList'
import SchoolsList from './pages/ans-dash/SchoolsList'
import ClassesManage from './pages/ans-dash/ClassesManage'
import SchoolUsers from './pages/ans-dash/SchoolUsers'
import SettingsPage from './pages/ans-dash/Settings'
import MenusManage from './pages/ans-dash/MenusManage'
import FilesList from './pages/ans-dash/FilesList'

function App() {
    return (
        <>
            {/* 首次登录强制改密闸门：forcePasswordChange=1 时弹出不可关闭弹窗 */}
            <ForcePasswordGate />
            <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            {/* 注册页：前台自助注册普通用户 */}
            <Route path="/reg" element={<Register />} />
            {/* 答案详情页：iframe 加载后端 HTML 渲染 */}
            <Route path="/view/:ansid" element={<View />} />
            {/* 外链跳转中转页：/go?url=<encoded>，给用户一次确认机会防钓鱼 */}
            <Route path="/go" element={<Go />} />

            {/* 后台：受登录保护 */}
            <Route path="/ans-dash" element={<ProtectedRoute><DashLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="ans" replace />} />
                <Route path="ans" element={<AnsList />} />
                {/* 资源管理：所有登录用户可见，按 uploader 控制删除权限 */}
                <Route path="files" element={<FilesList />} />

                {/* 用户/学校管理仅 admin 可见 */}
                <Route path="users" element={<RoleGuard roles={['admin']}><UsersList /></RoleGuard>} />

                <Route path="schools" element={<RoleGuard roles={['admin']}><SchoolsList /></RoleGuard>} />
                <Route path="schools/:id/classes" element={<RoleGuard roles={['admin']}><ClassesManage /></RoleGuard>} />
                <Route path="schools/:id/users" element={<RoleGuard roles={['admin']}><SchoolUsers /></RoleGuard>} />

                {/* 系统配置仅 admin 可见 */}
                <Route path="settings" element={<RoleGuard roles={['admin']}><SettingsPage /></RoleGuard>} />

                {/* 菜单管理仅 admin 可见 */}
                <Route path="menus" element={<RoleGuard roles={['admin']}><MenusManage /></RoleGuard>} />
            </Route>

            <Route path="*" element={<NotFound />} />
        </Routes>
        </>
    )
}

export default App
