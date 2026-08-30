import React, { useEffect, useState } from 'react';
import { Card, Tabs, Table, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../api/client';

const SCOPE_LABEL = { all: '全部', team: '团队', self: '自己' };
const ROLE_COLOR = {
  admin: 'purple', boss: 'gold', new_sign_leader: 'geekblue', renewal_leader: 'cyan',
  account_manager: 'blue', mid_leader: 'green', mid_operator: 'lime', hr_admin: 'orange',
};

export default function Organize() {
  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [roles, setRoles] = useState([]);
  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [mForm] = Form.useForm();
  const [tForm] = Form.useForm();
  const { message } = App.useApp();

  const load = () => {
    api.get('/org/members').then(setMembers).catch((e) => message.error(e.message));
    api.get('/org/teams').then(setTeams).catch(() => {});
    api.get('/org/roles').then(setRoles).catch(() => {});
  };
  useEffect(load, []);

  const saveMember = async () => {
    const v = await mForm.validateFields();
    try {
      if (editingMember) await api.put(`/org/members/${editingMember.id}`, v);
      else await api.post('/org/members', v);
      message.success('已保存');
      setMemberOpen(false);
      mForm.resetFields();
      setEditingMember(null);
      load();
    } catch (e) { message.error(e.message); }
  };

  const saveTeam = async () => {
    const v = await tForm.validateFields();
    try {
      if (editingTeam) await api.put(`/org/teams/${editingTeam.id}`, v);
      else await api.post('/org/teams', v);
      message.success('已保存');
      setTeamOpen(false);
      tForm.resetFields();
      setEditingTeam(null);
      load();
    } catch (e) { message.error(e.message); }
  };

  const disableMember = async (id) => {
    try {
      await api.delete(`/org/members/${id}`);
      message.success('已禁用');
      load();
    } catch (e) { message.error(e.message); }
  };

  const deleteTeam = async (id) => {
    try {
      await api.delete(`/org/teams/${id}`);
      message.success('已删除');
      load();
    } catch (e) { message.error(e.message); }
  };

  const memberColumns = [
    { title: '姓名', dataIndex: 'real_name' },
    { title: '登录账号', dataIndex: 'username' },
    { title: '角色', dataIndex: 'role_name', render: (v, r) => <Tag color={ROLE_COLOR[r.role_code]}>{v}</Tag> },
    { title: '数据范围', dataIndex: 'data_scope', width: 90, render: (v) => SCOPE_LABEL[v] || v },
    { title: '团队', dataIndex: 'team_name', render: (v) => v || '-' },
    { title: '状态', dataIndex: 'enabled', width: 80, render: (v) => (v === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>) },
    {
      title: '操作', width: 130, render: (_, r) => (
        <Space>
          <Button size="small" type="link" onClick={() => { setEditingMember(r); mForm.setFieldsValue(r); setMemberOpen(true); }}>编辑</Button>
          <Popconfirm title="禁用此成员？" onConfirm={() => disableMember(r.id)}>
            <Button size="small" type="link" danger>禁用</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const teamColumns = [
    { title: '团队名', dataIndex: 'name' },
    { title: '主管', dataIndex: 'leader_name', render: (v) => v || '-' },
    { title: '成员数', dataIndex: 'member_count', align: 'right' },
    {
      title: '操作', width: 130, render: (_, r) => (
        <Space>
          <Button size="small" type="link" onClick={() => { setEditingTeam(r); tForm.setFieldsValue(r); setTeamOpen(true); }}>编辑</Button>
          <Popconfirm title="删除团队？其成员将变为无团队" onConfirm={() => deleteTeam(r.id)}>
            <Button size="small" type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="组织管理">
      <Tabs
        items={[
          {
            key: 'members', label: `成员管理（${members.length}）`,
            children: (
              <div>
                <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} onClick={() => { setEditingMember(null); mForm.resetFields(); setMemberOpen(true); }}>添加成员</Button>
                <Table scroll={{ x: 'max-content' }} rowKey="id" columns={memberColumns} dataSource={members} pagination={false} />
              </div>
            ),
          },
          {
            key: 'teams', label: `团队管理（${teams.length}）`,
            children: (
              <div>
                <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} onClick={() => { setEditingTeam(null); tForm.resetFields(); setTeamOpen(true); }}>添加团队</Button>
                <Table scroll={{ x: 'max-content' }} rowKey="id" columns={teamColumns} dataSource={teams} pagination={false} />
              </div>
            ),
          },
        ]}
      />

      <Modal title={editingMember ? '编辑成员' : '添加成员'} open={memberOpen} onOk={saveMember} onCancel={() => setMemberOpen(false)} destroyOnHidden>
        <Form form={mForm} layout="vertical">
          <Form.Item name="real_name" label="姓名" rules={[{ required: true, message: '必填' }]}><Input /></Form.Item>
          <Form.Item name="username" label="登录账号" rules={[{ required: true, message: '必填' }]}><Input placeholder="姓名拼音，如 luhao" /></Form.Item>
          <Form.Item name="role_code" label="角色" rules={[{ required: true, message: '必填' }]}>
            <Select options={roles.map((r) => ({ value: r.code, label: r.name }))} />
          </Form.Item>
          <Form.Item name="team_id" label="所属团队">
            <Select allowClear placeholder="选团队" options={teams.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="password" label={editingMember ? '重置密码（留空不修改）' : '初始密码'} extra={editingMember ? '' : '默认 123456'}>
            <Input.Password placeholder={editingMember ? '留空不修改' : '默认 123456'} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editingTeam ? '编辑团队' : '添加团队'} open={teamOpen} onOk={saveTeam} onCancel={() => setTeamOpen(false)} destroyOnHidden>
        <Form form={tForm} layout="vertical">
          <Form.Item name="name" label="团队名" rules={[{ required: true, message: '必填' }]}><Input placeholder="如：丁浩瀚团队" /></Form.Item>
          <Form.Item name="leader_name" label="主管姓名"><Input /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
