import React, { useEffect, useState } from 'react';
import {
  Tabs, Card, Row, Col, Statistic, Progress, Tag, Button, Radio, Space,
  Modal, Form, InputNumber, Input, App, Alert, Table,
} from 'antd';
import { EditOutlined, AimOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api, getUser } from '../api/client';

const fmtMoney = (v) => (v == null ? '--' : `¥${Number(v).toLocaleString()}`);
const fmtPct = (v) => (v == null ? '--' : `${v}%`);

function sourceTag(g) {
  if (g.source === 'auto') return <Tag color="green">自动计算</Tag>;
  if (g.source === 'manual') return <Tag color="blue">手动录入</Tag>;
  return <Tag>待数据</Tag>;
}

function ProgressRow({ g, canManage, onEdit, onInput }) {
  const color = g.progress == null ? '#d9d9d9' : g.progress >= 100 ? 'var(--ant-color-success, #52c41a)' : g.progress >= 60 ? 'var(--ant-color-primary, #0f6bff)' : 'var(--ant-color-warning, #fa8c16)';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>
          {g.name} {sourceTag(g)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary, #666)' }}>
          目标 {g.target_value.toLocaleString()}{g.unit} · 实际 {g.actual ?? '--'}
          {canManage && (
            <>
              <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(g)}>调目标</Button>
              <Button size="small" type="link" onClick={() => onInput(g)}>录实际</Button>
            </>
          )}
        </span>
      </div>
      <Progress percent={g.progress ?? 0} size="small" strokeColor={color} format={() => (g.progress == null ? '待数据' : `${g.progress}%`)} />
      {g.detail && <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}>{g.detail}</div>}
    </div>
  );
}

export default function Goals() {
  const [period, setPeriod] = useState('2026-Q2');
  const [periods, setPeriods] = useState([]);
  const [revGoals, setRevGoals] = useState([]);
  const [adGoals, setAdGoals] = useState([]);
  const [nurseryNew, setNurseryNew] = useState([]);
  const [nurseryMarket, setNurseryMarket] = useState([]);
  const [renewRate, setRenewRate] = useState([]);
  const [editTarget, setEditTarget] = useState(null);
  const [inputTarget, setInputTarget] = useState(null);
  const [p2wCustomers, setP2wCustomers] = useState([]);
  const [awbPayments, setAwbPayments] = useState([]);
  const [form] = Form.useForm();
  const [inputForm] = Form.useForm();
  const { message } = App.useApp();
  const user = getUser();
  const canManage = (user?.permissions || []).includes('goal.manage');

  const fetchAll = (p = period) => {
    api.get(`/goals?category=revenue&period=${p}`).then((r) => setRevGoals(r.items)).catch(() => {});
    api.get('/goals?category=ad').then((r) => setAdGoals(r.items)).catch(() => {});
    api.get('/goals?category=nursery_new').then((r) => setNurseryNew(r.items)).catch(() => {});
    api.get('/goals?category=nursery_market').then((r) => setNurseryMarket(r.items)).catch(() => {});
    api.get('/goals?category=renew_rate').then((r) => setRenewRate(r.items)).catch(() => {});
    api.get('/goals/p2w-customers').then((r) => setP2wCustomers(r.items)).catch(() => {});
    api.get('/goals/awb-payments').then((r) => setAwbPayments(r.items)).catch(() => {});
  };

  useEffect(() => {
    api.get('/goals/periods').then((r) => setPeriods(r.periods)).catch(() => {});
    fetchAll();
  }, []);

  const onEdit = (g) => { setEditTarget(g); form.setFieldsValue({ target_value: g.target_value, name: g.name }); };
  const saveEdit = async () => {
    const v = await form.validateFields();
    try {
      await api.put(`/goals/${editTarget.id}`, v);
      message.success('目标已调整');
      setEditTarget(null);
      fetchAll();
    } catch (e) { message.error(e.message); }
  };
  const onInput = (g) => { setInputTarget(g); inputForm.setFieldsValue({ actual_value: g.actual }); };
  const saveInput = async () => {
    const v = await inputForm.validateFields();
    try {
      await api.put(`/goals/actuals/${inputTarget.id}`, { ...v, period: inputTarget.period || period });
      message.success('实际值已录入');
      setInputTarget(null);
      fetchAll();
    } catch (e) { message.error(e.message); }
  };

  const totalGoal = revGoals.find((g) => g.metric === 'revenue_total');

  return (
    <>
    <Tabs
      items={[
        {
          key: 'revenue',
          label: '渠道营收任务',
          children: (
            <div>
              <Card style={{ marginBottom: 16 }}>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Radio.Group value={period} onChange={(e) => { setPeriod(e.target.value); fetchAll(e.target.value); }}>
                    {periods.map((p) => <Radio.Button key={p} value={p}>{p}</Radio.Button>)}
                  </Radio.Group>
                  <Alert type="info" showIcon message="营收口径：新签=已签单商机合同额；老客户=续约成功客户年费；广告=周期内广告消耗；AWB 为手动录入" style={{ flex: 1 }} />
                </Space>
                {totalGoal && (
                  <Row gutter={16}>
                    <Col span={8}><Statistic title={`${totalGoal.name}（${totalGoal.period}）`} value={totalGoal.actual ?? 0} suffix={`/ ${totalGoal.target_value.toLocaleString()} 元`} valueStyle={{ fontSize: 22 }} /></Col>
                    <Col span={16}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>整体达成率 {totalGoal.progress == null ? '--' : `${totalGoal.progress}%`} {sourceTag(totalGoal)}</div>
                      <Progress percent={totalGoal.progress ?? 0} strokeColor={totalGoal.progress >= 100 ? 'var(--ant-color-success, #52c41a)' : totalGoal.progress >= 50 ? 'var(--ant-color-primary, #0f6bff)' : 'var(--ant-color-warning, #fa8c16)'} />
                    </Col>
                  </Row>
                )}
              </Card>
              <Row gutter={16}>
                {revGoals.filter((g) => g.metric !== 'revenue_total').map((g) => (
                  <Col xs={24} sm={12} lg={8} key={g.id} style={{ marginBottom: 16 }}>
                    <Card size="small">
                      <Statistic
                        title={g.name}
                        value={g.actual == null ? '--' : g.actual}
                        suffix={g.actual == null ? '' : `/ ${g.target_value.toLocaleString()} ${g.unit}`}
                        valueStyle={{ fontSize: 20, color: g.actual == null ? 'var(--ant-color-text-tertiary, #bbb)' : undefined }}
                      />
                      <Progress percent={g.progress ?? 0} size="small" strokeColor={g.progress >= 100 ? 'var(--ant-color-success, #52c41a)' : 'var(--ant-color-primary, #0f6bff)'} format={() => (g.progress == null ? '待数据' : `${g.progress}%`)} />
                      <div style={{ marginTop: 4 }}>{sourceTag(g)}</div>
                      {g.detail && <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)', marginTop: 2 }}>{g.detail}</div>}
                      {canManage && (
                        <Space style={{ marginTop: 4 }}>
                          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(g)}>调目标</Button>
                          <Button size="small" onClick={() => onInput(g)}>录实际</Button>
                        </Space>
                      )}
                      {g.metric === 'revenue_awb' && awbPayments.length > 0 && (
                        <Table scroll={{ x: 'max-content' }}
                          rowKey="id" size="small" style={{ marginTop: 8 }} pagination={false}
                          dataSource={awbPayments.slice(0, 5)}
                          columns={[
                            { title: '付款客户', dataIndex: 'customer_name' },
                            { title: '付款日期', dataIndex: 'pay_date', width: 110 },
                            { title: '金额', dataIndex: 'amount', width: 90, align: 'right', render: (v) => (v ? v.toLocaleString() : '-') },
                          ]}
                        />
                      )}
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          ),
        },
        {
          key: 'ops',
          label: '中台运营业绩',
          children: (
            <div>
              <Row gutter={16}>
                {/* 广告维度 */}
                <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
                  <Card title="广告维度" size="small">
                    {adGoals.map((g) => (
                      <div key={g.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span><AimOutlined style={{ color: 'var(--ant-color-primary, #0f6bff)' }} /> {g.name} {sourceTag(g)}</span>
                          <span style={{ fontSize: 12 }}>目标 {g.target_value}{g.unit} · 实际 {g.actual ?? '--'}</span>
                        </div>
                        <Progress percent={g.progress ?? 0} size="small" />
                        {canManage && <Button size="small" type="link" onClick={() => onInput(g)}>录入实际值</Button>}
                        {g.detail && <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}>{g.detail}</div>}
                        {g.metric === 'ad_products_attention' && (
                          <Alert type="info" style={{ marginTop: 8 }} showIcon message="关注产品：无忧PLUS/超级充、省心版、AI智投、金品推工厂、千寻 —— 开通状态待插件采集或手动录入" />
                        )}
                        {g.metric === 'ad_p2w_customers' && p2wCustomers.length > 0 && (
                          <Table scroll={{ x: 'max-content' }}
                            rowKey="id" size="small" style={{ marginTop: 8 }} pagination={false}
                            dataSource={p2wCustomers}
                            columns={[
                              { title: '客户', dataIndex: 'company_name', width: 130 },
                              { title: '打包额度', dataIndex: 'p_package_amount', width: 90, align: 'right', render: (v) => v.toLocaleString() },
                              { title: '累计消耗', dataIndex: 'used', width: 90, align: 'right', render: (v) => v.toLocaleString() },
                              {
                                title: '使用率', dataIndex: 'usage_rate', width: 130,
                                render: (v, r) => <Progress percent={Math.min(v, 100)} size="small" strokeColor={r.status === 'full' ? 'var(--ant-color-success, #52c41a)' : v > 0 ? 'var(--ant-color-primary, #0f6bff)' : 'var(--ant-color-warning, #fa8c16)'} format={() => `${v}%`} />,
                              },
                              {
                                title: '状态', dataIndex: 'status', width: 80,
                                render: (v) => (v === 'full' ? <Tag color="green">用满</Tag> : v === 'using' ? <Tag color="blue">使用中</Tag> : <Tag color="red">未使用</Tag>),
                              },
                            ]}
                          />
                        )}
                      </div>
                    ))}
                  </Card>
                </Col>
                {/* 续签率 */}
                <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
                  <Card title="续签率" size="small">
                    {renewRate.map((g) => (
                      <div key={g.id} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span><CheckCircleOutlined style={{ color: 'var(--ant-color-success, #52c41a)' }} /> {g.name} {sourceTag(g)}</span>
                          <span style={{ fontSize: 12 }}>目标 {g.target_value}% · 实际 {g.actual ?? '--'}</span>
                        </div>
                        <Progress percent={g.progress ?? 0} size="small" format={() => (g.progress == null ? '待数据（需记录续约次数）' : `${g.progress}%`)} />
                        {canManage && g.source !== 'auto' && <Button size="small" type="link" onClick={() => onInput(g)}>录入实际值</Button>}
                      </div>
                    ))}
                  </Card>
                </Col>
              </Row>

              {/* 新商里程碑 */}
              <Card title="育商 · 新商里程碑（达成率目标）" size="small" style={{ marginBottom: 16 }}>
                <Row gutter={24}>
                  {nurseryNew.map((g) => (
                    <Col xs={24} sm={12} lg={8} key={g.id} style={{ marginBottom: 8 }}>
                      <ProgressRow g={g} canManage={canManage} onEdit={onEdit} onInput={onInput} />
                    </Col>
                  ))}
                </Row>
              </Card>

              {/* 大盘 */}
              <Card title="育商 · 大盘达标线" size="small">
                <Row gutter={24}>
                  {nurseryMarket.map((g) => (
                    <Col xs={24} sm={12} lg={8} key={g.id} style={{ marginBottom: 8 }}>
                      <ProgressRow g={g} canManage={canManage} onEdit={onEdit} onInput={onInput} />
                    </Col>
                  ))}
                </Row>
              </Card>
            </div>
          ),
        },
      ]}
    />

    {/* 调整目标 Modal */}
    <Modal title={`调整目标 · ${editTarget?.name || ''}`} open={!!editTarget} onOk={saveEdit} onCancel={() => setEditTarget(null)} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="目标名称"><Input /></Form.Item>
        <Form.Item name="target_value" label="目标值" rules={[{ required: true, message: '请输入目标值' }]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>

    {/* 手动录入实际值 Modal */}
    <Modal title={`录入实际值 · ${inputTarget?.name || ''}`} open={!!inputTarget} onOk={saveInput} onCancel={() => setInputTarget(null)} destroyOnHidden>
      <Form form={inputForm} layout="vertical">
        <Form.Item name="actual_value" label="实际值" rules={[{ required: true, message: '请输入实际值' }]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="备注/口径说明">
          <Input.TextArea rows={2} placeholder="如：AWB 售卖 28 单 × 1.5 万" />
        </Form.Item>
      </Form>
    </Modal>
    </>
  );
}
