import { Button, Form, Input } from "antd-mobile"
import { useState } from "react"
import { useNavigate } from 'react-router-dom'

import { getCurrentBook } from '../../modules/books/api'
import { login } from '../../modules/user/api'
import { useUserStore } from '../../modules/user/store'


export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const setToken = useUserStore(state => state.setToken)
  const navigate = useNavigate()

  const handleLogin = async (values: any) => {
    try {
      const res = await login({ email: values.email, password: values.password })
      setToken(res.data.token)

      // 检查用户是否已选择学习图书
      try {
        const currentBookRes = await getCurrentBook()
        if (currentBookRes.data.book) {
          // 用户已有学习图书，跳转到单词页面
          navigate('/words')
        } else {
          // 用户未选择学习图书，跳转到选书页面
          navigate('/books')
        }
      } catch (error: any) {
        console.error('获取当前图书失败:', error);
        // 获取当前图书失败，默认跳转到选书页面
        navigate('/books')
      }

      // Toast.show({ icon: 'success', content: '登录成功' })
    } catch (error: any) {
      console.error('登录失败:', error);
      // Toast.show({ icon: 'fail', content: error?.response?.data?.message || '登录失败' })
    }
  }

  return (
    <Form
      onFinish={handleLogin}
    >
      <Form.Item
        name="email"
        label="邮箱"
        rules={[{ required: true, message: '请输入邮箱' }]}
      >
        <Input
          placeholder="请输入邮箱"
          value={email}
          onChange={(e) => setEmail(e)}
        />
      </Form.Item>
      <Form.Item
        name="password"
        label="密码"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e)}
          type="password"
        />
      </Form.Item>
      <Button type="submit" block>登录</Button>
    </Form>
  )
}
