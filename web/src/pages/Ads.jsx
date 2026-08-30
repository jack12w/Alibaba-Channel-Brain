import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Spin, Alert, Statistic, Progress } from 'antd';
import { api } from '../api/client';

const fmt = (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString());

export default function Ads() {
  const [ov, setOv] = useState(null);
  const [p2w, setP2w] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/ads/overview'), api.get('/ads/p2w')])
      .then(([o, p]) => { setOv(o); setP2w(p); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error" message="加载失败" description={error} showIcon />;
  if (!ov || !p2w) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const notOpenColumns = [
    { title: '账号', dataIndex: 'account_id' },
    { title: '公司名称', dataIndex: 'company_name', ellipsis: true },
    { title: '客户经理', dataIndex: 'manager_name' },
    { title: '当月P4P消耗(元)', dataIndex: 'p4p_monthly_spend', align: 'right', render: fmt, sorter: (a, b) => (b.p4p_monthly_spend || 0) - (a.p4p_monthly_spend || 0) },
    { title: '现金余额(元)', dataIndex: 'cash_balance', align: 'right', render: fmt },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card><Statistic title="P4P 客户数" value={ov.total} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="开P率" value={ov.open_p_rate} suffix="%" valueStyle={{ color: ov.open_p_rate >= 80 ? 'var(--ant-color-success, #3f8600)' : 'var(--ant-color-error, #cf1322)' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="当月P4P消耗(元)" value={ov.monthly_spend} precision={0} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="现金余额(元)" value={ov.cash_balance} precision={0} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Card><Statistic title="季度消耗(元)" value={ov.quarter_spend} precision={0} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="广告产品营收(元)" value={ov.ad_revenue_total} precision={0} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="近30天活跃" value={ov.active_30d} suffix={`/ ${ov.total}`} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" title="广告产品营收构成">
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              品牌 {fmt(ov.rev_brand)} · 顶展 {fmt(ov.rev_top)} · 问鼎 {fmt(ov.rev_ask)}<br />
              回眸 {fmt(ov.rev_review)} · 明星展位 {fmt(ov.rev_star)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginTop: 16 }}
        title={`未开P客户清单（${p2w.not_open} 家，开P率 ${p2w.open_p_rate}%）`}
        extra={<Progress percent={p2w.open_p_rate} size="small" style={{ width: 160 }} />}
      >
        <Table scroll={{ x: 'max-content' }} rowKey="account_id" size="small" columns={notOpenColumns} dataSource={p2w.not_open_list} pagination={{ pageSize: 20 }} />
      </Card>
    </div>
  );
}
