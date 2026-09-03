<div align="center">

# 纸条答案

**基于 React + Vite + Express + MySQL 的答案分享与后台管理系统**

前台支持答案浏览、自助注册登录；后台支持答案 / 学校 / 班级 / 用户 / 菜单 / 系统配置 / 资源管理。

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js\&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react\&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite\&logoColor=white)
![Ant Design](https://img.shields.io/badge/Ant%20Design-6-0170FE?logo=antdesign\&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express\&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8%2B-4479A1?logo=mysql\&logoColor=white)
![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey?logo=creativecommons\&logoColor=white)

</div>

***

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [静态资源说明](#静态资源说明)
- [数据库表结构](#数据库表结构)
- [npm 脚本](#npm-脚本)
- [开发说明](#开发说明)
- [生产部署](#生产部署)
  - [1. 构建前端](#1-构建前端)
  - [2. 部署站点目录结构](#2-部署站点目录结构)
  - [3. 用 PM2 守护后端](#3-用-pm2-守护后端)
  - [4. Nginx 配置（含刷新 404 解决方案）](#4-nginx-配置含刷新-404-解决方案)
  - [5. 启用 HTTPS](#5-启用-https)
- [安全设计](#安全设计)
- [常见问题](#常见问题)
- [License](#license)

***

## 功能特性

### 前台

- 首页答案卡片流浏览，支持关键词搜索
- 答案详情页：用户粘贴的 HTML 通过 **iframe sandbox 沙箱**渲染，防 XSS
- 自助注册 / 登录（滑块验证码；注册可由管理员开关）
- 答案详情页支持自定义 **JS 注入脚本**（净化复制限制、隐藏无关元素等）

### 后台（`/ans-dash`，需登录管理员账号）

| 模块   | 说明                                           |
| ---- | -------------------------------------------- |
| 答案管理 | 上传 HTML 文件 / 粘贴文本创建答案，编辑、删除（作者本人或管理员）        |
| 学校管理 | 学校增删改查，按小学/初中/高中/中专/大学筛选                     |
| 班级管理 | 按学校归属管理班级，联动下拉                               |
| 用户管理 | 增删改查、启用/停用、编辑资料与重置密码                         |
| 菜单管理 | 站点导航一级 / 二级菜单，外链、新窗口打开                       |
| 系统配置 | JS 注入代码（含「恢复默认」）、代码高亮库、验证码背景图、答案卡片图来源、开放注册开关 |
| 资源管理 | 文件上传直链分发、文本文件在线编辑（自动识别 GBK/UTF-8 编码）、图片在线预览  |

***

## 技术栈

| 层     | 技术                             |
| ----- | ------------------------------ |
| 前端框架  | React 19、React Router 7        |
| UI 组件 | Ant Design 6、@ant-design/icons |
| 构建工具  | Vite 8                         |
| HTTP  | 原生 fetch 封装                    |
| 后端    | Node.js、Express 5              |
| 数据库   | MySQL 8+（mysql2 连接池，utf8mb4）   |
| 编码处理  | iconv-lite（GBK/GB18030 文本自动识别） |
| 进程守护  | nodemon（开发）、pm2（生产）            |
| 代码规范  | ESLint 9                       |

***

## 目录结构

```
my-react-app/
├── public/                     # 静态资源（Vite 构建时原样复制到站点根路径）
│   ├── favicon.svg
│   └── static/                 # q_marking_icon 图标库：放 q_marking_icon.css + 字体文件，
│                               #   由默认 JS 注入脚本替换超星图标 CSS 后生效
├── src/
│   ├── api/                    # 前端 API 封装（request.js 通用 fetch + 各模块）
│   ├── assets/                 # 需要 import 参与构建的资源（图片等）
│   ├── auth/                   # 认证上下文 AuthProvider + 路由守卫
│   ├── components/             # 通用组件（滑块验证码 SliderCaptcha 等）
│   ├── layouts/                # 布局（Header / 后台布局等）
│   ├── pages/                  # 页面
│   │   ├── Home.jsx            # 首页
│   │   ├── Login.jsx           # 登录
│   │   ├── Register.jsx        # 注册
│   │   ├── View.jsx            # 答案详情（iframe 沙箱）
│   │   └── ans-dash/           # 后台页面（答案/学校/班级/用户/菜单/配置/资源）
│   ├── App.jsx                 # 路由根
│   ├── main.jsx                # 应用入口
│   └── index.css               # 全局样式
├── server/
│   ├── routes/                 # Express 路由
│   │   ├── auth.js             #   登录 / 注册
│   │   ├── ans.js              #   答案 CRUD
│   │   ├── users.js            #   用户 CRUD / 启停
│   │   ├── schools.js          #   学校 / 班级
│   │   ├── menus.js            #   导航菜单
│   │   ├── settings.js         #   系统配置 / 图片上传
│   │   ├── files.js            #   资源文件上传 / 在线编辑
│   │   └── view.js             #   答案详情 HTML 渲染（iframe 加载）
│   ├── uploads/                # 【运行时】上传文件存储（已 gitignore，勿入库）
│   ├── db.js                   # MySQL 连接池
│   ├── initDb.js               # 自动建库建表 + 默认配置 + 版本补丁
│   ├── utils.js                # 统一响应封装、MD5、ID 生成、XSS 校验
│   └── index.js                # 后端入口
├── .env                        # 环境变量（已 gitignore，需自建）
├── .env.example                # 环境变量示例
├── eslint.config.js
├── index.html
├── package.json
├── vite.config.js              # Vite 配置（/api 开发代理 → http://localhost:3001）
└── README.md
```

***

## 环境要求

| 软件      | 版本                                   |
| ------- | ------------------------------------ |
| Node.js | ≥ 18（内置 fetch；iconv-lite 纯 JS 无额外依赖） |
| MySQL   | ≥ 8.0（或 MariaDB ≥ 10.6），字符集 utf8mb4  |
| 包管理器    | npm ≥ 9（pnpm / yarn 亦可）              |

***

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/RCLingtian/Paper-Plane-Answer.git
cd my-react-app
```

### 2. 配置环境变量

```bash
# Windows PowerShell
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

按本机 MySQL 实际情况修改 `.env`（详见 [环境变量](#环境变量)）。

### 3. 安装依赖

```bash
npm install
```

### 4. 内置管理员账号（无需手动创建）

项目首次启动时会**自动创建数据库、表和内置管理员账号**（不含其他任何示例数据）。
内置管理员凭据如下：

| 项目 | 值 |
| --- | --- |
| 登录邮箱 | `admin@ans.dev` |
| 初始密码 | `admin123` |
| 角色 | 管理员（admin） |

> ⚠️ **首次登录必须修改密码**：使用初始密码登录后，系统会弹出**不可关闭**的改密弹窗，
> 且后端会拦截除改密/登出外的所有接口请求，直到你设置新密码为止。
> 这是内置账号的安全机制，请部署后第一时间登录并修改。
> 若忘记改过的密码，可在数据库中将该用户 `force_password_change` 置为 `1`
> 并把密码重置为 `admin123` 的 MD5（`0192023a7bbd73250516f069df18b500`），
> 下次登录即可重新走强制改密流程。

### 5. 启动项目

```bash
# 推荐：同时启动前后端（concurrently）
npm run dev:all
```

或开两个终端分别启动：

```bash
# 终端 1：后端（nodemon 热重载，端口 3001）
npm run dev:server

# 终端 2：前端（Vite，端口 5173）
npm run dev
```

### 6. 访问

| 入口     | 地址                                 |
| ------ | ---------------------------------- |
| 前台首页   | <http://localhost:5173>            |
| 后台登录   | <http://localhost:5173/login>      |
| 后端健康检查 | <http://localhost:3001/api/health> |

开发期 Vite 会把 `/api/*` 请求代理到 `http://localhost:3001`，无需处理跨域。

***

## 环境变量

`.env` 文件配置（参考 `.env.example`）：

| 变量            | 说明                   | 默认值         |
| ------------- | -------------------- | ----------- |
| `DB_HOST`     | MySQL 主机             | `localhost` |
| `DB_PORT`     | MySQL 端口             | `3306`      |
| `DB_USER`     | MySQL 用户             | `root`      |
| `DB_PASSWORD` | MySQL 密码（root 有密码必填） | 空           |
| `DB_NAME`     | 数据库名（不存在会自动创建）       | `ans_dash`  |
| `PORT`        | 后端服务端口（Vite 代理目标）    | `3001`      |

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=ans_dash
PORT=3001
```

***

## 静态资源说明

项目中有三类资源位置：

| 位置                | 用途                                       | 引用方式                   |
| ----------------- | ---------------------------------------- | ---------------------- |
| `public/`         | 项目内置默认资源（favicon 等），构建时原样复制              | 直接 `/favicon.svg`      |
| `public/static/`  | q\_marking\_icon 图标库（CSS + 字体）、答案卡片默认封面图 | `/static/...`          |
| `server/uploads/` | 【运行时】后台上传的文件，属运行时数据                      | `/api/files/raw/<文件名>` |

### 答案卡片默认封面图

答案未设置封面图时，卡片统一显示本地默认图 `/static/97f31784103f344d.jpg`
（**不请求任何外部随机图 API**）。需把图片文件放到：

```
public/static/97f31784103f344d.jpg
```

更换默认图：直接用同名文件替换即可。管理员也可在「后台 → 系统配置」选择
「统一使用自定义图」并上传一张图片，让所有卡片固定显示该图。

> 滑块验证码的随机背景图保留（picsum.photos 按 seed 取图，背景与拼图块同图），
> 也可在系统配置中填写固定图片 URL。

### q\_marking\_icon 图标库

默认 JS 注入脚本会把超星答案页的图标 CSS 链接替换为本地路径 `/static/q_marking_icon.css`。
需要把以下 5 个文件放入 `public/static/`（彼此同级，CSS 内部用相对路径引用字体）：

```
public/static/
├── q_marking_icon.css
├── marking.woff
├── marking.ttf
├── marking.svg
└── marking.eot
```

> 注意：`q_marking_icon.css` 内 `@font-face` 必须用**相对路径**引用字体
> （如 `url('marking.woff')`），不要写 `http://localhost:5173/...` 这类
> 开发环境地址，否则生产环境字体会 404。

> 路径必须是**绝对路径** `/static/...`：注入脚本在答案详情 iframe（`/api/view/:ansid`）中执行，
> 相对路径会被解析成 `/api/view/static/...` 而 404。

***

## 数据库表结构

| 表          | 说明                                                 |
| ---------- | -------------------------------------------------- |
| `users`    | 用户：邮箱/账户/密码(MD5)/昵称/性别/学校班级/状态/角色/强制改密标记          |
| `schools`  | 学校：名称、类型（primary/junior/senior/vocational/college） |
| `classes`  | 班级：归属学校、名称、年级                                      |
| `ans`      | 答案：标题、描述、HTML 正文(LONGTEXT)、封面图、上传者                 |
| `settings` | 系统配置 key-value（JS 注入、高亮库、注册开关等）                    |
| `menus`    | 导航菜单（parent\_id 支持二级）                              |
| `files`    | 资源文件元信息（原名、存储名、大小、MIME、上传者）                        |

所有表使用 `utf8mb4` 字符集，支持完整中文与 emoji。

***

## npm 脚本

| 命令                   | 说明                                       |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | 启动 Vite 前端开发服务器（端口 5173）                 |
| `npm run dev:server` | 启动 Express 后端（nodemon 热重载，端口 3001）       |
| `npm run dev:all`    | 同时启动前后端                                  |
| `npm run build`      | 前端生产构建，产物输出到 `dist/`                     |
| `npm run preview`    | 用 Vite 预览构建产物（**注意：此命令不代理 /api，纯前端预览**）  |
| `npm start`          | 生产模式启动后端；若存在 `dist/` 会同源托管前端（构建后用它预览/部署） |
| `npm run lint`       | ESLint 代码检查                              |

***

## 开发说明

- **接口约定**：后端统一返回 `{ code, msg, data }`，`code === 200` 为成功；
  非 JSON 响应（如 502 网关页）由前端统一兜底为错误结构。
- **认证**：登录返回 mock token，存于 `localStorage`，后续请求带
  `Authorization: Bearer <token>`；路由守卫在 `src/auth/`。
- **开发代理**：`vite.config.js` 将 `/api` 代理到 `http://localhost:3001`。
- **自动建表**：后端启动时执行 `initDb.js`，包含建库建表与历史版本补丁，可反复执行（幂等）。

***

## 生产部署

### 1. 构建前端

```bash
npm install
npm run build
```

构建产物在 `dist/`（含 `index.html`、`assets/`、`static/`）。

> **注意**：`npm run preview`（Vite 预览服务器）只托管静态文件，**不代理** **`/api`**，
> 直接访问会出现所有 API 请求失败。构建后请用下面的方式 A（Node 直接托管）或
> 方式 B（Nginx 反代）。

### 2. 方式 A：Node 直接托管（最简单，无需 Nginx，推荐）

后端在检测到 `dist/` 存在时会**自动托管前端静态文件并做 SPA 回退**，
前端与 API 同源（都在 `:3001`），一个进程搞定，刷新子页面也不 404。
服务器上把整个项目（含 `server/`、`package.json`、`.env`、`dist/`）放好后：

```bash
npm install --production   # 安装生产依赖
npm start                  # 即 node server/index.js
```

启动时看到日志 `已托管前端构建产物 dist/` 即生效，浏览器直接访问：

- `http://服务器IP:3001`（本地测试用 `http://localhost:3001`）

前端页面、`/api/*`、答案 iframe 全部同源，无需任何代理配置。
生产环境建议用下面的 PM2 守护该进程。

### 3. 用 PM2 守护后端（方式 A 生产推荐）

```bash
npm install -g pm2

# 直接启动
NODE_ENV=production pm2 start server/index.js --name ans-api

# 或使用配置文件（推荐，便于固化参数）
```

> 注意：项目 `package.json` 声明了 `"type": "module"`（ESM），
> PM2 配置文件请使用 **`.cjs`** **后缀**（如 `ecosystem.config.cjs`），
> 否则 `module.exports` 会报 `require is not defined`：

```js
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'ans-api',
    script: 'server/index.js',
    cwd: '/www/wwwroot/api',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M'
  }]
}
```

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup      # 按提示执行生成的命令，设置开机自启
```

### 4. 方式 B：Nginx 部署（前后端分离 / 独立 Web 服务器）

需要用 80/443 端口、域名、多站点或静态走 CDN 时，用 Nginx 分别托管前端静态文件并反代 API。

#### 4.1 部署站点目录结构

将 **`dist/`** **目录里的内容**（不是 dist 文件夹本身）放到站点根目录，例如
`/www/wwwroot/your-site/`，确保直接能看到：

```
/www/wwwroot/your-site/
├── index.html      ← 必须在站点根
├── assets/
├── static/
└── favicon.svg
```

> 常见坑：把整个 `dist/` 文件夹传上去导致根目录是 `.../dist/index.html`，
> Nginx root 指向后资源路径全部 404。请让 `index.html` 直接位于站点根。

后端代码整个 `server/` 目录 + `package.json` + `.env` 放到服务器，例如
`/www/wwwroot/api/`，执行 `npm install --production` 后用 PM2 启动（见上）。

#### 4.2 为什么刷新子页面会 404？

前端使用 React Router 的 **BrowserRouter（HTML5 history 模式）**：

- 页面内点击跳转（如 `/ans-dash`）由前端 JS 处理，不经过服务器；
- 但**直接访问或按 F5 刷新** `/ans-dash`、`/view/xxx` 这类地址时，
  浏览器会向 Nginx 请求 `/ans-dash` 这个真实路径——磁盘上并没有这个文件，
  Nginx 找不到就返回 **404**。

**解决方法**：Nginx 增加 `try_files $uri $uri/ /index.html;`，
让所有找不到的路径都回退到 `index.html`，再由 React Router 接管路由。
同时 `/api/` 必须优先反代到后端，**不能**被回退规则吞掉。
（方式 A 的 Express 已内置同样的回退逻辑，无需配置。）

#### 4.3 完整配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端构建产物（dist 内容所在目录，index.html 直接在根）
    root /www/wwwroot/your-site;
    index index.html;

    # 上传大答案/文件时允许较大请求体（后端 JSON 上限 50MB，文件 base64 约 27MB）
    client_max_body_size 60m;

    # gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1k;

    # ① 后端 API 反向代理（必须放在 SPA 回退之前）
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # ② 带哈希的构建资源：长缓存
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # ③ SPA 回退：解决刷新/直接访问子路由 404
    #    先找真实文件 → 再找目录 → 都没有就返回 index.html 交给前端路由
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

配置后重载：

```bash
nginx -t          # 检查语法
nginx -s reload   # 重载
```

> 如果你用**宝塔面板**：网站设置 → 「伪静态」中填入
> `location / { try_files $uri $uri/ /index.html; }`，
> 并在「反向代理」中把 `/api` 代理到 `http://127.0.0.1:3001`；
> 「配置文件」里把 `client_max_body_size` 改为 `60m`。

#### 其他生产托管方式

- **Node 直接托管（本项目已内置）**：即方式 A，`npm run build` 后 `npm start`，
  无需 Nginx 即可同源提供前端与 API。
- **对象存储/CDN（只放静态前端）**：上传 `dist/` 内容，开启 SPA 回退
  （多数平台叫 "Error document → /index.html" 或 "单页应用模式"）；
  API 需单独部署后端，并把前端的 `/api` 指向后端域名（建议同域反代，避免跨域）。

### 5. 启用 HTTPS

登录 token 与密码通过 HTTP 传输存在风险，生产环境务必启用 HTTPS：

```bash
# Certbot 一键申请 Let's Encrypt 证书（自动改写 Nginx 配置）
certbot --nginx -d your-domain.com
```

证书到期前 certbot 会自动续期。

***

## 安全设计

- **密码存储**：MD5 落库（入门方案，生产建议升级 bcrypt/argon2）；传输层用 HTTPS。
- **内置管理员强制改密**：内置账号 `admin@ans.dev` / `admin123` 带 `force_password_change=1`
  标记，首次登录弹出不可关闭的改密弹窗，且后端中间件拦截除改密/登出外的所有接口，
  改密成功后标记清零。
- **答案内容沙箱**：用户粘贴的 HTML 通过 `<iframe sandbox>` 渲染，
  未授予 `allow-same-origin`，脚本无法访问父页面 localStorage 中的登录态。
- **XSS 多层防护**：
  - 纯文本字段（昵称/标题/学校名等）后端拒绝含 `<` `>` 的输入；
  - 菜单 URL 拒绝 `javascript:` / `data:` / `vbscript:` / `file:` 协议；
  - 答案详情页标题在拼装 HTML 时做实体转义；
  - React 默认对插值做转义。
- **安全响应头**：`X-Content-Type-Options: nosniff`、`X-XSS-Protection`、
  `Referrer-Policy: same-origin`。
- **iframe 防劫持**：答案详情页校验 `Sec-Fetch-Dest: iframe` 或同源 Referer，
  禁止外站直接嵌入答案页。
- **权限后端兜底**：增删改接口二次校验作者身份或管理员角色；
  管理员账号不可删除、不可停用。
- **文本编码**：资源管理在线编辑使用 iconv-lite 自动识别 UTF-8/GBK/GB18030，
  保存统一为 UTF-8，避免中文乱码。

***

## 常见问题

**Q：启动后端报** **`ER_ACCESS_DENIED_ERROR`？**
A：`.env` 里的 `DB_USER` / `DB_PASSWORD` 与本机 MySQL 不一致；
或 MySQL 服务未启动。

**Q：默认管理员账号是什么？**
A：系统首次启动自动创建内置管理员：邮箱 `admin@ans.dev`，初始密码 `admin123`。
首次登录会**强制要求修改密码**（弹窗不可关闭、后端接口同步拦截），改密后才能正常使用。

**Q：`npm run build`** **后（或用** **`npm run preview`）所有 API 请求失败？**
A：Vite 的 `/api` 代理**只在 dev 模式生效**，构建产物是纯静态文件，preview 服务器
不代理 API。请用方式 A：构建后 `npm start` 启动后端（会自动托管 `dist/`），
访问 `http://localhost:3001`；或用方式 B 配置 Nginx 反代 `/api`。

**Q：部署后刷新** **`/ans-dash`** **等子页面 404？**
A：SPA 缺少 history 回退规则。方式 A 的 Express 已内置；Nginx 需添加
`try_files $uri $uri/ /index.html;`，详见 [生产部署](#生产部署)。

**Q：部署后页面空白、资源 404？**
A：检查站点根目录是否**直接**包含 `index.html` 和 `assets/`，
不要多套一层 `dist/` 目录。

**Q：上传文件/大答案报 413 Request Entity Too Large？**
A：Nginx 加 `client_max_body_size 60m;`（后端 JSON 上限 50MB）。

**Q：答案详情页打不开（控制台 sandbox 相关报错）？**
A：sandbox 故意未加 `allow-same-origin` 以隔离用户 HTML。
作业页内 JS 仍可运行，但无法读取父页面登录态——这是预期的安全隔离。

**Q：资源管理里打开中文 txt 是乱码？**
A：已用 iconv-lite 自动识别 GBK/GB18030 并在保存时转为 UTF-8；
若文件此前被旧版代码以乱码保存过，需重新上传原始文件。

**Q：粘贴超长 HTML 时编辑器卡顿？**
A：表单使用原生 `<textarea>` 非受控模式避免重渲染；
如仍卡，改用「上传 HTML 文件」方式创建答案。

**Q：忘记管理员密码怎么办？**
A：在 MySQL 中执行 SQL，将内置管理员密码重置为初始密码 `admin123`
并重新打开强制改密标记，之后用 `admin@ans.dev` / `admin123` 登录、按提示改密：

```sql
-- admin123 的 MD5 = 0192023a7bbd73250516f069df18b500
UPDATE users
SET password = '0192023a7bbd73250516f069df18b500',
    force_password_change = 1
WHERE account = 'admin';
```

***

## License

本项目采用 **[Attribution-NonCommercial-ShareAlike 4.0 International（CC BY-NC-SA 4.0）](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)**
许可协议，详见 [LICENSE](./LICENSE)。

<a rel="license" href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh">
<img alt="知识共享许可协议" style="border-width:0"
src="https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png" />
</a>

- **署名（BY）**：使用时须注明出处与作者
- **非商业性使用（NC）**：禁止商业用途
- **相同方式共享（SA）**：衍生作品须以相同协议发布

> 如需商业使用授权，请联系作者另行约定。

