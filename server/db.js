import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

// 全局连接池：复用连接，避免每次请求新建
export const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ans_dash',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
})

// 测试连接（启动时调用）
export async function testConnection() {
    const conn = await pool.getConnection()
    try {
        await conn.query('SELECT 1')
    } finally {
        conn.release()
    }
}
