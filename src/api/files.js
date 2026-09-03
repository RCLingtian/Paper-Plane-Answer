import { request } from './request'

// 上传文件：读取 File 为 base64 后 POST，返回直链
export async function uploadFile(file, uploader) {
    const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(new Error('读取文件失败'))
        r.readAsDataURL(file)
    })
    return request('POST', '/api/files/upload', {
        name: file.name,
        mime: file.type,
        data: dataUrl,
        uploader
    })
}

// 列出所有文件
export function listFiles() {
    return request('GET', '/api/files')
}

// 删除指定文件
export function deleteFile(fileId) {
    return request('DELETE', `/api/files/${fileId}`)
}

// 获取文件内容（文本/图片预览用）
export function getFileContent(fileId) {
    return request('GET', `/api/files/${fileId}/content`)
}

// 更新文本文件内容
export function updateFileContent(fileId, content) {
    return request('PUT', `/api/files/${fileId}/content`, { content })
}
