# 接入 MySQL 数据库存储改造计划

## Context
当前项目是纯前端 Vite + React SPA，所有数据存在 [src/api/mockData.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/mockData.js) 的内存数组里，刷新即丢失。用户要求接入 MySQL 真实数据库，所有数据持久化，并提供 .env 配置文件填写数据库连接信息。

**已确认决策**：
- 后端：Node.js Express + mysql2（不引入 next.js）
- 配置：项目根 .env 文件（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）
- 初始化：后端启动时自动建表 + 写入种子数据（用户只需先建一个空数据库）
- 前后端通信：Vite dev server proxy `/api/*` → Express（3001 端口），前端无 CORS 问题

**保持兼容**：前端代码用的字段命名是英文驼峰（`schoolId`/`uploadTime`/`ansid`），数据库表字段用 snake_case（`school_id`/`upload_time`），后端做转换，前端 src/api/ 接口签名和响应结构完全不变，只把内部 `mock()` 调用换成 `fetch()` 调用。UI 层零改动。

## 1. 依赖安装
```bash
npm install express mysql2 dotenv cors
npm install -D nodemon concurrently
```
- `express`：后端框架
- `mysql2`：MySQL 驱动（用 promise 接口）
- `dotenv`：读 .env
- `cors`：开发期备用（proxy 模式下其实不需要，但保险起见）
- `nodemon`：后端热重载
- `concurrently`：一条命令并行启动前后端

## 2. .env 与 .gitignore
项目根新建 `.env`（用户填写）和 `.env.example`（模板）：
```
# MySQL 数据库连接
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ans_dash

# 后端服务端口
PORT=3001
```
`.gitignore` 追加一行 `.env`（不入库）。

## 3. 数据库表结构（4 张表）
字段用 snake_case，与前端 camelCase 通过后端转换层对应。

**users**：`user_id` PK / `email` UNIQUE / `account` UNIQUE / `password` / `nickname` / `gender` ENUM / `school_id` / `class_id` / `status` ENUM / `role` ENUM / `create_time` DATETIME

**schools**：`school_id` PK / `name` / `address` / `create_time`

**classes**：`class_id` PK / `school_id` INDEX / `name` / `grade` / `create_time`

**ans**：`ans_id` PK / `title` / `description` TEXT / `content_html` LONGTEXT / `images_url` / `uploader` / `upload_time` DATETIME

时间字段统一存 DATETIME，查询时格式化成 `YYYY/MM/DD HH:mm` 字符串返回前端（与现有 mock 行为一致）。

## 4. 后端目录结构（新增 server/）
```
server/
├─ index.js              # Express 入口：加载 dotenv、注册路由、启动前调 initDb()
├─ db.js                 # mysql2 连接池（读 .env）
├─ initDb.js             # CREATE TABLE IF NOT EXISTS + 种子数据 INSERT（仅空表时）
├─ utils.js              # 响应封装 ok()/fail()、snake↔camel 转换、formatTime()
└─ routes/
   ├─ auth.js            # POST /api/auth/login、GET /api/auth/me、POST /api/auth/logout
   ├─ ans.js             # GET/POST /api/ans、GET/PUT/DELETE /api/ans/:ansid
   ├─ users.js           # GET/POST /api/users、GET /api/users/:userid、PATCH /api/users/:userid/toggle
   └─ schools.js         # GET/POST/PUT/DELETE /api/schools、GET /api/schools/:id/classes（POST/PUT/DELETE 同前缀）、GET /api/schools/:id/users
```

**路由签名与现有 src/api/ 一一对应**：
- `GET /api/ans?page=1&pageSize=10&keyword=` → `{list, total}`
- `POST /api/ans` body={title,description,contentHtml,imagesUrl,uploader} → `{ansid}`
- `PATCH /api/users/:userid/toggle` body={status} → null
- 等等，完全复刻现有 mock 函数的行为

**响应格式**：所有接口统一返回 `{code, msg, data}`（code=200 成功），与现有 mock 完全一致，前端不动解析逻辑。

## 5. Vite proxy 配置（[vite.config.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/vite.config.js)）
```js
server: {
    proxy: {
        '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true
        }
    }
}
```
前端 fetch('/api/ans') 会被 Vite 转发到 Express，开发期无跨域。

## 6. 前端 API 层改造（[src/api/](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/)）
**[request.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/request.js)** 新增通用 fetch 封装：
```js
export async function request(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    })
    return res.json()  // {code, msg, data}
}
```
保留 `mock/mockFail/nowstamp/genId`（genId 前端生成 ID 时仍可用，但实际 ID 改由后端生成）。

**[auth.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/auth.js) / [ans.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/ans.js) / [users.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/users.js) / [schools.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/schools.js)**：
每个函数体内部从 `mock(...)` 改成 `request('GET'/'POST'/..., '/api/xxx', body)`，**函数签名和返回值完全不变**。

例如 `listAns`：
```js
export function listAns({ page=1, pageSize=10, keyword='' } = {}) {
    const qs = new URLSearchParams({ page, pageSize, keyword }).toString()
    return request('GET', `/api/ans?${qs}`)
}
```

**[mockData.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/mockData.js)**：保留文件但前端不再引用（种子数据已迁移到 server/initDb.js）。可以删，但为了不留 git 历史风险先保留并加注释说明已废弃。

## 7. package.json scripts
```json
"scripts": {
    "dev": "vite",
    "dev:server": "nodemon server/index.js",
    "dev:all": "concurrently \"npm:dev\" \"npm:dev:server\"",
    "build": "vite build"
}
```
开发时用 `npm run dev:all` 一条命令并行启动前后端。

## 8. 用户提到的「/ans-dash/ 应该看到左侧菜单」问题
当前路由 `/ans-dash` → `index → Navigate to="ans"`，会自动跳到 `/ans-dash/ans` 并渲染 DashLayout（含 Sider 菜单）。如果用户看不到菜单，最可能原因是：
1. 未登录被 ProtectedRoute 跳转到 /login
2. 用普通用户登录（菜单只有「答案管理」一项）

计划里会顺带验证这一点，确认菜单按角色正确渲染。

## 9. 实施顺序
1. **安装后端依赖**：express / mysql2 / dotenv / cors + nodemon / concurrently
2. **创建 .env / .env.example**，更新 .gitignore
3. **创建 server/ 全部文件**：db.js / initDb.js / utils.js / index.js / routes/{auth,ans,users,schools}.js
4. **改 vite.config.js** 加 proxy
5. **改 src/api/request.js** 加 fetch 封装
6. **改 src/api/ 四个业务文件**（auth/ans/users/schools）切换到 fetch 调用
7. **更新 package.json scripts**
8. **启动验证**：先 `npm run dev:server` 单独跑后端确认建表+种子，再 `npm run dev:all` 全栈启动，浏览器全链路测试

## 10. 验证方法
**前置条件**：用户本机 MySQL 已起，并手动创建空数据库：
```sql
CREATE DATABASE ans_dash DEFAULT CHARACTER SET utf8mb4;
```
（不建表，后端启动时自动建）

**验证步骤**：
1. `npm run dev:server` 启动后端 → 控制台应输出「表已就绪 / 种子数据已写入」
2. `mysql -e "USE ans_dash; SHOW TABLES;"` 应看到 4 张表
3. `mysql -e "SELECT user_id,email,role FROM ans_dash.users;"` 应看到 3 条种子用户
4. `npm run dev:all` 全栈启动
5. 浏览器 http://localhost:5174/login 用 `admin@ans.dev / 123456` 登录 → 进入 /ans-dash/ans，左侧菜单三项（答案/用户/学校管理）
6. 答案列表显示 2 条种子数据
7. 上传新答案 → 刷新页面 → 新答案仍在（验证持久化）
8. 用户管理：创建用户 → 刷新 → 仍在；停用/启用 → 刷新 → 状态保持
9. 学校管理：CRUD 学校/班级，刷新后数据保持
10. 关掉浏览器、重启 dev server → 所有数据仍在（验证真实持久化，不再丢）

## Critical Files
- 新增：server/index.js、server/db.js、server/initDb.js、server/utils.js、server/routes/*.js
- 新增：.env、.env.example
- 修改：[vite.config.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/vite.config.js)（加 proxy）
- 修改：[src/api/request.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/request.js)（加 fetch 封装）
- 修改：[src/api/auth.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/auth.js)、[ans.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/ans.js)、[users.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/users.js)、[schools.js](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/src/api/schools.js)（切换到 fetch）
- 修改：[package.json](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/package.json)（加依赖和 scripts）
- 修改：[.gitignore](file:///c:/Users/SZ2606/Desktop/纸条答案React版本/my-react-app/.gitignore)（加 .env）
