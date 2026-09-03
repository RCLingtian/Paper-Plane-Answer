import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Table, Tag, Typography, Breadcrumb, message } from 'antd'
import { Link } from 'react-router-dom'
import * as schoolsApi from '../../api/schools'

const { Text } = Typography

const genderMap = { male: '男', female: '女', unknown: '未知' }
const genderColor = { male: 'blue', female: 'magenta', unknown: 'default' }

export default function SchoolUsers() {
    const { id: schoolId } = useParams()
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState([])
    const [schoolName, setSchoolName] = useState('')

    // 切换学校时拉取用户与校名：setstates 都在 await 后的异步回调中，不在 effect 同步路径
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const [usersRes, schRes] = await Promise.all([
                schoolsApi.listUsersBySchool(schoolId),
                schoolsApi.listSchools()
            ])
            if (cancelled) return
            setLoading(false)
            if (usersRes.code === 200) setData(usersRes.data)
            else message.error(usersRes.msg)
            if (schRes.code === 200) {
                const s = schRes.data.find((x) => x.schoolId === schoolId)
                setSchoolName(s?.name || '未知学校')
            }
        })()
        return () => { cancelled = true }
    }, [schoolId])

    const columns = [
        { title: '昵称', dataIndex: 'nickname', render: (t) => <Text strong>{t}</Text> },
        { title: '账户名', dataIndex: 'account', width: 120 },
        { title: '邮箱', dataIndex: 'email', width: 200 },
        { title: '性别', dataIndex: 'gender', width: 70, render: (g) => <Tag color={genderColor[g]}>{genderMap[g]}</Tag> },
        { title: '角色', dataIndex: 'role', width: 90, render: (r) => <Tag color={r === 'admin' ? 'gold' : 'default'}>{r === 'admin' ? '管理员' : '普通用户'}</Tag> },
        {
            title: '状态', dataIndex: 'status', width: 90,
            render: (s) => <Tag color={s === 'active' ? 'green' : 'red'}>{s === 'active' ? '启用' : '停用'}</Tag>
        },
        { title: '创建时间', dataIndex: 'createTime', width: 150 }
    ]

    return (
        <div>
            <Breadcrumb
                items={[
                    { title: <Link to="/ans-dash">后台</Link> },
                    { title: <Link to="/ans-dash/schools">学校管理</Link> },
                    { title: `${schoolName} · 用户列表` }
                ]}
                style={{ marginBottom: 12 }}
            />
            <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>{schoolName} 下用户列表</h2>
            <Table
                rowKey="userId"
                columns={columns}
                dataSource={data}
                loading={loading}
                pagination={false}
                size="middle"
            />
        </div>
    )
}
