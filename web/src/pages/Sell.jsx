import React, { useEffect, useState } from 'react';
import {
  Table, Tabs, Tag, Button, Space, Select, Input, Modal, Form, Switch,
  InputNumber, Statistic, Row, Col, Card, App, Popconfirm,
} from 'antd';
import { PlusOutlined, ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../api/client';

const TYPE_LABEL = { ad_new: '广告冷启动', ad_add: 'P4P加投', brand_ad: '品牌广告', fsp: '全站推', service: '数据改善服务' };
const TYPE_COLOR = { ad_new: 'blue', ad_add: 'cyan', brand_ad: 'purple', fsp: 'green', service: 'orange' };
const STATUS_LABEL = { open: '待跟进', following: '洽谈中', won: '已成交', lost: '已流失', closed: '已关闭' };
const STATUS_COLOR = { open: 'default', following: 'processing', won: 'success', lost: 'error', closed: 'default' };
const OP_LABEL = { eq: '等于', neq: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', is_true: '为真', is_false: '为假', contains: '包含' };

export default function Sell() {
  const [tab, setTab] = useState('opps');
  const [data, setData] = useState({ items: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState();
  const [statusFilter, setStatusFilter] = useState();
  const [keyword, setKeyword] = useState('');
  const [rules, setRules] = useState([]);
  const [fields, setFields] = useState({ fields: [], ops: [], types: {} });
  const [members, setMembers] = useState([]);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleForm] = Form.useForm();
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const user = getUser();
  const perms = user?.permissions || [];
  const canManage = perms.includes('sell.manage') || perms.includes('system.manage');

  const fetchOpps = async (p = 1, t = typeFilter, s = statusFilter, kw = keyword) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, page_size: 20 });
      if (t) params.set('type', t);
      if (s) params.set('status', s);
      if (kw) params.set('keyword', kw);
      const res = await api.get(`/sell/opportunities?${params}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  };
  const fetchSummary = () => api.get('/sell/summary').then(setSummary).catch(() => {});
  const fetchRules = () => api.get('/sell/rules').then(setRules).catch(() => {});
  const fetchMeta = () => {
    api.get('/sell/fields').then(setFields).catch(() => {});
    api.get('/dashboard/team-members').then(setMembers).catch(() => {});
  };

  useEffect(() => { fetchOpps(); fetchSummary(); fetchMeta(); }, []);
  useEffect(() => { if (tab === 'rules') fetchRules(); }, [tab]);

  // ---------- 机会操作 ----------

  const updateOpp = async (id, patch) => {
    try {
      await api.put(`/sell/opportunities/${id}`, patch);
      message.success('已更新');
      fetchOpps();
      fetchSummary();
    } catch (e) {
      message.error(e.message);
    }
  };

  const oppColumns = [
    { title: '机会类型', dataIndex: 'opportunity_type', width: 110, render: (v) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v] || v}</Tag> },
    { title: '客户', dataIndex: 'company_name', render: (v, r) => <a onClick={() => navigate(`/customers/${r.customer_id}`)}>{v}</a> },
    { title: '行业', dataIndex: 'industry', width: 100, render: (v) => v || '-' },
    { title: '预估金额', width: 130, align: 'right', render: (_, r) => `${(r.estimated_min || 0).toLocaleString()} - ${(r.estimated_max || 0).toLocaleString()} 元` },
    { title: '最新询盘', dataIndex: 'latest_inquiries', width: 85, align: 'right', render: (v) => v ?? '-' },
    { title: '最新GMV', dataIndex: 'latest_gmv', width: 100, align: 'right', render: (v) => (v ? v.toLocaleString() : '-') },
    {
      title: '续约窗口', dataIndex: 'window_type', width: 130,
      render: (v, r) => (v
        ? <span>
            <Tag color={v === 'T3' ? 'red' : 'blue'}>{v}</Tag>
            <span style={{ fontSize: 12, color: r.days_left <= 30 ? 'var(--ant-color-error, #cf1322)' : 'var(--ant-color-text-secondary, #666)' }}>{r.days_left} 天</span>
          </span>
        : <span style={{ color: 'var(--ant-color-text-tertiary, #bbb)' }}>-</span>),
    },
    {
      title: '状态', dataIndex: 'status', width: 110, render: (v, r) => (
        <Select
          size="small" value={v} style={{ width: 90 }}
          onChange={(nv) => updateOpp(r.id, { status: nv })}
          options={Object.entries(STATUS_LABEL).map(([k, label]) => ({ value: k, label }))}
        />
      ),
    },
    {
      title: '负责人', dataIndex: 'owner_name', width: 110, render: (v, r) => (
        <Select
          size="small" value={r.owner_id || undefined} placeholder="未分配" allowClear style={{ width: 100 }}
          onChange={(nv) => updateOpp(r.id, { owner_id: nv || null })}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 100, render: (v) => (v ? v.slice(0, 10) : '-') },
  ];

  // ---------- 规则操作 ----------

  const scanNow = async () => {
    setScanning(true);
    try {
      const r = await api.post('/sell/scan', {});
      message.success(`扫描完成：命中 ${r.hits} 条（新增 ${r.created}）`);
      fetchOpps();
      fetchSummary();
    } catch (e) {
      message.error(e.message);
    } finally {
      setScanning(false);
    }
  };

  const toggleRule = async (id) => {
    try {
      await api.post(`/sell/rules/${id}/toggle`, {});
      fetchRules();
    } catch (e) {
      message.error(e.message);
    }
  };

  const openRuleModal = (rule) => {
    setEditingRule(rule);
    if (rule) {
      const conds = JSON.parse(rule.conditions);
      ruleForm.setFieldsValue({
        name: rule.name, opportunity_type: rule.opportunity_type, description: rule.description,
        estimated_min: rule.estimated_min, estimated_max: rule.estimated_max, priority: rule.priority,
        logic: conds.logic, conditions: conds.conditions,
      });
    } else {
      ruleForm.setFieldsValue({ logic: 'AND', conditions: [{ field: undefined, op: undefined, value: undefined }] });
    }
    setRuleOpen(true);
  };

  const saveRule = async () => {
    const v = await ruleForm.validateFields();
    const body = {
      name: v.name,
      opportunity_type: v.opportunity_type,
      description: v.description || null,
      estimated_min: v.estimated_min || null,
      estimated_max: v.estimated_max || null,
      priority: v.priority || 0,
      conditions: JSON.stringify({ logic: v.logic, conditions: v.conditions.filter((c) => c.field && c.op) }),
    };
    try {
      if (editingRule) await api.put(`/sell/rules/${editingRule.id}`, body);
      else await api.post('/sell/rules', body);
      message.success('规则已保存');
      setRuleOpen(false);
      fetchRules();
    } catch (e) {
      message.error(e.message);
    }
  };

  const ruleColumns = [
    { title: '规则名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'opportunity_type', width: 110, render: (v) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v] || v}</Tag> },
    { title: '预估金额', width: 140, render: (_, r) => `${(r.estimated_min || 0).toLocaleString()} - ${(r.estimated_max || 0).toLocaleString()}` },
    { title: '优先级', dataIndex: 'priority', width: 70, align: 'center' },
    {
      title: '启用', dataIndex: 'enabled', width: 80, render: (v, r) => (
        <Switch size="small" checked={!!v} onChange={() => toggleRule(r.id)} />
      ),
    },
    {
      title: '操作', width: 80, render: (_, r) => (
        <Button size="small" type="link" onClick={() => openRuleModal(r)}>编辑</Button>
      ),
    },
  ];

  const formCond = Form.useWatch('conditions', ruleForm) || [];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="待跟进机会" value={summary?.open_count || 0} valueStyle={{ color: 'var(--ant-color-primary, #0958d9)' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="已成交" value={summary?.won_count || 0} valueStyle={{ color: 'var(--ant-color-success, #52c41a)' }} /></Card></Col>
        <Col xs={24} md={12}><Card size="small"><Statistic title="潜在售卖金额（open+洽谈中）" value={summary?.total_amount || 0} precision={0} suffix="元" valueStyle={{ color: 'var(--ant-color-error, #cf1322)' }} /></Card></Col>
      </Row>

      <div className="page-card">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'opps',
              label: '售卖机会',
              children: (
                <div>
                  <Space style={{ marginBottom: 16 }} wrap>
                    <Select placeholder="类型" allowClear style={{ width: 130 }} value={typeFilter}
                      onChange={(v) => { setTypeFilter(v); fetchOpps(1, v, statusFilter, keyword); }}
                      options={Object.entries(TYPE_LABEL).map(([k, label]) => ({ value: k, label }))} />
                    <Select placeholder="状态" allowClear style={{ width: 120 }} value={statusFilter}
                      onChange={(v) => { setStatusFilter(v); fetchOpps(1, typeFilter, v, keyword); }}
                      options={Object.entries(STATUS_LABEL).map(([k, label]) => ({ value: k, label }))} />
                    <Input.Search placeholder="搜索客户/机会" allowClear style={{ width: 200 }}
                      onSearch={(v) => { setKeyword(v); fetchOpps(1, typeFilter, statusFilter, v); }} />
                  </Space>
                  <Table scroll={{ x: 'max-content' }}
                    rowKey="id" loading={loading} columns={oppColumns} dataSource={data.items}
                    pagination={{ total: data.total, pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                  />
                </div>
              ),
            },
            {
              key: 'rules',
              label: '规则管理',
              children: (
                <div>
                  <Space style={{ marginBottom: 16 }} wrap>
                    {canManage && (
                      <>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openRuleModal(null)}>新增规则</Button>
                        <Button icon={<ThunderboltOutlined />} loading={scanning} onClick={scanNow}>立即扫描</Button>
                      </>
                    )}
                    {!canManage && <span style={{ color: 'var(--ant-color-text-tertiary, #999)' }}>仅管理员/管理层可管理规则与触发扫描</span>}
                  </Space>
                  <Table scroll={{ x: 'max-content' }}
                    rowKey="id" columns={ruleColumns} dataSource={rules}
                    pagination={false} expandable={{
                      expandedRowRender: (r) => <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(JSON.parse(r.conditions), null, 2)}</pre>,
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* 规则编辑 Modal */}
      <Modal
        title={editingRule ? '编辑规则' : '新增规则'}
        open={ruleOpen}
        onOk={saveRule}
        onCancel={() => setRuleOpen(false)}
        width={720}
        destroyOnHidden
      >
        <Form form={ruleForm} layout="vertical">
          <Space size="large" style={{ display: 'flex' }} align="start">
            <Form.Item name="name" label="规则名称" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="如：P4P 广告冷启动" />
            </Form.Item>
            <Form.Item name="opportunity_type" label="机会类型" rules={[{ required: true }]} style={{ width: 160 }}>
              <Select options={Object.entries(TYPE_LABEL).map(([k, label]) => ({ value: k, label }))} />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="说明（将作为机会摘要）"><Input.TextArea rows={2} /></Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="estimated_min" label="预估金额下限(元)"><InputNumber style={{ width: 160 }} min={0} /></Form.Item>
            <Form.Item name="estimated_max" label="预估金额上限(元)"><InputNumber style={{ width: 160 }} min={0} /></Form.Item>
            <Form.Item name="priority" label="优先级"><InputNumber style={{ width: 90 }} min={0} /></Form.Item>
          </Space>

          <Form.Item label="触发条件" style={{ marginBottom: 8 }}>
            <Space>
              <Form.Item name="logic" noStyle>
                <Select style={{ width: 110 }} options={[{ value: 'AND', label: '全部满足 AND' }, { value: 'OR', label: '任一满足 OR' }]} />
              </Form.Item>
              <Button size="small" icon={<PlusOutlined />} onClick={() => ruleForm.setFieldsValue({ conditions: [...formCond, {}] })}>添加条件</Button>
            </Space>
          </Form.Item>
          <Form.List name="conditions">
            {(cnds, { remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cnds.map((c, i) => (
                  <Space key={c.key} align="center">
                    <Form.Item name={[c.name, 'field']} noStyle rules={[{ required: true, message: '选字段' }]}>
                      <Select placeholder="字段" style={{ width: 190 }} options={fields.fields.map((f) => ({ value: f.field, label: f.label }))} />
                    </Form.Item>
                    <Form.Item name={[c.name, 'op']} noStyle rules={[{ required: true, message: '选运算符' }]}>
                      <Select placeholder="运算符" style={{ width: 110 }} options={fields.ops.map((o) => ({ value: o, label: OP_LABEL[o] || o }))} />
                    </Form.Item>
                    <Form.Item name={[c.name, 'value']} noStyle>
                      <Input placeholder="值（布尔条件可留空）" style={{ width: 170 }} />
                    </Form.Item>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(c.name)} />
                  </Space>
                ))}
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
