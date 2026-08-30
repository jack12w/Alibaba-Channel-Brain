import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Spin, Alert, Progress, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { DashboardOutlined, SyncOutlined, DollarOutlined, RiseOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { api } from '../api/client';

const fmt = (v) => (v === null || v === undefined ? '0' : Number(v).toLocaleString());

// 可点击的指标卡：点击进入对应详情页
function MetricCard({ title, value, suffix, prefix, color, to, desc, rate }) {
  const navigate = useNavigate();
  return (
    <Card
      hoverable
      size="small"
      onClick={() => to && navigate(to)}
      style={{ height: '100%', cursor: to ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
        <span>{title}</span>
        {to && <ArrowRightOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 6, lineHeight: 1.25, color: color || 'var(--ant-color-text)' }}>
        {prefix}{value}{suffix}
      </div>
      {rate !== undefined && (
        <Progress percent={rate} size="small" style={{ marginTop: 8, marginBottom: 0 }} status={rate >= 60 ? 'success' : 'normal'} />
      )}
      {desc && rate === undefined && (
        <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12, marginTop: 4 }}>{desc}</div>
      )}
    </Card>
  );
}

function Board({ title, icon, children }) {
  return (
    <Card
      size="small"
      style={{ marginTop: 16 }}
      title={<Space><span style={{ color: 'var(--ant-color-primary)' }}>{icon}</span><span>{title}</span></Space>}
    >
      {children}
    </Card>
  );
}

export default function Overview() {
  const [d, setD] = useState({
    loading: true, dash: null, renewal: null, camp: null, milestones: null, ads: null, revenue: null,
  });

  useEffect(() => {
    let alive = true;
    // 并行聚合 6 个看板数据源，各自容错（无权限的看板自动不渲染）
    Promise.allSettled([
      api.get('/dashboard/overview'),
      api.get('/renewals/summary'),
      api.get('/camp/overview'),
      api.get('/milestones/overview'),
      api.get('/ads/overview'),
      api.get('/revenue/overview'),
    ]).then(([dash, renewal, camp, milestones, ads, revenue]) => {
      if (!alive) return;
      setD({
        loading: false,
        dash: dash.status === 'fulfilled' ? dash.value : null,
        renewal: renewal.status === 'fulfilled' ? renewal.value : null,
        camp: camp.status === 'fulfilled' ? camp.value : null,
        milestones: milestones.status === 'fulfilled' ? milestones.value : null,
        ads: ads.status === 'fulfilled' ? ads.value : null,
        revenue: revenue.status === 'fulfilled' ? revenue.value : null,
      });
    });
    return () => { alive = false; };
  }, []);

  if (d.loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!d.dash && !d.renewal && !d.camp && !d.milestones && !d.ads && !d.revenue) {
    return <Alert type="warning" message="暂无可用数据" />;
  }

  const c = d.dash?.counts || {};
  const managers = d.dash?.managers || [];
  const rn = d.renewal || {};
  const cp = d.camp?.overview || {};
  const ms = d.milestones || {};
  const ad = d.ads || {};
  const rv = d.revenue?.total || {};

  const managerColumns = [
    { title: '客户经理', dataIndex: 'manager_name' },
    { title: '客户数', dataIndex: 'n', align: 'right', sorter: (a, b) => b.n - a.n },
  ];

  return (
    <div>
      {d.dash && (
        <Board title="监控指标" icon={<DashboardOutlined />}>
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="在册客户" value={c.customers ?? 0} to="/customers" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="T3续约(90天内)" value={c.t3 ?? 0} color="var(--ant-color-error, #cf1322)" to="/renewals?window=T3" desc={`已过期 ${c.expired ?? 0}`} /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="T6续约(180天内)" value={c.t6 ?? 0} color="var(--ant-color-primary, #0958d9)" to="/renewals?window=T6" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="P4P开P率" value={c.open_p_rate ?? 0} suffix="%" to="/ads" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="AWB付款金额" value={fmt(c.awb_pay_amount)} to="/revenue" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="AWB订单数" value={c.awb_orders ?? 0} to="/revenue" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="180天·5000美金达成率" value={c.milestone_180_rate ?? 0} suffix="%" rate={c.milestone_180_rate ?? 0} to="/milestones" /></Col>
          </Row>
        </Board>
      )}

      {(d.camp || d.milestones || d.ads) && (
        <Board title="育商看板" icon={<RiseOutlined />}>
          <Row gutter={[12, 12]}>
            {d.camp && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="育商大盘客户数" value={cp.customers ?? 0} to="/camp" /></Col>}
            {d.camp && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="AI知识库文件" value={cp.ai_kb ?? 0} to="/camp" /></Col>}
            {d.camp && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="结构化商详品" value={cp.structured_detail ?? 0} to="/camp" /></Col>}
            {d.camp && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="市场热卖定招品" value={cp.hot_bid ?? 0} to="/camp" /></Col>}
            {d.milestones && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="新商总数(180天内)" value={ms.total ?? 0} to="/milestones" /></Col>}
            {d.milestones && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="续签高风险" value={ms.high_risk ?? 0} color="var(--ant-color-error, #cf1322)" to="/milestones" /></Col>}
            {d.ads && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="开P率" value={ad.open_p_rate ?? 0} suffix="%" to="/ads" /></Col>}
            {d.ads && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="未开P客户数" value={(ad.total ?? 0) - (ad.open_p ?? 0)} to="/ads" /></Col>}
          </Row>
        </Board>
      )}

      {(d.revenue || d.camp) && (
        <Board title="业绩看板" icon={<DollarOutlined />}>
          <Row gutter={[12, 12]}>
            {d.revenue && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="付款金额(营收口径)" value={fmt(rv.pay_amount)} color="var(--ant-color-success, #3f8600)" to="/revenue" /></Col>}
            {d.revenue && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="签约金额" value={fmt(rv.sign_amount)} to="/revenue" /></Col>}
            {d.revenue && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="应收缺口(签-付)" value={fmt(rv.receivable_gap)} color="var(--ant-color-error, #cf1322)" to="/revenue" /></Col>}
            {d.revenue && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="订单数" value={rv.orders ?? 0} desc={`已付${rv.paid_orders ?? 0}/部分${rv.part_orders ?? 0}/未付${rv.unpaid_orders ?? 0}`} to="/revenue" /></Col>}
            {d.camp && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="买驱GMV(30天)" value={fmt(cp.buy_gmv_30d)} to="/camp" /></Col>}
            {d.camp && <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="实收GMV(30天)" value={fmt(cp.settled_gmv_30d)} to="/camp" /></Col>}
          </Row>
        </Board>
      )}

      {d.renewal && (
        <Board title="续签看板" icon={<SyncOutlined />}>
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="T3预警总数" value={rn.T3?.total ?? 0} color="var(--ant-color-error, #cf1322)" to="/renewals?window=T3" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="红色 <30天" value={rn.T3?.red ?? 0} color="var(--ant-color-error, #cf1322)" to="/renewals?window=T3&level=red" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="橙色 30-60天" value={rn.T3?.orange ?? 0} color="var(--ant-color-warning, #d46b08)" to="/renewals?window=T3&level=orange" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="黄色 60-90天" value={rn.T3?.yellow ?? 0} color="#d4a017" to="/renewals?window=T3&level=yellow" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="T6预备(6个月内)" value={rn.T6?.total ?? 0} color="var(--ant-color-primary, #0958d9)" to="/renewals?window=T6" /></Col>
            <Col xs={12} sm={8} md={6} lg={4}><MetricCard title="已过期" value={rn.expired ?? 0} to="/renewals?window=expired" /></Col>
          </Row>
        </Board>
      )}

      {managers.length > 0 && (
        <Card size="small" title="客户经理客户数 TOP10" style={{ marginTop: 16 }}>
          <Table scroll={{ x: 'max-content' }} rowKey="manager_name" size="small" columns={managerColumns} dataSource={managers} pagination={false} />
        </Card>
      )}
    </div>
  );
}
