import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Spin, Alert, Statistic } from 'antd';
import { api } from '../api/client';

const fmt = (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString());

export default function Camp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/camp/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error" message="加载失败" description={error} showIcon />;
  if (!data) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const o = data.overview;
  const columns = [
    { title: '公司名称', dataIndex: 'company_name', ellipsis: true },
    { title: '金品', dataIndex: 'is_gold', render: (v) => (v === 'Y' ? <Tag color="gold">金品</Tag> : <Tag>否</Tag>) },
    { title: '品数', dataIndex: 'product_count', align: 'right' },
    { title: '优品数', dataIndex: 'top_count', align: 'right' },
    { title: 'AI知识库', dataIndex: 'ai_kb_count', align: 'right' },
    { title: '结构化商详', dataIndex: 'structured_detail_count', align: 'right' },
    { title: '市场热卖', dataIndex: 'hot_bid_count', align: 'right' },
    { title: '买驱GMV(30天)', dataIndex: 'buy_gmv_30d', align: 'right', render: fmt },
    { title: '实收GMV(30天)', dataIndex: 'settled_gmv_30d', align: 'right', render: fmt },
    { title: '中供营收', dataIndex: 'revenue_zhonggong', align: 'right', render: fmt },
    { title: '客户经理', dataIndex: 'sales_name' },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card><Statistic title="成交营客户" value={o.customers} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="AI知识库文件" value={o.ai_kb} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="结构化商详品" value={o.structured_detail} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="市场热卖定招品" value={o.hot_bid} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}><Card><Statistic title="买驱GMV(30天)" value={o.buy_gmv_30d} precision={0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="实收GMV(30天)" value={o.settled_gmv_30d} precision={0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="中供营收" value={o.revenue_zhonggong} precision={0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="品广营收" value={o.revenue_pinguang} precision={0} /></Card></Col>
      </Row>

      <Card title="成交营客户明细" size="small" style={{ marginTop: 16 }}>
        <Table rowKey="account_id" size="small" columns={columns} dataSource={data.list} scroll={{ x: 1200 }} pagination={false} />
      </Card>
    </div>
  );
}
