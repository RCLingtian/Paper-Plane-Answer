# 答案详情页 + JS 注入配置 实现计划

## Context（背景）

当前项目"纸条答案"是 React + Express 的答案分享平台。首页 AnsCard 点击后没有详情页可看，需求是新建答案详情页 `/view/:ansid`，用 iframe 加载后端渲染的完整 HTML 文档（"PHP 风格"的服务端渲染），并在管理面板新增一个"系统配置"页面，让管理员配置在所有答案页面注入的 JS 代码（用于统计、自定义脚本等）和代码高亮库。

后端是纯 Node.js Express（无 PHP 环境），用户已确认用 Node 直接返回 HTML 即可。代码高亮库选 Prism.js。JS 注入在 DOMContentLoaded 后自动执行，3 秒超时后强制显示内容。

## 设计要点

### 1. HTML 拼装策略（后端 view 路由核心）

`GET /api/view/:ansid` 返回 `Content-Type: text/html` 的完整 HTML 文档，结构：
- `<head>`：标题 + Prism.js CSS（根据配置）+ 内联预加载动画 CSS
- `<body>`：
  - `<div id="ans-loader">` 居中转圈 spinner（fixed 全屏）
  - `<div id="ans-content" style="display:none">` 内嵌 content_html
  - Prism.js JS（根据配置）
  - `<script>` 内联：DOMContentLoaded 后 try/catch 执行注入 JS → 调用 `Prism.highlightAll()` → 200ms 后隐藏 loader 显示 content（最大超时 3 秒由 setTimeout 兜底）

content_html 兼容：如果用户上传的是完整 HTML 文档（含 `<html>/<body>`），整段塞进 `<div id="ans-content">`，浏览器会自动处理嵌套标签并应用其中的 `<style>/<script>`。

### 2. settings 表（key-value）

```sql
CREATE TABLE settings (
  skey VARCHAR(50) PRIMARY KEY,
  svalue LONGTEXT,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
```

种子：`js_injection=''`、`highlight_lib='prism'`。

### 3. Prism.js CDN（默认配置）

- CSS: `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css`
- JS: `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js`
- autoloader: `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js`（按需加载语言组件）

highlight_lib 取值：`prism` / `highlight` / `none`。

## 文件改动

### 新建文件

#### `server/routes/view.js`
- `GET /api/view/:ansid`：查 ans 表拿 title/content_html + 查 settings 拿 js_injection/highlight_lib → 拼装 HTML 字符串 → `res.set('Content-Type', 'text/html; charset=utf-8').send(html)`
- 答案不存在时返回简单 HTML 显示"答案不存在"+ 返回首页链接
- 复用 `pool` 和 `rowToCamel`（已在 `server/utils.js` 和 `server/db.js`）

#### `server/routes/settings.js`
- `GET /api/settings`：返回 `{ jsInjection, highlightLib }`
- `PUT /api/settings`：admin only，body `{ jsInjection, highlightLib }`，UPSERT 到 settings 表
- 复用 `ok`/`fail` 响应封装

#### `src/api/settings.js`
- `getSettings()` → GET `/api/settings`
- `updateSettings(payload)` → PUT `/api/settings`

#### `src/pages/View.jsx`
- 路由 `/view/:ansid`
- 布局：`<Header />` + `<main>` + `<Footer />`（**不使用 .ct**，main 直接作为 iframe 容器）
- main 内放 `<iframe src={`/api/view/${ansid}`} title="答案详情" />`，iframe 占满 main 高度
- 从 `Home.jsx` 导入 `Header`、`Footer`（已存在的命名导出）
- 加载状态：iframe `onLoad` 处理（可选，因为 iframe 内部已有 loader）

#### `src/pages/View.css`
- `main` 样式：无 padding，作为 iframe 容器
- `iframe`：`width: 100%; height: calc(100vh - Header高度 - Footer高度); border: 0;`

#### `src/pages/ans-dash/Settings.jsx`
- 表单：
  - `Form.Item label="代码高亮库"` Select：prism/highlight/none
  - `Alert type="info"` 提示："不需要写 `<script>` 标签，直接写 JS 代码即可。代码会在 DOMContentLoaded 后自动执行。"
  - `Form.Item label="JS 注入代码"` TextArea（rows=12，monospace 字体 `font-family: 'Consolas', monospace`）
  - 保存按钮 → `updateSettings`
- 使用 antd `Form` + `Form.useForm()`，加载时 `getSettings` 回填

### 修改文件

#### `server/index.js`
- import 并挂载 `viewRoutes` 到 `/api/view`、`settingsRoutes` 到 `/api/settings`

#### `server/initDb.js`
- 在建表区加 `CREATE TABLE IF NOT EXISTS settings (...)`
- 在种子区加：判断 settings 表为空时插入 `js_injection=''`、`highlight_lib='prism'`

#### `src/App.jsx`
- 加 `<Route path="/view/:ansid" element={<View />} />`
- 在 ans-dash 嵌套路由下加 `<Route path="settings" element={<RoleGuard roles={['admin']}><SettingsPage /></RoleGuard>} />`

#### `src/pages/Home.jsx`
- AnsCard 的 Link `to={/ans/${ansid}}` → `to={/view/${ansid}}`

#### `src/layouts/DashLayout.jsx`
- 菜单 items 末尾（仅 admin）加：`{ key: '/ans-dash/settings', icon: <SettingOutlined />, label: <Link to="/ans-dash/settings">系统配置</Link> }`
- selectedKeys 加 `if (path.startsWith('/ans-dash/settings')) return ['/ans-dash/settings']`
- 面包屑加 `else if (path.startsWith('/ans-dash/settings')) items.push({ title: '系统配置' })`
- import `SettingOutlined` from `@ant-design/icons`

## 关键代码模板

### view.js HTML 拼装核心

```js
function buildHtml({ title, contentHtml, jsInjection, highlightLib }) {
    const headExtra = highlightLib === 'prism'
        ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">`
        : highlightLib === 'highlight'
        ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css">`
        : ''
    const bodyScript = highlightLib === 'prism'
        ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
           <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>`
        : highlightLib === 'highlight'
        ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>`
        : ''
    const highlightCall = highlightLib === 'prism'
        ? `if (window.Prism) Prism.highlightAll();`
        : highlightLib === 'highlight'
        ? `if (window.hljs) document.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));`
        : ''

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - 纸条答案</title>
${headExtra}
<style>
  #ans-loader { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #f5f5f5; font-family: system-ui, -apple-system, sans-serif; color: #666; }
  #ans-loader .spinner { width: 48px; height: 48px; border: 4px solid #e0e0e0; border-top-color: #1677ff; border-radius: 50%; animation: ans-spin 0.8s linear infinite; }
  @keyframes ans-spin { to { transform: rotate(360deg); } }
  #ans-content { display: none; padding: 24px; max-width: 960px; margin: 0 auto; line-height: 1.7; }
</style>
</head>
<body>
  <div id="ans-loader"><div class="spinner"></div><p>正在加载答案...</p></div>
  <div id="ans-content">${contentHtml}</div>
  ${bodyScript}
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      try {
        ${jsInjection}
      } catch (e) { console.error('[ans-view] 注入 JS 出错:', e); }
      ${highlightCall}
      setTimeout(function() {
        var l = document.getElementById('ans-loader');
        var c = document.getElementById('ans-content');
        if (l) l.style.display = 'none';
        if (c) c.style.display = 'block';
      }, 200);
    });
  </script>
</body>
</html>`
}
```

### iframe 安全说明
iframe 加载同源 `/api/view/:ansid`，无跨域问题。iframe 内的 JS 在 sandbox 默认 same-origin 下能正常执行。不设 sandbox 属性以允许脚本执行（同源可信内容）。

## 验证步骤

1. **重启后端**：`StopCommand` 旧后端 → `node server/index.js`，确认日志显示"表已就绪"+settings 种子写入
2. **首页 AnsCard 链接**：浏览器打开 `http://localhost:5173/`，snapshot 看 AnsCard 的 Link href 是否为 `/view/{ansid}`
3. **点击 AnsCard**：进入 `/view/:ansid`，snapshot 看 iframe 是否加载（可看 iframe 的 src 属性）
4. **iframe 内渲染**：直接 curl `http://localhost:3001/api/view/827364519` 验证返回的 HTML 包含：loader、content、Prism CDN、注入 JS
5. **配置页面**：登录管理员 → 后台菜单"系统配置" → 修改高亮库为 `none` + 在 JS 注入输入 `console.log('hello from injection')` → 保存 → 重新访问答案页 → 浏览器 console 应看到 'hello from injection'
6. **代码高亮**：上传含 `<pre><code class="language-js">...</code></pre>` 的答案，访问 view 页面应看到高亮效果
7. **菜单与面包屑**：访问 `/ans-dash/settings` 看菜单选中态 + 面包屑"后台 / 系统配置"（最后一项加粗）
