import React, { useEffect, useState } from 'react';
import { Table, Segmented, Tag, Button, Space, Select, App, Descriptions, Statistic, Row, Col, Card, Drawer, Spin } from 'antd';
import { SyncOutlined, ShoppingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const LEVEL_COLOR = { red: 'red', orange: 'orange', yellow: 'gold', blue: 'blue' };
const LEVEL_LABEL = { red: '红色 <30天', orange: '橙色 30-60天', yellow: '黄色 60-90天', blue: '蓝色 91-180天' };
const RENEWAL_STATUS = { open: '待跟进', following: '跟进中', done: '已续约', lost: '已流失' };

export default function Renewals() {
  const [windowType, setWindowType] = useState('T3');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [managers, setManagers] = useState([]);
  const [manager, setManager] = useState();
  const [pkg, setPkg] = useState(null);
  const [pkgLoading, setPkgLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const fetchPanel = async (w = windowType, mg = manager) => {
    setLoading(true);
    try {
      const res = await api.get(`/renewals/panel?window=${w}${mg ? `&level=${mg}` : ''}`);
      setItems(res.items);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPanel(); }, []);
  useEffect(() => {
    api.get('/renewals/summary').then(setSummary).catch(() => {});
    api.get('/customers/meta/managers').then(setManagers).catch(() => {});
  }, []);

  const setStatus = async (accountId, status) => {
    try {
      await api.put(`/renewals/${accountId}/status`, { status });
      message.success('状态已更新');
      fetchPanel();
    } catch (e) {
      message.error(e.message);
    }
  };

  const openPackage = async (accountId) => {
    setPkgLoading(true);
    setPkg(null);
    try {
      const res = await api.get(`/renewals/package/${accountId}`);
      setPkg(res);
    } catch (e) {
      message.error(e.message);
    } finally {
      setPkgLoading(false);
    }
  };

  const columns = [
    { title: '公司名称', dataIndex: 'company_name', render: (v, r) => <a onClick={() => navigate(`/customers/${r.account_id}`)}>{v || r.account_id}</a> },
    { title: '账号', dataIndex: 'account_id', width: 130 },
    { title: '客户经理', dataIndex: 'manager_name', width: 90, render: (v) => v || '-' },
    { title: '到期日', dataIndex: 'contract_end', width: 105 },
    { title: '剩余天数', dataIndex: 'days_left', width: 90, align: 'right', render: (v) => <b style={{ color: v <= 30 ? 'var(--ant-color-error, #cf1322)' : v <= 60 ? 'var(--ant-color-warning, #d46b08)' : 'var(--ant-color-primary, #0958d9)' }}>{v} 天</b> },
    { title: '预警等级', dataIndex: 'alert_level', width: 130, render: (v) => <Tag color={LEVEL_COLOR[v]}>{LEVEL_LABEL[v]}</Tag> },
    { title: '官方续约状态', dataIndex: 'renew_early_status', width: 130, render: (v) => (v ? <Tag color={v.includes('3个月') ? 'red' : v.includes('3~6') ? 'orange' : 'default'}>{v}</Tag> : '-') },
    { title: '到款金额', dataIndex: 'contract_amount', width: 100, align: 'right', render: (v) => (v ? Number(v).toLocaleString() : '-') },
    { title: 'P4P月消耗', dataIndex: 'p4p_monthly_spend', width: 100, align: 'right', render: (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString()) },
    { title: '状态', dataIndex: 'status', width: 130, render: (v, r) => (
      <Select
        size="small" value={v} style={{ width: 100 }}
        onChange={(nv) => setStatus(r.account_id, nv)}
        options={Object.entries(RENEWAL_STATUS).map(([k, label]) => ({ value: k, label }))}
      />
    ) },
    {
      title: '操作', width: 120, render: (_, r) => (
        <Button size="small" type="link" icon={<ShoppingOutlined />} onClick={() => openPackage(r.account_id)}>续约数据包</Button>
      ),
    },
  ];

  const s = summary || { T3: {}, T6: {} };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={4}><Statistic title="T3 预警总数" value={s.T3?.total || 0} valueStyle={{ color: 'var(--ant-color-error, #cf1322)' }} /></Col>
          <Col span={4}><Statistic title="红色 <30天" value={s.T3?.red || 0} /></Col>
          <Col span={4}><Statistic title="橙色 30-60天" value={s.T3?.orange || 0} /></Col>
          <Col span={4}><Statistic title="黄色 60-90天" value={s.T3?.yellow || 0} /></Col>
          <Col span={4}><Statistic title="T6 预备(6个月内)" value={s.T6?.total || 0} /></Col>
          <Col span={4}><Statistic title="已过期" value={s.expired || 0} /></Col>
        </Row>
      </Card>

      <div className="page-card">
        <Space style={{ marginBottom: 16 }} wrap>
          <Segmented
            value={windowType}
            onChange={(v) => { setWindowType(v); fetchPanel(v, manager); }}
            options={[
              { value: 'T3', label: 'T3 续约窗口（3个月内）' },
              { value: 'T6', label: 'T6 续约窗口（6个月内）' },
            ]}
          />
          <Select
            placeholder="客户经理筛选"
            allowClear
            style={{ width: 160 }}
            value={manager}
            onChange={(v) => { setManager(v); fetchPanel(windowType, v); }}
            options={managers.map((m) => ({ value: m.manager_name, label: `${m.manager_name}(${m.n})` }))}
          />
          <Button icon={<SyncOutlined />} onClick={() => fetchPanel()}>刷新</Button>
        </Space>

        <Table rowKey="account_id" loading={loading} columns={columns} dataSource={items} scroll={{ x: 1400 }} pagination={{ pageSize: 20 }} />
      </div>

      <Drawer
        title={pkg ? `续约数据包 · ${pkg.customer.company_name || pkg.customer.account_id}` : '续约数据包'}
        width={720}
        open={pkgLoading || !!pkg}
        onClose={() => setPkg(null)}
      >
        {pkgLoading && <Spin style={{ display: 'block', margin: '60px auto' }} />}
        {!pkgLoading && pkg && (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="账号">{pkg.customer.account_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="客户经理">{pkg.customer.manager_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="到期日">{pkg.customer.expire_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="金品">{pkg.customer.is_gold === 'Y' ? '金品诚企' : '出口通'}</Descriptions.Item>
              <Descriptions.Item label="续约窗口">
                {pkg.renewal?.window_type
                  ? <Tag color={pkg.renewal.window_type === 'T3' ? 'red' : 'blue'}>{pkg.renewal.window_type} · 剩余 {pkg.renewal.days_left} 天</Tag>
                  : <Tag>窗口外</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="官方续约状态">{pkg.store?.renew_early_status || '-'}</Descriptions.Item>
              <Descriptions.Item label="到款金额">{pkg.store?.contract_amount ? `${Number(pkg.store.contract_amount).toLocaleString()} 元` : '-'}</Descriptions.Item>
              <Descriptions.Item label="P4P月消耗">{pkg.store?.p4p_monthly_spend ? `${Number(pkg.store.p4p_monthly_spend).toLocaleString()} 元` : '-'}</Descriptions.Item>
            </Descriptions>

            <div style={{ fontWeight: 600, marginBottom: 8 }}>商家运营数据（最新快照）</div>
            <Descriptions column={3} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="商品数">{pkg.store?.product_count ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="实力优品">{pkg.store?.strength_products ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="超级优品">{pkg.store?.super_products ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="挂账(90天)">{pkg.store?.pending_gmv_90d ? `${Number(pkg.store.pending_gmv_90d).toLocaleString()} 元` : '-'}</Descriptions.Item>
              <Descriptions.Item label="成交(90天)">{pkg.store?.settled_gmv_90d ? `${Number(pkg.store.settled_gmv_90d).toLocaleString()} 元` : '-'}</Descriptions.Item>
              <Descriptions.Item label="P4P状态">{pkg.store?.p4p_status || '-'}</Descriptions.Item>
            </Descriptions>

            <div style={{ fontWeight: 600, marginBottom: 8 }}>AWB 订单</div>
            {pkg.awb_orders?.length
              ? (
                <Table scroll={{ x: 'max-content' }} rowKey="item_num" size="small" pagination={false} dataSource={pkg.awb_orders}
                  columns={[
                    { title: '产品', dataIndex: 'product_category' },
                    { title: '签约', dataIndex: 'sign_amount', align: 'right', render: (v) => (v ? Number(v).toLocaleString() : '-') },
                    { title: '付款', dataIndex: 'pay_amount', align: 'right', render: (v) => (v ? Number(v).toLocaleString() : '-') },
                    { title: '状态', dataIndex: 'pay_status', render: (v) => (v === 'payment_success' ? <Tag color="green">已付</Tag> : v === 'payment_part' ? <Tag color="orange">部分</Tag> : <Tag color="red">未付</Tag>) },
                  ]}
                />
              )
              : <div style={{ color: 'var(--ant-color-text-tertiary, #999)' }}>无 AWB 订单</div>}
          </div>
        )}
      </Drawer>
    </div>
  );
}
