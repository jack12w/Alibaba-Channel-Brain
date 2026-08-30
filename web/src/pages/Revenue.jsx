import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Spin, Alert, Statistic } from 'antd';
import { DollarOutlined, FileTextOutlined, WarningOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { api } from '../api/client';

const fmt = (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString());
const PAY_TAG = { payment_success: 'green', payment_part: 'orange', payment_none: 'red' };
const PAY_LABEL = { payment_success: '已付款', payment_part: '部分付款', payment_none: '未付款' };

export default function Revenue() {
  const [ov, setOv] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/revenue/overview'), api.get('/revenue/awb?page_size=100')])
      .then(([o, a]) => { setOv(o); setOrders(a.items); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error" message="加载失败" description={error} showIcon />;
  if (!ov) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const t = ov.total;
  const totalPay = ov.by_category.reduce((s, c) => s + (c.pay_amount || 0), 0) || 1;

  const orderColumns = [
    { title: '订单号', dataIndex: 'item_num', width: 190 },
    { title: '公司名称', dataIndex: 'company_name', ellipsis: true, render: (v) => v || <Tag>待补全</Tag> },
    { title: '产品', dataIndex: 'product_category' },
    { title: '签约金额', dataIndex: 'sign_amount', align: 'right', render: fmt },
    { title: '付款金额', dataIndex: 'pay_amount', align: 'right', render: fmt },
    { title: '付款状态', dataIndex: 'pay_status', render: (v) => <Tag color={PAY_TAG[v]}>{PAY_LABEL[v] || v || '-'}</Tag> },
    { title: '付款日期', dataIndex: 'pay_date', render: (v) => v || '-' },
    { title: '客户经理', dataIndex: 'manager_name' },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="付款金额（营收口径）" value={t.pay_amount} precision={0}
              prefix={<DollarOutlined />} valueStyle={{ color: 'var(--ant-color-success, #3f8600)', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="签约金额" value={t.sign_amount} precision={0}
              prefix={<FileTextOutlined />} valueStyle={{ fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="应收缺口（签-付）" value={t.receivable_gap} precision={0}
              prefix={<WarningOutlined />} valueStyle={{ color: 'var(--ant-color-error, #cf1322)', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14, marginBottom: 8 }}>订单数</div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
              <ShoppingCartOutlined style={{ fontSize: 20, color: 'var(--ant-color-primary, #1677ff)' }} />
              <span style={{ fontSize: 24, fontWeight: 600, marginLeft: 8, marginRight: 12 }}>{t.orders}</span>
              <Tag color="green">已付{t.paid_orders}</Tag>
              <Tag color="orange">部分{t.part_orders}</Tag>
              <Tag color="red">未付{t.unpaid_orders}</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title="本月付款（按付款/创建日期）" size="small" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              <Col span={8}>
                <Statistic title="付款金额" value={ov.this_month.pay} precision={0} valueStyle={{ color: 'var(--ant-color-success, #3f8600)', fontSize: 20 }} />
              </Col>
              <Col span={8}>
                <Statistic title="签约金额" value={ov.this_month.sign} precision={0} valueStyle={{ fontSize: 20 }} />
              </Col>
              <Col span={8}>
                <Statistic title="订单数" value={ov.this_month.orders} valueStyle={{ fontSize: 20 }} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="按产品分类" size="small">
            <Table scroll={{ x: 'max-content' }}
              rowKey="product_category"
              size="small"
              pagination={false}
              columns={[
                { title: '产品', dataIndex: 'product_category' },
                { title: '订单数', dataIndex: 'orders', align: 'right' },
                { title: '付款金额', dataIndex: 'pay_amount', align: 'right', render: fmt },
                {
                  title: '占比', dataIndex: 'pay_amount', align: 'right', width: 100,
                  render: (v) => <span style={{ color: 'var(--ant-color-text-secondary, #666)' }}>{v ? ((v / totalPay) * 100).toFixed(1) : '0.0'}%</span>,
                },
              ]}
              dataSource={ov.by_category}
            />
          </Card>
        </Col>
      </Row>

      <Card title="AWB 订单明细" size="small" style={{ marginTop: 16 }}>
        <Table rowKey="item_num" size="small" columns={orderColumns} dataSource={orders} scroll={{ x: 1100 }} pagination={{ pageSize: 20 }} />
      </Card>
    </div>
  );
}
