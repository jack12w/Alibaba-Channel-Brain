import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, App } from 'antd';
import { LockOutlined, UserOutlined, ApiOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api, setAuth } from '../api/client';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const data = await api.login(values.username, values.password);
      setAuth(data.token, data.user);
      message.success('登录成功');
      window.location.href = '/';
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <Card style={{ width: '100%', maxWidth: 380, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <ApiOutlined style={{ fontSize: 40, color: 'var(--ant-color-primary)' }} />
          <Typography.Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>
            渠道中心大脑
          </Typography.Title>
          <Typography.Text type="secondary">成都国际站渠道商经营管理系统</Typography.Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登 录
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, textAlign: 'center', marginBottom: 0 }}>
          测试账号：admin/admin123 · sales/sales123 · hr/hr123
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
