import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Spin, Alert, Progress, Statistic } from 'antd';
import { api } from '../api/client';

export default function Milestones() {
  const [ov, setOv] = useState(null);
  const [list, setList] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/milestones/overview'), api.get('/milestones/list')])
      .then(([o, l]) => { setOv(o); setList(l.items); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error" message="加载失败" description={error} showIcon />;
  if (!ov) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const STATUS_TAG = { 达标: 'green', 不达标: 'red', 进行中: 'blue' };

  const listColumns = [
    { title: '账号', dataIndex: 'account_id', width: 150 },
    { title: '公司名称', dataIndex: 'company_name', ellipsis: true },
    { title: '服务天数', dataIndex: 'service_days', align: 'right', sorter: (a, b) => b.service_days - a.service_days },
    { title: '风险', dataIndex: 'is_high_risk', render: (v) => (v === '高风险' ? <Tag color="red">高风险</Tag> : <Tag color="green">低风险</Tag>) },
    { title: '30天品', dataIndex: 'p30_status', render: (v) => <Tag color={STATUS_TAG[v]}>{v || '-'}</Tag> },
    { title: '60天P4P', dataIndex: 'p60_status', render: (v) => <Tag color={STATUS_TAG[v]}>{v || '-'}</Tag> },
    { title: '90天订单', dataIndex: 'p90_status', render: (v) => <Tag color={STATUS_TAG[v]}>{v || '-'}</Tag> },
    { title: '120天优爆品', dataIndex: 'p120_status', render: (v) => <Tag color={STATUS_TAG[v]}>{v || '-'}</Tag> },
    { title: '180天GMV', dataIndex: 'p180_gmv_status', render: (v) => <Tag color={STATUS_TAG[v]}>{v || '-'}</Tag> },
    { title: '客户经理', dataIndex: 'sales_name' },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card><Statistic title="新商总数(180天内)" value={ov.total} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card><Statistic title="续签高风险" value={ov.high_risk} valueStyle={{ color: 'var(--ant-color-error, #cf1322)' }} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card><Statistic title="快照日期" value={ov.snapshot_date} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {ov.items.map((m) => (
          <Col xs={24} md={12} lg={8} key={m.key}>
            <Card size="small" title={m.name}>
              <Progress percent={m.rate} status={m.rate >= 60 ? 'success' : 'normal'} />
              <div style={{ color: 'var(--ant-color-text-tertiary, #999)', fontSize: 12 }}>达标 {m.hit} / 应考核 {m.total} 家</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="新商里程碑明细" size="small" style={{ marginTop: 16 }}>
        <Table rowKey="account_id" size="small" columns={listColumns} dataSource={list} scroll={{ x: 1200 }} pagination={{ pageSize: 20 }} />
      </Card>
    </div>
  );
}
