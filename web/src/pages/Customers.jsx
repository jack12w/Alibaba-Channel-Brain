import React, { useEffect, useState } from 'react';
import { Table, Input, Select, Button, Space, Tag, App } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Customers() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState();
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState([]);
  const [operators, setOperators] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [batchOperator, setBatchOperator] = useState();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const fetchData = async (p = page, kw = keyword, st = status) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, page_size: 20 });
      if (kw) params.set('keyword', kw);
      if (st) params.set('manager', st);
      const res = await api.get(`/customers?${params}`);
      setData(res);
      setPage(p);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    api.get('/customers/meta/managers').then(setMembers).catch(() => {});
    api.get('/customers/meta/operators').then(setOperators).catch(() => {});
  }, []);

  const assignOperator = async (accountId, operatorName) => {
    try {
      await api.put(`/customers/${accountId}/operator`, { operator_name: operatorName || null });
      message.success('已分配');
      fetchData();
    } catch (e) {
      message.error(e.message);
    }
  };

  const batchAssign = async () => {
    if (!selectedRowKeys.length) return message.warning('请先勾选客户');
    if (!batchOperator) return message.warning('请选择中台运营');
    try {
      await api.post('/customers/assign-operator', { account_ids: selectedRowKeys, operator_name: batchOperator });
      message.success(`已批量分配给 ${batchOperator}，共 ${selectedRowKeys.length} 家`);
      setSelectedRowKeys([]);
      setBatchOperator(undefined);
      fetchData();
    } catch (e) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '公司名称', dataIndex: 'company_name', render: (v, r) => <a onClick={() => navigate(`/customers/${r.account_id}`)}>{v || r.account_id}</a> },
    { title: '账号', dataIndex: 'account_id', width: 140 },
    { title: '客户经理', dataIndex: 'manager_name', width: 90, render: (v) => v || '-' },
    { title: '主管', dataIndex: 'supervisor_name', width: 90, render: (v) => v || '-' },
    { title: '区域', dataIndex: 'region', width: 90, render: (v) => v || '-' },
    { title: '行业', dataIndex: 'industry_l1', width: 120, ellipsis: true, render: (v) => v || '-' },
    { title: '金品', dataIndex: 'is_gold', width: 70, render: (v) => (v === 'Y' ? <Tag color="gold">金品</Tag> : v === 'N' ? <Tag>否</Tag> : '-') },
    { title: '到期日', dataIndex: 'expire_date', width: 105, render: (v) => v || '-' },
    { title: '续约状态', dataIndex: 'renew_early_status', width: 120, render: (v) => (v ? <Tag color={v.includes('3个月') ? 'red' : v.includes('3~6') ? 'orange' : 'default'}>{v}</Tag> : '-') },
    { title: 'P4P月消耗', dataIndex: 'p4p_monthly_spend', width: 100, align: 'right', render: (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString()), sorter: (a, b) => (a.p4p_monthly_spend || 0) - (b.p4p_monthly_spend || 0) },
    { title: '商品数', dataIndex: 'product_count', width: 80, align: 'right', render: (v) => v ?? '-' },
    { title: '实力优品', dataIndex: 'strength_products', width: 85, align: 'right', render: (v) => v ?? '-' },
    { title: '超级优品', dataIndex: 'super_products', width: 85, align: 'right', render: (v) => v ?? '-' },
    { title: '挂账(90天)', dataIndex: 'pending_gmv_90d', width: 95, align: 'right', render: (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString()) },
    { title: '中台运营', dataIndex: 'operator_name', width: 120, render: (v, r) => (
      <Select
        size="small" allowClear placeholder="分配"
        value={v || undefined}
        style={{ width: 105 }}
        options={operators.map((o) => ({ value: o, label: o }))}
        onChange={(nv) => assignOperator(r.account_id, nv)}
      />
    ) },
  ];

  return (
    <div className="page-card">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索公司名/账号/客户经理"
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => { setKeyword(v); fetchData(1, v, status); }}
        />
        <Select
          placeholder="客户经理筛选"
          allowClear
          style={{ width: 160 }}
          value={status}
          onChange={(v) => { setStatus(v); fetchData(1, keyword, v); }}
          options={members.map((m) => ({ value: m.manager_name, label: `${m.manager_name}(${m.n})` }))}
        />
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>刷新</Button>
        <Select
          placeholder="批量分配中台运营"
          allowClear
          style={{ width: 170 }}
          value={batchOperator}
          onChange={setBatchOperator}
          options={operators.map((o) => ({ value: o, label: o }))}
        />
        <Button type="primary" disabled={!selectedRowKeys.length} onClick={batchAssign}>
          批量分配{selectedRowKeys.length ? `(${selectedRowKeys.length})` : ''}
        </Button>
      </Space>

      <Table scroll={{ x: 'max-content' }}
        rowKey="account_id"
        loading={loading}
        columns={columns}
        dataSource={data.items}
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        scroll={{ x: 1500 }}
        pagination={{ total: data.total, pageSize: 20, current: page, showTotal: (t) => `共 ${t} 家客户`, onChange: (p) => fetchData(p) }}
      />
    </div>
  );
}
