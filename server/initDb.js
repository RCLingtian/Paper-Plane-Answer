import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { pool } from './db.js'
import { md5 } from './utils.js'

dotenv.config()

// 内置管理员初始凭据（首次登录强制改密）；README 中同步说明
export const BUILTIN_ADMIN = {
    userId: 'u100000000',  // 必须为 u+数字，token 正则 /mock_token_(u\d+)_/ 才能识别
    email: 'admin@ans.dev',
    account: 'admin',
    password: 'admin123',
    nickname: '内置管理员'
}

// JS 注入默认值：超星 etc. 答案页面元素净化（隐藏 AI 助手/重做按钮/解析卡，恢复复制）
// 新装项目自动写入；已有空值由下方补丁一次性填充
// 导出供 settings 路由的「恢复默认」接口使用
export const DEFAULT_JS_INJECTION = `// 隐藏所有class为"aiAssistant"的a元素
document.querySelectorAll('a.aiAssistant').forEach(element => {
    element.style.display = 'none';
});

// 不再隐藏class为"subNav"的盒子内同时具有"subBack"和"fl"类的a元素
// 改为隐藏其中的.icon-BackIcon元素，并修改文字和href属性
document.querySelectorAll('.subNav a.subBack.fl').forEach(element => {
    // 隐藏.icon-BackIcon元素
    const iconElement = element.querySelector('.icon-BackIcon');
    if(iconElement) {
        iconElement.style.display = 'none';
    }
    
    // 修改文字为"返回首页"
    element.textContent = "";
    
    // 修改href属性为"/"
    element.href = "/";
});

// 允许复制所有class同时为"fanyaMarking_left"和"whiteBg"的盒子内的内容
// 只用 inline style 作用于元素自身，不向 head 注入 <style> 标签，避免污染作业全局 CSS
document.querySelectorAll('.fanyaMarking_left.whiteBg').forEach(container => {
    // 移除可能阻止复制的事件处理
    container.oncopy = null;
    container.addEventListener('copy', e => {
        e.stopPropagation(); // 阻止事件冒泡到可能有阻止复制的父元素
    });
    // 强制本元素及其子元素允许文本选择（inline style，作用域仅限本容器）
    container.style.userSelect = 'text';
    container.style.webkitUserSelect = 'text';
    container.querySelectorAll('*').forEach(el => {
        el.style.userSelect = 'text';
        el.style.webkitUserSelect = 'text';
    });
});

// 隐藏class="tipsIc"的span元素
document.querySelectorAll('span.tipsIc').forEach(element => {
    element.style.display = 'none';
});

document.querySelectorAll('a.redo').forEach(element => {
    element.style.display = 'none';
});

// 隐藏同时满足class="analysisCard fl"的盒子元素
document.querySelectorAll('.analysisCard.fl').forEach(element => {
    element.style.display = 'none';
});

// 替换特定CSS链接的href属性（用绝对路径 /static/，对应 public/static/ 目录，
// 避免在答案详情页 iframe（/api/view/:ansid）中相对路径被解析到 /api/view/static/ 而 404）
const targetLinks = document.querySelectorAll('link[href^="//mooc1.chaoxing.com/mooc-ans/mooc2/css/marking_icon.css"], link[href^="//mooc1.chaoxing.com/exam-ans/mooc2/css/q_marking_icon.css"]');
targetLinks.forEach(link => {
    link.href = '/static/q_marking_icon.css';
});`

// 确保数据库存在：用不指定 database 的连接 CREATE DATABASE IF NOT EXISTS
async function ensureDatabase() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    })
    try {
        const dbName = process.env.DB_NAME || 'ans_dash'
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4`)
        console.log(`[initDb] 数据库 ${dbName} 已就绪`)
    } finally {
        await conn.end()
    }
}

// 自动建表 + 写入种子数据（仅在表为空时写入种子）
export async function initDb() {
    await ensureDatabase()
    // 1. 建表（IF NOT EXISTS，已存在则跳过）
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            user_id VARCHAR(20) PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            account VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            nickname VARCHAR(50) NOT NULL,
            avatar VARCHAR(500) DEFAULT '',
            gender ENUM('male','female','unknown') DEFAULT 'unknown',
            school_id VARCHAR(20) DEFAULT NULL,
            class_id VARCHAR(20) DEFAULT NULL,
            status ENUM('active','disabled') DEFAULT 'active',
            role ENUM('admin','user') DEFAULT 'user',
            -- 1=首次登录/重置后必须修改密码（内置管理员初始为 1）
            force_password_change TINYINT(1) NOT NULL DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    // 兼容旧库：users 表已存在但缺 avatar 列时补上
    const [userCols] = await pool.query(`SHOW COLUMNS FROM users LIKE 'avatar'`)
    if (userCols.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN avatar VARCHAR(500) DEFAULT '' AFTER nickname`)
        console.log('[initDb] users 表已自动补加 avatar 列')
    }
    // 兼容旧库：补加强制改密标记列
    const [fpcCols] = await pool.query(`SHOW COLUMNS FROM users LIKE 'force_password_change'`)
    if (fpcCols.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN force_password_change TINYINT(1) NOT NULL DEFAULT 0 AFTER role`)
        console.log('[initDb] users 表已自动补加 force_password_change 列')
    }

    // 内置管理员账号：不存在才写入，force_password_change=1 首次登录强制改密
    // 已存在（管理员已改过密码/改了邮箱）则不覆盖
    const [adminRows] = await pool.query('SELECT user_id FROM users WHERE email = ? OR user_id = ?', [BUILTIN_ADMIN.email, BUILTIN_ADMIN.userId])
    if (adminRows.length === 0) {
        await pool.query(
            `INSERT INTO users (user_id, email, account, password, nickname, gender, status, role, force_password_change, create_time)
             VALUES (?, ?, ?, ?, ?, 'unknown', 'active', 'admin', 1, NOW())`,
            [BUILTIN_ADMIN.userId, BUILTIN_ADMIN.email, BUILTIN_ADMIN.account, md5(BUILTIN_ADMIN.password), BUILTIN_ADMIN.nickname]
        )
        console.log(`[initDb] 种子：内置管理员 ${BUILTIN_ADMIN.email}（初始密码 ${BUILTIN_ADMIN.password}，首次登录强制改密）`)
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schools (
            school_id VARCHAR(20) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            school_type ENUM('primary','junior','senior','vocational','college') DEFAULT 'senior',
            address VARCHAR(255) DEFAULT '',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    // 兼容旧库：schools 表已存在但缺 school_type 列时补上
    const [schoolCols] = await pool.query(`SHOW COLUMNS FROM schools LIKE 'school_type'`)
    if (schoolCols.length === 0) {
        await pool.query(`ALTER TABLE schools ADD COLUMN school_type ENUM('primary','junior','senior','vocational','college') DEFAULT 'senior' AFTER name`)
        console.log('[initDb] schools 表已自动补加 school_type 列')
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS classes (
            class_id VARCHAR(20) PRIMARY KEY,
            school_id VARCHAR(20) NOT NULL,
            name VARCHAR(50) NOT NULL,
            grade VARCHAR(20) DEFAULT '',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_school (school_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ans (
            ans_id VARCHAR(20) PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            content_html LONGTEXT,
            images_url VARCHAR(500) DEFAULT '',
            uploader VARCHAR(50) DEFAULT '',
            upload_time DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    // 系统配置表（key-value）
    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            skey VARCHAR(50) PRIMARY KEY,
            svalue LONGTEXT,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    // 站点导航菜单（支持二级：parent_id 指向某个顶级菜单）
    await pool.query(`
        CREATE TABLE IF NOT EXISTS menus (
            menu_id VARCHAR(20) PRIMARY KEY,
            parent_id VARCHAR(20) DEFAULT NULL,
            text VARCHAR(50) NOT NULL,
            url VARCHAR(500) NOT NULL,
            open_in_new_tab TINYINT(1) DEFAULT 0,
            external_link TINYINT(1) DEFAULT 0,
            sort_order INT DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_parent (parent_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    // 资源管理：上传的文件元信息（直链 = /api/files/raw/<storage_name>）
    await pool.query(`
        CREATE TABLE IF NOT EXISTS files (
            file_id VARCHAR(40) PRIMARY KEY,
            original_name VARCHAR(255) NOT NULL,
            storage_name VARCHAR(64) NOT NULL,
            size BIGINT NOT NULL DEFAULT 0,
            mime VARCHAR(100) DEFAULT '',
            uploader VARCHAR(50) DEFAULT '',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_create_time (create_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('[initDb] 表已就绪')

    // 一次性迁移：把历史明文密码（长度 != 32）自动 MD5 加密
    // MD5 输出固定 32 位 hex，明文密码长度不固定，借此识别旧数据
    const [plainRows] = await pool.query(
        "SELECT user_id, password FROM users WHERE CHAR_LENGTH(password) <> 32"
    )
    if (plainRows.length > 0) {
        for (const r of plainRows) {
            await pool.query(
                'UPDATE users SET password = MD5(?) WHERE user_id = ?',
                [r.password, r.user_id]
            )
        }
        console.log(`[initDb] 迁移：${plainRows.length} 个用户的明文密码已自动 MD5 加密`)
    }

    // 2. 种子数据：示例业务数据（学校/班级/用户/答案）已移除，新装项目为空库。
    //    如需创建第一个管理员账号，请通过 SQL 手动写入（参考 README.md）。


    // 系统配置（默认值兜底；缺失的 key 也在 GET 接口有默认值）
    const [settingRows] = await pool.query('SELECT COUNT(*) AS cnt FROM settings')
    if (settingRows[0].cnt === 0) {
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES
                ('js_injection', ?),
                ('highlight_lib', 'prism'),
                ('captcha_bg_url', ''),
                ('ans_image_mode', 'api'),
                ('ans_image_url', ''),
                ('allow_register', '1')`,
            [DEFAULT_JS_INJECTION]
        )
        console.log('[initDb] 种子：写入默认系统配置')
    }

    // 一次性补丁：旧库 js_injection 字段为空时填充默认值（仅执行一次，
    // 用 js_injection_seeded 标志位防止覆盖用户后续主动清空）
    const [seededRows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'js_injection_seeded'")
    if (seededRows.length === 0) {
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE svalue = IF(svalue IS NULL OR svalue = '', VALUES(svalue), svalue)`,
            ['js_injection', DEFAULT_JS_INJECTION]
        )
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES ('js_injection_seeded', '1')
             ON DUPLICATE KEY UPDATE svalue = '1'`
        )
        console.log('[initDb] 补丁：填充默认 JS 注入代码（一次性）')
    }

    // 补丁 v2：把旧版默认值（含动态注入 CSS 的 enableSelectionStyles 片段）替换为新版
    // 仅当 js_injection 仍是旧默认值（含 'enableSelectionStyles' 特征字符串）时执行，
    // 用户主动编辑过（不含该特征）则不会被覆盖
    const [v2Rows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'js_injection'")
    const oldJs = v2Rows[0]?.svalue || ''
    if (oldJs.indexOf('enableSelectionStyles') > -1) {
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
            ['js_injection', DEFAULT_JS_INJECTION]
        )
        console.log('[initDb] 补丁 v2：移除默认 JS 中的动态 CSS 注入段')
    }

    // 补丁 v3：把"仅清事件"版旧默认值升级为"清事件 + inline style 强制复制"版
    // 旧版特征：含 'fanyaMarking_left.whiteBg' 但不含 'container.style.userSelect'
    const [v3Rows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'js_injection'")
    const v3Js = v3Rows[0]?.svalue || ''
    if (v3Js.indexOf('fanyaMarking_left.whiteBg') > -1 && v3Js.indexOf('container.style.userSelect') === -1) {
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
            ['js_injection', DEFAULT_JS_INJECTION]
        )
        console.log('[initDb] 补丁 v3：升级默认 JS，加 inline style 强制复制')
    }

    // 补丁 v4：fuukei 验证码图 API 已失效，把 captcha_bg_url 仍是 fuukei 的清空，
    // 前端会用 picsum.photos seed 兜底（背景与拼图块同图，稳定可用）
    const [v4Rows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'captcha_bg_url'")
    const v4Bg = v4Rows[0]?.svalue || ''
    if (v4Bg.indexOf('fuukei') > -1) {
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES ('captcha_bg_url', '')
             ON DUPLICATE KEY UPDATE svalue = ''`
        )
        console.log('[initDb] 补丁 v4：fuukei 验证码 API 已失效，清空 captcha_bg_url，前端改用 picsum.photos')
    }

    // 补丁 v5：把默认 JS 中图标 CSS 的相对路径 'static/q_marking_icon.css'
    // 升级为绝对路径 '/static/q_marking_icon.css'（修复在 iframe 中被解析到 /api/view/static/ 而 404）
    // 仅当仍是旧默认值（含该相对路径特征）时替换；用户已手动修改则不覆盖
    const [v5Rows] = await pool.query("SELECT svalue FROM settings WHERE skey = 'js_injection'")
    const v5Js = v5Rows[0]?.svalue || ''
    if (v5Js.indexOf("link.href = 'static/q_marking_icon.css'") > -1) {
        await pool.query(
            `INSERT INTO settings (skey, svalue) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
            ['js_injection', DEFAULT_JS_INJECTION]
        )
        console.log('[initDb] 补丁 v5：图标 CSS 路径改为绝对路径 /static/q_marking_icon.css')
    }

    // 站点导航菜单：默认仅保留「首页」（后台仍可直接访问 /ans-dash，也可在菜单管理中自行添加）
    const [menuRows] = await pool.query('SELECT COUNT(*) AS cnt FROM menus')
    if (menuRows[0].cnt === 0) {
        await pool.query(
            `INSERT INTO menus (menu_id, parent_id, text, url, open_in_new_tab, external_link, sort_order, create_time) VALUES
                ('m1', NULL, '首页', '/', 0, 0, 1, '2026-08-24 10:00:00')`
        )
        console.log('[initDb] 种子：写入默认导航菜单（仅首页）')
    }

    // 补丁 v6：旧版默认菜单为「推荐/所有答案/后台」三项，精简为仅「首页」
    // m1 重命名；m2/m3 仍为默认值（menu_id + url 匹配）时删除，用户自建的菜单不动
    const [v6Rows] = await pool.query("SELECT menu_id, text, url FROM menus WHERE menu_id IN ('m1','m2','m3')")
    let v6Changed = false
    for (const row of v6Rows) {
        if (row.menu_id === 'm1' && row.text === '推荐' && row.url === '/') {
            await pool.query("UPDATE menus SET text = '首页' WHERE menu_id = 'm1'")
            v6Changed = true
        } else if (row.menu_id === 'm2' && row.text === '所有答案' && row.url === '/all') {
            await pool.query("DELETE FROM menus WHERE menu_id = 'm2'")
            v6Changed = true
        } else if (row.menu_id === 'm3' && row.text === '后台' && row.url === '/ans-dash') {
            await pool.query("DELETE FROM menus WHERE menu_id = 'm3'")
            v6Changed = true
        }
    }
    if (v6Changed) console.log('[initDb] 补丁 v6：默认导航菜单精简为仅「首页」')
}
