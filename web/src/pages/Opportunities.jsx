import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, Select, InputNumber, DatePicker, App, Steps, Card, Row, Col, Statistic } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../api/client';

const STAGE_LABEL = { initial: '初步接触', need: '需求挖掘', quote: '方案报价', negotiate: '商务谈判', won: '签单', lost: '已流失' };
const STAGE_COLOR = { initial: 'default', need: 'blue', quote: 'cyan', negotiate: 'orange', won: 'green', lost: 'red' };

export default function Opportunities() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [members, setMembers] = useState([]);
  const [form] = Form.useForm();
  const [actForm] = Form.useForm();
  const { message } = App.useApp();

  const fetchData = async (p = 1, st = stage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, page_size: 20 });
      if (st) params.set('stage', st);
      const res = await api.get(`/opportunities?${params}`);
      setData(res);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    api.get('/opportunities/funnel').then(setFunnel).catch(() => {});
    api.get('/dashboard/team-members').then(setMembers).catch(() => {});
  }, []);

  const columns = [
    { title: '公司', dataIndex: 'company_name', render: (v, r) => <a onClick={() => openDetail(r.id)}>{v}</a> },
    { title: '来源', dataIndex: 'lead_source', width: 80, render: (v) => v || '-' },
    { title: '联系人', dataIndex: 'contact_name', width: 90, render: (v) => v || '-' },
    { title: '行业', dataIndex: 'industry', width: 100, render: (v) => v || '-' },
    { title: '阶段', dataIndex: 'stage', width: 100, render: (v) => <Tag color={STAGE_COLOR[v]}>{STAGE_LABEL[v]}</Tag> },
    { title: '金额(元)', dataIndex: 'amount', width: 110, align: 'right', render: (v) => (v ? v.toLocaleString() : '-') },
    { title: '预计签单', dataIndex: 'expected_date', width: 105, render: (v) => v || '-' },
    { title: '跟进人', dataIndex: 'owner_name', width: 90, render: (v) => v || '-' },
    { title: '跟进次数', dataIndex: 'activity_count', width: 85, align: 'right' },
    { title: '下次跟进', dataIndex: 'next_follow_date', width: 105, render: (v) => v || '-' },
  ];

  const openDetail = async (id) => {
    const d = await api.get(`/opportunities/${id}`);
    setDetail(d);
  };

  const addOpp = async () => {
    const v = await form.validateFields();
    try {
      await api.post('/opportunities', { ...v, expected_date: v.expected_date ? v.expected_date.format('YYYY-MM-DD') : null });
      message.success('商机已创建');
      setOpen(false);
      form.resetFields();
      fetchData();
      api.get('/opportunities/funnel').then(setFunnel).catch(() => {});
    } catch (e) {
      message.error(e.message);
    }
  };

  const addActivity = async () => {
    const v = await actForm.validateFields();
    try {
      await api.post(`/opportunities/${detail.id}/activities`, { ...v, next_follow_date: v.next_follow_date ? v.next_follow_date.format('YYYY-MM-DD') : null, activity_date: v.activity_date ? v.activity_date.format('YYYY-MM-DD') : undefined });
      message.success('跟进已记录');
      actForm.resetFields();
      openDetail(detail.id);
    } catch (e) {
      message.error(e.message);
    }
  };

  const updateStage = async (st) => {
    try {
      await api.put(`/opportunities/${detail.id}`, { stage: st });
      message.success('阶段已更新');
      setDetail(null);
      fetchData();
      api.get('/opportunities/funnel').then(setFunnel).catch(() => {});
    } catch (e) {
      message.error(e.message);
    }
  };

  const f = funnel || { stages: {}, won_count: 0, active_count: 0, conversion_rate: 0 };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="进行中商机" value={f.active_count} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="已签单" value={f.won_count} valueStyle={{ color: 'var(--ant-color-success, #52c41a)' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="签单转化率" value={f.conversion_rate * 100} precision={1} suffix="%" /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Steps
              size="small"
              current={f.stages ? Math.min(4, Math.max(0, f.stages.negotiate?.count || 0)) : 0}
              items={[{ title: '接触' }, { title: '挖掘' }, { title: '报价' }, { title: '谈判' }, { title: '签单' }]}
            />
          </Card>
        </Col>
      </Row>

      <div className="page-card">
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="阶段筛选"
            allowClear
            style={{ width: 140 }}
            value={stage}
            onChange={(v) => { setStage(v); fetchData(1, v); }}
            options={Object.entries(STAGE_LABEL).map(([k, label]) => ({ value: k, label }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新增商机</Button>
        </Space>

        <Table scroll={{ x: 'max-content' }}
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data.items}
          pagination={{ total: data.total, pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        />
      </div>

      <Modal title="新增商机" open={open} onOk={addOpp} onCancel={() => setOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="company_name" label="公司名" rules={[{ required: true, message: '必填' }]}><Input /></Form.Item>
          <Form.Item name="lead_source" label="线索来源">
            <Select options={['展会', '转介绍', '地推', '线上', 'OKKI'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Space size="large">
            <Form.Item name="contact_name" label="联系人"><Input /></Form.Item>
            <Form.Item name="contact_phone" label="电话"><Input /></Form.Item>
          </Space>
          <Form.Item name="contact_wechat" label="微信"><Input /></Form.Item>
          <Form.Item name="industry" label="行业"><Input /></Form.Item>
          <Form.Item name="stage" label="阶段">
            <Select options={Object.entries(STAGE_LABEL).filter(([k]) => k !== 'won' && k !== 'lost').map(([k, label]) => ({ value: k, label }))} />
          </Form.Item>
          <Space size="large">
            <Form.Item name="amount" label="金额(元)"><InputNumber style={{ width: 160 }} min={0} /></Form.Item>
            <Form.Item name="expected_date" label="预计签单"><DatePicker /></Form.Item>
          </Space>
          <Form.Item name="owner_id" label="跟进人">
            <Select options={members.map((m) => ({ value: m.id, label: `${m.name}(${m.team})` }))} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detail ? `${detail.company_name} · 商机详情` : ''}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={760}
      >
        {detail && (
          <div>
            <Space style={{ marginBottom: 12 }} wrap>
              <Tag color={STAGE_COLOR[detail.stage]}>{STAGE_LABEL[detail.stage]}</Tag>
              <span>金额：<b>{detail.amount?.toLocaleString()}</b> 元</span>
              <span>预计签单：{detail.expected_date || '-'}</span>
              <span>跟进人：{detail.owner_name || '-'}</span>
            </Space>
            <Space style={{ marginBottom: 12 }} wrap>
              {['need', 'quote', 'negotiate'].includes(detail.stage) && <Button type="primary" size="small" onClick={() => updateStage('won')}>标记签单</Button>}
              {detail.stage !== 'lost' && <Button size="small" danger onClick={() => updateStage('lost')}>标记流失</Button>}
            </Space>

            <Form form={actForm} layout="inline" style={{ marginBottom: 16 }} onFinish={addActivity}>
              <Form.Item name="activity_type" rules={[{ required: true }]}>
                <Select placeholder="类型" style={{ width: 100 }} options={['电话', '拜访', '微信', '邮件', '报价'].map((v) => ({ value: v, label: v }))} />
              </Form.Item>
              <Form.Item name="content" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Input placeholder="跟进内容" />
              </Form.Item>
              <Form.Item name="next_follow_date"><DatePicker placeholder="下次跟进" /></Form.Item>
              <Button type="primary" htmlType="submit" size="small">记录</Button>
            </Form>

            <Steps
              size="small"
              current={['initial', 'need', 'quote', 'negotiate', 'won'].indexOf(detail.stage)}
              style={{ marginBottom: 16 }}
              items={['初步接触', '需求挖掘', '方案报价', '商务谈判', '签单'].map((t) => ({ title: t }))}
            />

            <Table scroll={{ x: 'max-content' }}
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.activities || []}
              columns={[
                { title: '日期', dataIndex: 'activity_date', width: 100 },
                { title: '类型', dataIndex: 'activity_type', width: 80 },
                { title: '内容', dataIndex: 'content' },
                { title: '下次跟进', dataIndex: 'next_follow_date', width: 105, render: (v) => v || '-' },
                { title: '记录人', dataIndex: 'member_name', width: 90, render: (v) => v || '-' },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
