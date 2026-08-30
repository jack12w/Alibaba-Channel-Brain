import React, { useEffect, useState } from 'react';
import {
  Table, Tag, Button, Space, Select, Input, Modal, Form, InputNumber,
  DatePicker, Statistic, Row, Col, Card, App, Tabs, Badge,
} from 'antd';
import { PlusOutlined, AimOutlined, AlertOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../api/client';

const STATUS_LABEL = { active: '进行中', achieved: '已达标', missed: '未达标', closed: '已关闭' };
const STATUS_COLOR = { active: 'processing', achieved: 'success', missed: 'error', closed: 'default' };

export default function WorkLogs({ customerId: fixedCustomer }) {
  const [tab, setTab] = useState('logs');
  const [data, setData] = useState({ items: [], total: 0 });
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState({ action_types: [], metric_types: {} });
  const [customers, setCustomers] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState();
  const [keyword, setKeyword] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [form] = Form.useForm();
  const [verifyForm] = Form.useForm();
  const [monitorForm] = Form.useForm();
  const [alerts, setAlerts] = useState({ items: [], total: 0 });
  const [openAlerts, setOpenAlerts] = useState(0);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [handleTarget, setHandleTarget] = useState(null);
  const [handleForm] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const user = getUser();
  const perms = user?.permissions || [];
  const canCreate = perms.includes('work.create') || perms.includes('system.manage');

  const fetchLogs = async (p = 1, st = statusFilter, kw = keyword) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, page_size: 20 });
      if (fixedCustomer) params.set('customer_id', fixedCustomer);
      if (st) params.set('status', st);
      if (kw) params.set('keyword', kw);
      const res = await api.get(`/work/logs?${params}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  };
  const fetchStats = () => api.get('/work/stats').then(setStats).catch(() => {});
  const fetchAlerts = async (p = 1) => {
    try {
      const res = await api.get(`/monitor/checks?page=${p}&page_size=20`);
      setAlerts(res);
      const oc = await api.get('/monitor/checks/open-count');
      setOpenAlerts(oc.open);
    } catch (e) { /* ignore */ }
  };
  useEffect(() => {
    fetchLogs();
    api.get('/work/meta').then(setMeta).catch(() => {});
    api.get('/dashboard/team-members').then(setMembers).catch(() => {});
    fetchAlerts();
    if (!fixedCustomer) {
      api.get('/customers?page_size=100').then((c) => setCustomers(c.items)).catch(() => {});
      fetchStats();
    }
  }, []);

  const onAdd = async () => {
    const v = await form.validateFields();
    try {
      await api.post('/work/logs', {
        ...v,
        target_date: v.target_date ? v.target_date.format('YYYY-MM-DD') : null,
      });
      message.success('过程记录已创建');
      setAddOpen(false);
      form.resetFields();
      fetchLogs();
      if (!fixedCustomer) fetchStats();
    } catch (e) {
      message.error(e.message);
    }
  };

  const onVerify = async () => {
    const v = await verifyForm.validateFields();
    try {
      const r = await api.post(`/work/logs/${verifyTarget.id}/verify`, v);
      message.success(r.status === 'achieved' ? '已达标，运营工作得到验证！' : '未达标，建议复盘原因');
      setVerifyTarget(null);
      verifyForm.resetFields();
      fetchLogs();
      if (!fixedCustomer) fetchStats();
    } catch (e) {
      message.error(e.message);
    }
  };

  // 回验自动带出：打开回验弹窗时从插件采集数据取实际值预填
  const openVerify = (target) => {
    setVerifyTarget(target);
    verifyForm.resetFields();
    api.get(`/monitor/metrics/${target.customer_id}/${target.metric_type}/latest`).then((r) => {
      if (r && r.value !== null && r.value !== undefined) {
        verifyForm.setFieldsValue({ actual_value: r.value });
      }
    }).catch(() => {});
  };

  const onAddMonitor = async () => {
    const v = await monitorForm.validateFields();
    try {
      await api.post('/monitor/monitors', v);
      message.success('监控已创建，跌破目标将自动告警');
      setMonitorOpen(false);
      monitorForm.resetFields();
    } catch (e) {
      message.error(e.message);
    }
  };

  const onHandle = async () => {
    const v = await handleForm.validateFields();
    try {
      await api.post(`/monitor/checks/${handleTarget.id}/handle`, v);
      message.success('告警已处理');
      setHandleTarget(null);
      handleForm.resetFields();
      fetchAlerts();
    } catch (e) {
      message.error(e.message);
    }
  };

  const runCheck = async () => {
    try {
      const r = await api.post('/monitor/checks/run', {});
      message.success(`检查完成：${r.checked} 条监控，新告警 ${r.created} 条`);
      fetchAlerts();
    } catch (e) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '客户', dataIndex: 'company_name', render: (v, r) => <a onClick={() => navigate(`/customers/${r.customer_id}`)}>{v}</a> },
    { title: '动作类型', dataIndex: 'action_type', width: 100, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: '动作与目标', dataIndex: 'title', render: (v, r) => (
      <div>
        <div>{v}</div>
        <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary, #888)' }}>
          {meta.metric_types[r.metric_type] || r.metric_type}：
          <b>{r.baseline_value ?? '-'}</b> → <b style={{ color: 'var(--ant-color-primary, #0f6bff)' }}>{r.target_value ?? '-'}</b>
          {r.actual_value !== null && r.actual_value !== undefined && <span> · 实际 <b style={{ color: r.status === 'achieved' ? 'var(--ant-color-success, #52c41a)' : 'var(--ant-color-error, #cf1322)' }}>{r.actual_value}</b></span>}
        </div>
      </div>
    )},
    { title: '目标日期', dataIndex: 'target_date', width: 100, render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '执行人', dataIndex: 'member_name', width: 90, render: (v) => v || '-' },
    {
      title: '操作', width: 110, render: (_, r) => (
        <Space>
          {canCreate && r.status === 'active' && (
            <Button size="small" type="primary" ghost icon={<AimOutlined />} onClick={() => openVerify(r)}>回验</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {!fixedCustomer && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="本月动作数" value={stats?.overall?.total || 0} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="本月达标率" value={((stats?.overall?.rate || 0) * 100).toFixed(0)} suffix="%" valueStyle={{ color: 'var(--ant-color-success, #52c41a)' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="进行中" value={stats?.overall?.active || 0} valueStyle={{ color: 'var(--ant-color-primary, #0958d9)' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="未达标" value={stats?.overall?.missed || 0} valueStyle={{ color: 'var(--ant-color-error, #cf1322)' }} /></Card></Col>
        </Row>
      )}

      <div className="page-card">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'logs',
              label: '过程记录',
              children: (
                <div>
                  <Space style={{ marginBottom: 16 }} wrap>
                    <Select placeholder="状态" allowClear style={{ width: 120 }} value={statusFilter}
                      onChange={(v) => { setStatusFilter(v); fetchLogs(1, v, keyword); }}
                      options={Object.entries(STATUS_LABEL).map(([k, label]) => ({ value: k, label }))} />
                    <Input.Search placeholder="搜索客户/动作" allowClear style={{ width: 200 }}
                      onSearch={(v) => { setKeyword(v); fetchLogs(1, statusFilter, v); }} />
                    {canCreate && (
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
                        新增过程记录
                      </Button>
                    )}
                  </Space>
                  <Table scroll={{ x: 'max-content' }}
                    rowKey="id" loading={loading} columns={columns} dataSource={data.items}
                    pagination={{ total: data.total, pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                  />
                </div>
              ),
            },
            {
              key: 'monitor',
              label: (
                <Badge count={openAlerts} size="small" offset={[8, -2]}>
                  <span>指标监控</span>
                </Badge>
              ),
              children: (
                <div>
                  <Space style={{ marginBottom: 16 }} wrap>
                    {canCreate && (
                      <>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setMonitorOpen(true)}>新增监控</Button>
                        <Button icon={<AlertOutlined />} onClick={runCheck}>立即检查</Button>
                      </>
                    )}
                  </Space>
                  <Table scroll={{ x: 'max-content' }}
                    rowKey="id" size="middle" dataSource={alerts.items}
                    pagination={{ total: alerts.total, pageSize: 20, showTotal: (t) => `共 ${t} 条告警` }}
                    columns={[
                      { title: '客户', dataIndex: 'company_name', render: (v, r) => <a onClick={() => navigate(`/customers/${r.customer_id}`)}>{v}</a> },
                      { title: '类型', dataIndex: 'alert_type', width: 95, render: (v) => (v === 'breach' ? <Tag color="red">跌破目标</Tag> : <Tag color="gold">指标下降</Tag>) },
                      { title: '指标', dataIndex: 'metric_type', width: 120, render: (v) => meta.metric_types[v] || v },
                      { title: '目标', dataIndex: 'target_value', width: 90, align: 'right' },
                      { title: '实际', dataIndex: 'actual_value', width: 90, align: 'right', render: (v) => <b style={{ color: 'var(--ant-color-error, #cf1322)' }}>{v}</b> },
                      { title: '告警日期', dataIndex: 'alert_date', width: 105 },
                      { title: '状态', dataIndex: 'status', width: 85, render: (v) => (v === 'open' ? <Tag color="red">待处理</Tag> : <Tag color="green">已处理</Tag>) },
                      { title: '处理人', dataIndex: 'handled_name', width: 90, render: (v) => v || '-' },
                      { title: '处理备注', dataIndex: 'handle_note', ellipsis: true, render: (v) => v || '-' },
                      {
                        title: '操作', width: 85, render: (_, r) => (
                          r.status === 'open' && canCreate && (
                            <Button size="small" type="primary" ghost onClick={() => { setHandleTarget(r); handleForm.resetFields(); }}>处理</Button>
                          )
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            ...(!fixedCustomer
              ? [{
                  key: 'rank',
                  label: '运营绩效排行',
                  children: (
                    <Table scroll={{ x: 'max-content' }}
                      rowKey={(r) => r.member_id || 'unassigned'}
                      size="small" pagination={false}
                      dataSource={stats?.members || []}
                      columns={[
                        { title: '运营', dataIndex: 'member_name', render: (v) => v || '未分配' },
                        { title: '动作数', dataIndex: 'total', align: 'center' },
                        { title: '达标', dataIndex: 'achieved', align: 'center', render: (v) => <span style={{ color: 'var(--ant-color-success, #52c41a)' }}>{v || 0}</span> },
                        { title: '未达标', dataIndex: 'missed', align: 'center', render: (v) => <span style={{ color: 'var(--ant-color-error, #cf1322)' }}>{v || 0}</span> },
                        { title: '进行中', dataIndex: 'active', align: 'center' },
                        { title: '达标率', align: 'center', render: (_, r) => (r.achieved + r.missed > 0 ? `${((r.achieved / (r.achieved + r.missed)) * 100).toFixed(0)}%` : '-') },
                      ]}
                    />
                  ),
                }]
              : []),
          ]}
        />
      </div>

      {/* 新增记录 */}
      <Modal title="新增过程记录" open={addOpen} onOk={onAdd} onCancel={() => setAddOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="customer_id" label="客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: `${c.company_name} (${c.store_id || '无店铺'})` }))} />
          </Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="action_type" label="动作类型" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={(meta.action_types || []).map((a) => ({ value: a, label: a }))} />
            </Form.Item>
            <Form.Item name="metric_type" label="目标指标" rules={[{ required: true }]}>
              <Select style={{ width: 150 }} options={Object.entries(meta.metric_types || {}).map(([k, label]) => ({ value: k, label }))} />
            </Form.Item>
          </Space>
          <Form.Item name="title" label="动作与目标" rules={[{ required: true }]}>
            <Input placeholder="如：P4P 日均消耗从 100 提升至 200" />
          </Form.Item>
          <Form.Item name="description" label="过程描述（做了什么）">
            <Input.TextArea rows={3} placeholder="如：调整出价结构、删低效词、主推词加价…" />
          </Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="baseline_value" label="基线值（动作前）"><InputNumber style={{ width: 140 }} /></Form.Item>
            <Form.Item name="target_value" label="目标值"><InputNumber style={{ width: 140 }} /></Form.Item>
            <Form.Item name="target_date" label="回验日期"><DatePicker /></Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 回验 */}
      <Modal
        title={`回验：${verifyTarget ? `${verifyTarget.company_name} · ${verifyTarget.title}` : ''}`}
        open={!!verifyTarget}
        onOk={onVerify}
        onCancel={() => setVerifyTarget(null)}
        destroyOnHidden
      >
        {verifyTarget && (
          <div style={{ marginBottom: 16, background: 'var(--ant-color-fill-quaternary, #f6f8fa)', padding: 12, borderRadius: 6, fontSize: 13 }}>
            {meta.metric_types[verifyTarget.metric_type] || verifyTarget.metric_type}：基线 <b>{verifyTarget.baseline_value ?? '-'}</b> → 目标 <b style={{ color: 'var(--ant-color-primary, #0f6bff)' }}>{verifyTarget.target_value ?? '-'}</b>
            <div style={{ color: 'var(--ant-color-text-secondary, #888)', marginTop: 4 }}>填实际值后将自动判定：实际 ≥ 目标 → 达标</div>
          </div>
        )}
        <Form form={verifyForm} layout="vertical">
          <Form.Item
            name="actual_value" label="实际值（已自动带出插件采集数据，可修改）"
            rules={[{ required: true, message: '请输入实际数据' }]}
            extra="若留空可手动填写"
          >
            <InputNumber style={{ width: '100%' }} placeholder="系统自动带出，可修改" />
          </Form.Item>
          <Form.Item name="verify_note" label="回验备注">
            <Input.TextArea rows={2} placeholder="如：连续 7 天日均消耗稳定在 200+，询盘同步提升" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增监控 */}
      <Modal title="新增指标监控" open={monitorOpen} onOk={onAddMonitor} onCancel={() => setMonitorOpen(false)} destroyOnHidden>
        <Form form={monitorForm} layout="vertical">
          <Form.Item name="customer_id" label="客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: `${c.company_name} (${c.store_id || '无店铺'})` }))} />
          </Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="metric_type" label="监控指标" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={Object.entries(meta.metric_types || {}).map(([k, label]) => ({ value: k, label }))} />
            </Form.Item>
            <Form.Item name="compare" label="比较" initialValue="gte">
              <Select style={{ width: 120 }} options={[{ value: 'gte', label: '不低于' }, { value: 'lte', label: '不高于' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="target_value" label="目标值" rules={[{ required: true, message: '必填' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="如：200" />
          </Form.Item>
          <Form.Item name="note" label="监控说明">
            <Input.TextArea rows={2} placeholder="如：P4P 日均消耗持续监控，跌破即提醒运营干预" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 处理告警 */}
      <Modal
        title={handleTarget ? `处理告警：${handleTarget.company_name} ${meta.metric_types[handleTarget.metric_type] || handleTarget.metric_type}（实际 ${handleTarget.actual_value} < 目标 ${handleTarget.target_value}）` : ''}
        open={!!handleTarget}
        onOk={onHandle}
        onCancel={() => setHandleTarget(null)}
        destroyOnHidden
      >
        <Form form={handleForm} layout="vertical">
          <Form.Item name="note" label="处理说明（做了什么干预）" rules={[{ required: true, message: '请填写处理说明' }]}>
            <Input.TextArea rows={3} placeholder="如：已调整 P4P 出价与预算，观察 3 天" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
