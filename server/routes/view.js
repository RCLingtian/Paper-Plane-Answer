import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// HTML 实体转义（防止标题中的 < > & 破坏 HTML 结构）
function escapeHtml(s) {
    if (s == null) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// 拼装完整 HTML 文档
// 注意：代码高亮配置（settings.highlight_lib）作用于「系统配置中的 JS 注入代码」，
// 而非答案正文本身——粘贴的 HTML 自带样式，无需额外注入 Prism/highlight
function buildHtml({ title, contentHtml, jsInjection }) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - 纸条答案</title>
<style>
  /* 仅保留加载器必需样式，不污染作业正文，让粘贴的 HTML 按原始样式渲染 */
  html, body { margin: 0; padding: 0; }
  #ans-loader { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #f5f5f5; color: #666; z-index: 9999; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif; }
  #ans-loader .spinner { width: 48px; height: 48px; border: 4px solid #e0e0e0; border-top-color: #1677ff; border-radius: 50%; animation: ans-spin 0.8s linear infinite; }
  @keyframes ans-spin { to { transform: rotate(360deg); } }
  #ans-content { display: none; }
</style>
</head>
<body>
  <div id="ans-loader"><div class="spinner"></div><p>正在加载答案...</p></div>
  <div id="ans-content">${contentHtml || ''}</div>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      try {
        ${jsInjection || ''}
      } catch (e) { console.error('[ans-view] 注入 JS 出错:', e); }
      // 最小 200ms 延迟让用户看到加载动画，最多等待 3 秒兜底
      setTimeout(function() {
        var l = document.getElementById('ans-loader');
        var c = document.getElementById('ans-content');
        if (l) l.style.display = 'none';
        if (c) c.style.display = 'block';
        // 主动触发一次 resize 事件，让作业内依赖 resize 重算布局的元素
        // （如 #rightHeight）在 iframe 首次加载时立即复位，无需用户手动缩放窗口
        try { window.dispatchEvent(new Event('resize')); } catch(e) { /* 旧浏览器降级 */ }
      }, 200);
    });
  </script>
</body>
</html>`
}

// 拒绝地址栏直接访问：仅允许站内 iframe 加载（Sec-Fetch-Dest: iframe 或同源 Referer）
// 直接输入地址访问时 Sec-Fetch-Dest=document 且无 Referer，会被拦截
router.use('/:ansid', (req, res, next) => {
    const dest = req.headers['sec-fetch-dest']
    const isIframe = dest === 'iframe'
    let sameOrigin = false
    const referer = req.headers.referer
    if (referer) {
        try {
            const u = new URL(referer)
            sameOrigin = u.host === req.headers.host
        } catch { /* 非法 referer 视为不同源 */ }
    }
    if (isIframe || sameOrigin) return next()
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>无权直接访问</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;color:#666;text-align:center}div{padding:32px}a{color:#1677ff;text-decoration:none}</style>
</head>
<body><div><h2>请通过答案卡片进入</h2><p>该内容不支持直接通过地址访问</p><p><a href="/">返回首页</a></p></div></body>
</html>`
    return res.status(403).set('Content-Type', 'text/html; charset=utf-8').send(html)
})

// GET /api/view/:ansid  返回完整 HTML 文档（供 iframe 加载）
router.get('/:ansid', async (req, res) => {
    const { ansid } = req.params

    // 并行查 ans + settings
    const [ansRows] = await pool.query(
        'SELECT title, content_html FROM ans WHERE ans_id = ? LIMIT 1', [ansid]
    )
    const [settingRows] = await pool.query('SELECT skey, svalue FROM settings')
    const settings = {}
    for (const r of settingRows) settings[r.skey] = r.svalue

    if (ansRows.length === 0) {
        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>答案不存在</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;color:#666;text-align:center}div{padding:32px}a{color:#1677ff;text-decoration:none}</style>
</head>
<body><div><h2>答案不存在</h2><p>该答案可能已被删除</p><p><a href="/">返回首页</a></p></div></body>
</html>`
        res.set('Content-Type', 'text/html; charset=utf-8')
        return res.status(404).send(html)
    }

    const ans = ansRows[0]
    const html = buildHtml({
        title: ans.title,
        contentHtml: ans.content_html || '',
        jsInjection: settings.js_injection || ''
    })
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.send(html)
})

export default router
