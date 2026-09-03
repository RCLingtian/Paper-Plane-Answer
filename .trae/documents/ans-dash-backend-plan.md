# ans-dash 后台模块实施计划

## Context
当前项目是 Vite + React SPA（react-router-dom@7），仅有首页 Home，无 antd、无 API 层、无登录态。用户要求构建一个名为 `ans-dash` 的后台，含答案管理、用户管理、学校管理三大板块，所有 UI 用 Ant Design，所有数据操作走 API（前期用前端 mock 层模拟，后续可替换为真实后端），并需要完整 mock 登录流程 + admin 角色权限控制。原有 Home.jsx 顶部导航的 "后台" 指向 `/ans-admin`，需统一改为 `/ans-dash`。

## 已确认的决策
- API 层：前端 mock（`Promise + setTimeout`，统一 `{code,msg,data}` 响应形状）
- 验证码：滑块拼图验证码（前端实现，校验拖动偏移量）
- 权限：完整 mock 登录流程（登录页 + token + ProtectedRoute + RoleGuard）
- 学校管理：学校 CRUD + 班级 CRUD + 查看学校下用户列表
- UI：Ant Design v5

## 1. 依赖安装
```bash
npm install antd@^5 @ant-design/icons@^5 dayjs
```
不引入 axios / 状态库 / next.js。

## 2. 目录结构（src 下新增）
```
src/
├─ api/
│  ├─ mockData.js          # 种子数据：users / schools / classes / ans
│  ├─ request.js           # mock(fn) → Promise + setTimeout
│  ├─ auth.js              # login / logout / getCurrentUser
│  ├─ ans.js               # listAns/getAns/createAns/updateAns/deleteAns
│  ├─ users.js             # listUsers/getUser/createUser/toggleUser
│  └─ schools.js           # 学校/班级/学校用户
├─ auth/
│  ├─ AuthContext.jsx      # Provider + state，localStorage 持久化
│  ├─ useAuth.js           # useContext(AuthContext)
│  ├─ ProtectedRoute.jsx   # 未登录 → /login?from=
│  └─ RoleGuard.jsx        # 角色不符 → /ans-dash
├─ layouts/
│  ├─ DashLayout.jsx       # Layout[Sider+Header+Content] + <Outlet/>
│  └─ DashLayout.css       # rem，沿用 Home 风格
├─ components/
│  ├─ SliderCaptcha.jsx    # 滑块拼图
│  └─ SliderCaptcha.css
└─ pages/
   ├─ Login.jsx
   ├─ NotFound.jsx
   └─ ans-dash/
      ├─ AnsList.jsx
      ├─ AnsForm.jsx       # add + edit 共用，靠 useParams 判定
      ├─ UsersList.jsx
      ├─ UserForm.jsx
      ├─ SchoolsList.jsx
      ├─ ClassesManage.jsx
      └─ SchoolUsers.jsx
```

## 3. 路由配置（[App.jsx](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/App.jsx)）
保持现有 `Routes/Route` 写法，DashLayout 作为嵌套父路由，用 `<Outlet/>` 渲染子页面：
- `/ans-dash` → `ProtectedRoute > DashLayout`
  - index → `Navigate to="ans"`
  - `ans` → AnsList
  - `ans/add` → AnsForm
  - `ans/edit/:ansid` → AnsForm
  - `users` / `users/add` → `RoleGuard roles=['admin']` 包裹
  - `schools` / `schools/:id/classes` / `schools/:id/users` → `RoleGuard roles=['admin']` 包裹
- `/login` → Login
- `*` → NotFound

[main.jsx](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/main.jsx) 在 BrowserRouter 外包一层 `<AuthProvider>`。

## 4. mock API 接口签名
所有函数返回 `Promise<{code,msg,data}>`，code=200 成功。
- **auth.js**：`login(email,pwd) → {token, user{userid,email,nickname,role}}` / `getCurrentUser()` / `logout()`
- **ans.js**：`listAns({page,pageSize,keyword?}) → {list, total}` / `getAns(ansid)` / `createAns(payload) → {ansid}` / `updateAns(ansid,payload)` / `deleteAns(ansid)`
- **users.js**：`listUsers({page,pageSize,schoolId?,status?}) → {list, total}` / `createUser(payload) → {userid}` / `toggleUser(userid,status)`
- **schools.js**：`listSchools` / `createSchool` / `updateSchool` / `deleteSchool` / `listClasses(schoolId)` / `createClass` / `updateClass` / `deleteClass` / `listUsersBySchool(schoolId)`

字段命名沿用现有英文驼峰风格（`imagesUrl`、`uploadTime`、`ansid`、`userid`、`schoolId`、`classId`）。

## 5. auth 层
- **AuthContext**：state `{user, token, loading}`，提供 `login(email,pwd)` / `logout()`；登录成功后写 `localStorage.ans_dash_token`，初始化若有 token 调 `getCurrentUser` 恢复 user。
- **ProtectedRoute**：`loading` 显示 antd `Spin`；无 user → `<Navigate to="/login?from={pathname}">`；否则 `<Outlet/>`。
- **RoleGuard**：`user.role in roles ? children : <Navigate to="/ans-dash">` + `message.error('无权限')`。

## 6. DashLayout
- antd `Layout`：Sider（宽度 14rem，可收起）+ Header + Content。
- Sider `Menu` 动态构造：`答案管理`（含 列表/新建 子项）始终显示；`用户管理`、`学校管理` 仅 `user.role==='admin'` 时加入。用 `useLocation` 高亮 `selectedKeys`。
- Header 右侧：`Dropdown`（头像+昵称）含「返回前台」「退出登录」；左侧 antd `Breadcrumb` 解析当前路径。
- Content 内 padding 1.5rem，背景色与 Home 一致。

## 7. SliderCaptcha 组件
- props：`{ width?, onSuccess, onFail?, resetKey? }`
- 内部：mount 时随机生成缺口位置 `bgOffset∈[80, width-60]`；`onMouseMove` 计算 `sliderX=clamp(x-startX,0,width-40)`；松手时 `|sliderX-bgOffset|<5` 视为通过，调 `onSuccess`，否则归零 + `onFail`。
- 背景图：用文生图 API 生成一张拼图底图 + 缺口块（绝对定位）。
- `resetKey` 变化时重新生成偏移量。

## 8. AnsForm（add/edit 共用）
- `useParams()` 取 `ansid` → 有则 `useEffect` 调 `getAns` 填表单，标题改「编辑答案」。
- antd `Form layout="vertical"`：
  - `title` Input，required，max 50
  - `description` TextArea，optional
  - `uploadType` Radio.Group：`html` | `text`，默认 html
  - html 模式：`Upload.Dragger` accept=".html"，`beforeUpload` 读 `File.text()` 存 `contentHtml`，`return false` 阻止真上传
  - text 模式：`Input.TextArea`，内容即 `contentHtml`
  - `SliderCaptcha` 必须 onSuccess 才允许提交（提交按钮 disabled 直到 passed=true）
- Footer：`上传`/`确认`（submit）+ `取消`（`navigate(-1)`）。
- submit → 调 `createAns`/`updateAns` → `message.success` → `navigate('/ans-dash/ans')`。

## 9. mock 初始数据（mockData.js）
- **users**：admin（`admin@ans.dev` / `123456` / role=admin）+ 2 个普通用户（1 启用、1 停用）
- **schools**：2 所（北京测试一中、上海测试二中）
- **classes**：3 个班级分属上述学校
- **ans**：2 条，复用 Home.jsx `recommendedData.data[0].data` 结构，补 `contentHtml` 字段

## 10. Home.jsx 改动
单点：第 27 行 `"url": "/ans-admin"` → `"url": "/ans-dash"`。其余不动。

## 11. 实施顺序
1. 依赖安装 + 目录骨架 + mockData + request.js（跑通 `npm run dev` 无报错）
2. auth 层 + Login + ProtectedRoute（能登录、能持久化、未登录跳转）
3. DashLayout + 路由壳 + 角色菜单（访问 `/ans-dash` 见空内容，菜单按角色显示）
4. SliderCaptcha 独立组件（单独可验证后再集成表单）
5. 答案模块（AnsList + AnsForm 含验证码）—— 最核心、最先交付
6. 用户模块 + 学校模块（含班级/学校用户列表）—— 批量补齐
7. 回改 Home.jsx 的 `/ans-admin` → `/ans-dash`，全链路联调

## 验证方法
- `npm run dev` 启动后：
  - 未登录访问 `/ans-dash` → 跳 `/login?from=/ans-dash`
  - 用 `admin@ans.dev / 123456` 登录 → 进入 `/ans-dash/ans`，菜单含三项
  - 用普通用户登录 → 菜单只显示「答案管理」，访问 `/ans-dash/users` 弹「无权限」并跳回
  - `/ans-dash/ans/add`：拖动滑块完成验证 → 填表 → 上传成功跳回列表，新条目出现在表格里，含时间戳
  - 列表点「编辑」→ `/ans-dash/ans/edit/xxx` 表单预填 → 修改提交 → 列表更新
  - 列表点「删除」→ 确认 → 表格少一行
  - 用户/学校/班级 CRUD 同理走通
  - Home 顶部「后台」按钮指向 `/ans-dash`，登录后可直接进入后台
