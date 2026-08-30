import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Descriptions, Table, Card, Tabs, Tag, Spin, Alert, Statistic, Row, Col } from 'antd';
import { api } from '../api/client';

const fmt = (v) => (v === null || v === undefined || v === '' ? '-' : Number(v).toLocaleString());

export default function CustomerDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/customers/${id}`).then(setD).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Alert type="error" message="加载失败" description={error} showIcon />;
  if (!d) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const { customer: c, store: s, ad: a, milestone: m, awb_orders, store_history } = d;

  const storeDesc = (
    <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
      <Descriptions.Item label="P4P月消耗">{fmt(s?.p4p_monthly_spend)}</Descriptions.Item>
      <Descriptions.Item label="P4P现金余额">{fmt(s?.p4p_cash_balance)}</Descriptions.Item>
      <Descriptions.Item label="P4P推广状态">{s?.p4p_status || '-'}</Descriptions.Item>
      <Descriptions.Item label="P4P层级">{s?.p4p_level || '-'}</Descriptions.Item>
      <Descriptions.Item label="商品数">{s?.product_count ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="实力优品">{s?.strength_products ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="超级优品">{s?.super_products ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="近30天曝光">{fmt(s?.exposure_30d)}</Descriptions.Item>
      <Descriptions.Item label="近30天点击">{fmt(s?.clicks_30d)}</Descriptions.Item>
      <Descriptions.Item label="近30天询盘">{fmt(s?.inquiries_30d)}</Descriptions.Item>
      <Descriptions.Item label="挂账金额(90天)">{fmt(s?.pending_gmv_90d)}</Descriptions.Item>
      <Descriptions.Item label="成交金额(90天)">{fmt(s?.settled_gmv_90d)}</Descriptions.Item>
      <Descriptions.Item label="风险健康分">{s?.risk_score ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="到款金额">{fmt(s?.contract_amount)}</Descriptions.Item>
      <Descriptions.Item label="一年方案投入">{fmt(s?.plan_amount_1y)}</Descriptions.Item>
      <Descriptions.Item label="两年方案投入">{fmt(s?.plan_amount_2y)}</Descriptions.Item>
    </Descriptions>
  );

  const adDesc = a ? (
    <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
      <Descriptions.Item label="是否开P">{a.is_open_p === '1' ? <Tag color="green">已开P</Tag> : <Tag color="red">未开P</Tag>}</Descriptions.Item>
      <Descriptions.Item label="当月消耗">{fmt(a.p4p_monthly_spend)}</Descriptions.Item>
      <Descriptions.Item label="现金余额">{fmt(a.cash_balance)}</Descriptions.Item>
      <Descriptions.Item label="品牌营收">{fmt(a.rev_brand_month)}</Descriptions.Item>
      <Descriptions.Item label="顶展营收">{fmt(a.rev_top_month)}</Descriptions.Item>
      <Descriptions.Item label="问鼎营收">{fmt(a.rev_ask_month)}</Descriptions.Item>
      <Descriptions.Item label="回眸营收">{fmt(a.rev_review_month)}</Descriptions.Item>
      <Descriptions.Item label="明星展位营收">{fmt(a.rev_star_month)}</Descriptions.Item>
      <Descriptions.Item label="推广计划数">{a.plan_count ?? '-'}</Descriptions.Item>
    </Descriptions>
  ) : <div style={{ color: 'var(--ant-color-text-tertiary, #999)' }}>无广告数据</div>;

  const milestoneDesc = m ? (
    <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
      <Descriptions.Item label="服务天数">{m.service_days ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="30天·品">{m.p30_status ? `${m.p30_status}(${m.p30_value ?? '-'})` : '-'}</Descriptions.Item>
      <Descriptions.Item label="60天·P4P">{m.p60_status ? `${m.p60_status}(${m.p60_value ?? '-'})` : '-'}</Descriptions.Item>
      <Descriptions.Item label="90天·订单">{m.p90_status ? `${m.p90_status}(${m.p90_value ?? '-'})` : '-'}</Descriptions.Item>
      <Descriptions.Item label="120天·优爆品">{m.p120_status ? `${m.p120_status}(${m.p120_value ?? '-'})` : '-'}</Descriptions.Item>
      <Descriptions.Item label="180天·GMV">{m.p180_gmv_status ? `${m.p180_gmv_status}(${m.p180_gmv_value ?? '-'})` : '-'}</Descriptions.Item>
      <Descriptions.Item label="是否达5000">{m.p180_gmv_hit5000 || '-'}</Descriptions.Item>
      <Descriptions.Item label="180天·星级">{m.p180_star_status ? `${m.p180_star_status}(${m.p180_star_value ?? '-'})` : '-'}</Descriptions.Item>
    </Descriptions>
  ) : <div style={{ color: 'var(--ant-color-text-tertiary, #999)' }}>非新商或暂无里程碑数据</div>;

  const awbColumns = [
    { title: '订单号', dataIndex: 'item_num', width: 190 },
    { title: '产品', dataIndex: 'product_category' },
    { title: '签约金额', dataIndex: 'sign_amount', align: 'right', render: fmt },
    { title: '付款金额', dataIndex: 'pay_amount', align: 'right', render: fmt },
    { title: '付款状态', dataIndex: 'pay_status', render: (v) => (v === 'payment_success' ? <Tag color="green">已付</Tag> : v === 'payment_part' ? <Tag color="orange">部分</Tag> : <Tag color="red">未付</Tag>) },
    { title: '付款日期', dataIndex: 'pay_date', render: (v) => v || '-' },
  ];

  const historyColumns = [
    { title: '日期', dataIndex: 'stat_date' },
    { title: 'P4P消耗', dataIndex: 'p4p_monthly_spend', align: 'right', render: fmt },
    { title: '曝光', dataIndex: 'exposure_30d', align: 'right', render: fmt },
    { title: '询盘', dataIndex: 'inquiries_30d', align: 'right', render: fmt },
    { title: '挂账(90天)', dataIndex: 'pending_gmv_90d', align: 'right', render: fmt },
    { title: '成交(90天)', dataIndex: 'settled_gmv_90d', align: 'right', render: fmt },
  ];

  return (
    <div>
      <Card title={c.company_name || c.account_id}>
        <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
          <Descriptions.Item label="账号">{c.account_id || '-'}</Descriptions.Item>
          <Descriptions.Item label="客户经理">{c.manager_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="主管">{c.supervisor_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="区域">{c.region || '-'}</Descriptions.Item>
          <Descriptions.Item label="大区">{c.region_large || '-'}</Descriptions.Item>
          <Descriptions.Item label="渠道类型">{c.channel_type || '-'}</Descriptions.Item>
          <Descriptions.Item label="一级行业">{c.industry_l1 || '-'}</Descriptions.Item>
          <Descriptions.Item label="二级行业">{c.industry_l2 || '-'}</Descriptions.Item>
          <Descriptions.Item label="三级行业">{c.industry_l3 || '-'}</Descriptions.Item>
          <Descriptions.Item label="金品">{c.is_gold === 'Y' ? <Tag color="gold">金品</Tag> : c.is_gold === 'N' ? '否' : '-'}</Descriptions.Item>
          <Descriptions.Item label="生命周期">{c.lifecycle || '-'}</Descriptions.Item>
          <Descriptions.Item label="到期日">{c.expire_date || '-'}</Descriptions.Item>
        </Descriptions>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={8}><Statistic title="P4P月消耗" value={s?.p4p_monthly_spend ?? 0} precision={0} /></Col>
          <Col span={8}><Statistic title="商品数" value={s?.product_count ?? 0} /></Col>
          <Col span={8}><Statistic title="实力优品" value={s?.strength_products ?? 0} /></Col>
        </Row>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Tabs
          items={[
            { key: 'store', label: '商家运营', children: storeDesc },
            { key: 'ad', label: '广告数据', children: adDesc },
            { key: 'milestone', label: '新商里程碑', children: milestoneDesc },
            { key: 'awb', label: `AWB 订单(${awb_orders?.length || 0})`, children: <Table scroll={{ x: 'max-content' }} rowKey="item_num" size="small" columns={awbColumns} dataSource={awb_orders || []} pagination={false} /> },
            { key: 'history', label: '历史快照趋势', children: <Table scroll={{ x: 'max-content' }} rowKey="stat_date" size="small" columns={historyColumns} dataSource={store_history || []} pagination={false} /> },
          ]}
        />
      </Card>
    </div>
  );
}
