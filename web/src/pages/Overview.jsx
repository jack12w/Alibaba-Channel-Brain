import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Spin, Alert, Progress } from 'antd';
import { TeamOutlined, SyncOutlined, ThunderboltOutlined, DollarOutlined, FlagOutlined } from '@ant-design/icons';
import { api } from '../api/client';

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/dashboard/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error" message="加载失败" description={error} showIcon />;
  if (!data) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const c = data.counts;
  const managerColumns = [
    { title: '客户经理', dataIndex: 'manager_name' },
    { title: '客户数', dataIndex: 'n', align: 'right', sorter: (a, b) => b.n - a.n },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card><Statistic title="在册客户" value={c.customers} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="T3 续约(90天内)" value={c.t3} valueStyle={{ color: 'var(--ant-color-error, #cf1322)' }} prefix={<SyncOutlined />} suffix={`/ 过期 ${c.expired}`} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="T6 续约(180天内)" value={c.t6} valueStyle={{ color: 'var(--ant-color-primary, #0958d9)' }} prefix={<SyncOutlined />} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="P4P 开P率" value={c.open_p_rate} suffix="%" prefix={<ThunderboltOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Card><Statistic title="AWB 付款金额(营收口径)" value={c.awb_pay_amount} precision={0} prefix={<DollarOutlined />} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="AWB 订单数" value={c.awb_orders} prefix={<DollarOutlined />} /></Card>
        </Col>
        <Col xs={12} md={12}>
          <Card size="small" title="180天 · 5000美金 里程碑达成率">
            <Progress percent={c.milestone_180_rate} status={c.milestone_180_rate >= 60 ? 'success' : 'normal'} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card size="small" title="客户经理客户数 TOP10">
            <Table scroll={{ x: 'max-content' }} rowKey="manager_name" size="small" columns={managerColumns} dataSource={data.managers} pagination={false} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" title="数据来源">
            <p style={{ color: 'var(--ant-color-text-secondary, #666)', lineHeight: 1.8 }}>
              本系统数据来自 5 个真实 CSV 快照：商家运营明细、180天新商明细、P4P消耗明细、AWB购买明细、AW成交营明细。
              每日 09:00 自动扫描 <Tag>渠道数据导入</Tag> 目录更新。
            </p>
            <p style={{ color: 'var(--ant-color-text-tertiary, #999)', fontSize: 12 }}>
              续约口径：T3=90天内到期（红≤30/橙31-60/黄61-90），T6=180天内到期；营收口径=付款金额；开P率=新签客户是否开始使用 P4P。
            </p>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
