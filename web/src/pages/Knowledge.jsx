import React, { useEffect, useState } from 'react';
import {
  Layout, Menu, Table, Button, Space, Input, Tag, Modal, Form, Select,
  Drawer, Timeline, Upload, App, Typography, Alert, Grid,
} from 'antd';
import {
  PlusOutlined, UploadOutlined, FileTextOutlined, PaperClipOutlined,
  HistoryOutlined, InboxOutlined,
} from '@ant-design/icons';
import { api, getUser } from '../api/client';
import { useThemeMode } from '../theme/ThemeContext';

const { Sider, Content } = Layout;

export default function Knowledge() {
  const [cats, setCats] = useState([]);
  const [docs, setDocs] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [catId, setCatId] = useState();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [form] = Form.useForm();
  const [verForm] = Form.useForm();
  const [catForm] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const { message } = App.useApp();
  const user = getUser();
  const perms = user?.permissions || [];
  const canUpload = perms.includes('knowledge.upload');
  const canManage = perms.includes('knowledge.manage');
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { resolvedTheme } = useThemeMode();

  const fetchCats = () => api.get('/knowledge/categories').then(setCats).catch(() => {});
  const fetchDocs = async (p = page, cid = catId, kw = keyword) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, page_size: 20 });
      if (cid) params.set('category_id', cid);
      if (kw) params.set('keyword', kw);
      const res = await api.get(`/knowledge/docs?${params}`);
      setDocs(res);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCats(); fetchDocs(); }, []);

  const openDetail = async (id) => {
    const d = await api.get(`/knowledge/docs/${id}`);
    setDetail(d);
  };

  const doUpload = async (values, docId) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, v);
    });
    fd.append('version_note', values.version_note || '');
    const token = localStorage.getItem('cb_token');
    const res = await fetch(docId ? `/api/knowledge/docs/${docId}/versions` : '/api/knowledge/docs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data;
  };

  const onUpload = async () => {
    const v = await form.validateFields();
    setUploading(true);
    try {
      await doUpload({ ...v, file: v.file?.file?.originFileObj });
      message.success('文档已发布');
      setUploadOpen(false);
      form.resetFields();
      fetchDocs();
    } catch (e) {
      message.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onNewVersion = async () => {
    const v = await verForm.validateFields();
    setUploading(true);
    try {
      await doUpload({ ...v, file: v.file?.file?.originFileObj }, detail.id);
      message.success('新版本已发布');
      setVersionOpen(false);
      verForm.resetFields();
      openDetail(detail.id);
      fetchDocs();
    } catch (e) {
      message.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onArchive = async () => {
    try {
      await api.post(`/knowledge/docs/${detail.id}/archive`, {});
      message.success('文档已归档下架');
      setDetail(null);
      fetchDocs();
    } catch (e) {
      message.error(e.message);
    }
  };

  const onAddCat = async () => {
    const v = await catForm.validateFields();
    try {
      await api.post('/knowledge/categories', v);
      message.success('分类已创建');
      setCatOpen(false);
      catForm.resetFields();
      fetchCats();
    } catch (e) {
      message.error(e.message);
    }
  };

  const columns = [
    {
      title: '文档标题', dataIndex: 'title', render: (v, r) => (
        <a onClick={() => openDetail(r.id)}>
          <FileTextOutlined style={{ marginRight: 6, color: 'var(--ant-color-primary, #0f6bff)' }} />
          {v}
        </a>
      ),
    },
    { title: '分类', dataIndex: 'category_name', width: 100, render: (v) => <Tag>{v}</Tag> },
    { title: '版本', dataIndex: 'version', width: 70, align: 'center', render: (v) => <Tag color="blue">v{v}</Tag> },
    { title: '摘要', dataIndex: 'summary', ellipsis: true, render: (v) => v || '-' },
    {
      title: '附件', dataIndex: 'file_name', width: 100, render: (v) => (v ? <PaperClipOutlined title={v} /> : '-'),
    },
    { title: '更新人', dataIndex: 'updater_name', width: 90, render: (v) => v || '-' },
    { title: '更新时间', dataIndex: 'updated_at', width: 100, render: (v) => (v ? v.slice(0, 10) : '-') },
  ];

  const catItems = [
    { key: 'all', label: '全部资料' },
    ...cats.map((c) => ({ key: String(c.id), label: `${c.name} (${c.doc_count})` })),
  ];

  return (
    <Layout style={{ background: 'transparent' }}>
      {!isMobile && (
        <Sider width={200} theme={resolvedTheme} style={{ background: 'var(--ant-color-bg-container, #fff)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--ant-color-border-secondary, #f0f0f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            资料分类
            {canManage && (
              <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => setCatOpen(true)} />
            )}
          </div>
          <Menu
            mode="inline"
            selectedKeys={catId ? [String(catId)] : []}
            onClick={(e) => { setCatId(Number(e.key)); fetchDocs(1, Number(e.key)); }}
            items={catItems}
          />
        </Sider>
      )}
      <Content style={{ paddingLeft: isMobile ? 0 : 16 }}>
        <div className="page-card">
          {isMobile && (
            <Select
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="全部分类"
              value={catId ? String(catId) : 'all'}
              onChange={(k) => { const v = k === 'all' ? undefined : Number(k); setCatId(v); fetchDocs(1, v); }}
              options={catItems}
            />
          )}
          <Space style={{ marginBottom: 16 }} wrap>
            <Input.Search
              placeholder="搜索标题/摘要/正文"
              allowClear
              style={{ width: 260 }}
              onSearch={(v) => { setKeyword(v); fetchDocs(1, catId, v); }}
            />
            {canUpload && (
              <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
                上传资料
              </Button>
            )}
            {!canUpload && <Alert type="info" showIcon message="当前角色为只读，请联系管理员上传资料" style={{ padding: '0 12px' }} />}
          </Space>

          <Table scroll={{ x: 'max-content' }}
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={docs.items}
            pagination={{ total: docs.total, pageSize: 20, current: page, showTotal: (t) => `共 ${t} 篇`, onChange: (p) => fetchDocs(p) }}
          />
        </div>
      </Content>

      {/* 上传资料 */}
      <Modal title="上传资料" open={uploadOpen} onOk={onUpload} onCancel={() => setUploadOpen(false)} confirmLoading={uploading} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="category_id" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Select options={cats.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '必填' }]}><Input placeholder="如：2026 Q4 激励政策" /></Form.Item>
          <Form.Item name="summary" label="摘要"><Input.TextArea rows={2} placeholder="一句话说明适用范围" /></Form.Item>
          <Form.Item name="content" label="正文"><Input.TextArea rows={6} placeholder="粘贴规则/说明正文（支持纯文本）" /></Form.Item>
          <Form.Item name="file" label="附件（PDF/Word/Excel 等）" valuePropName="fileList" getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}>
            <Upload beforeUpload={() => false} maxCount={1}>
              <Button icon={<InboxOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="version_note" label="版本说明"><Input placeholder="如：Q4 政策，替代 9 月版" /></Form.Item>
        </Form>
      </Modal>

      {/* 新增分类 */}
      <Modal title="新增分类" open={catOpen} onOk={onAddCat} onCancel={() => setCatOpen(false)} destroyOnHidden>
        <Form form={catForm} layout="vertical">
          <Form.Item name="name" label="分类名" rules={[{ required: true }]}><Input placeholder="如：广告产品资料" /></Form.Item>
          <Form.Item name="sort" label="排序"><Input type="number" placeholder="数字越小越靠前" /></Form.Item>
        </Form>
      </Modal>

      {/* 文档详情 */}
      <Drawer
        title={detail ? `${detail.title} · v${detail.version}` : ''}
        width={680}
        open={!!detail}
        onClose={() => setDetail(null)}
        extra={
          <Space>
            {canUpload && <Button icon={<HistoryOutlined />} onClick={() => setVersionOpen(true)}>上传新版本</Button>}
            {canManage && <Button danger onClick={onArchive}>归档</Button>}
            {detail?.file_path && (
              <Button type="link" href={`/api/knowledge/download/${detail.id}`} target="_blank">
                <PaperClipOutlined /> 下载附件（{detail.file_name}）
              </Button>
            )}
          </Space>
        }
      >
        {detail && (
          <div>
            <Typography.Paragraph type="secondary">
              {detail.category_name} · 创建人 {detail.creator_name || '-'} · 创建于 {detail.created_at?.slice(0, 10)}
            </Typography.Paragraph>
            {detail.summary && (
              <Alert type="info" showIcon message={detail.summary} style={{ marginBottom: 16 }} />
            )}
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{detail.content || '（无正文，仅附件）'}</Typography.Paragraph>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              版本历史（{detail.versions?.length || 0}）
            </Typography.Title>
            <Timeline
              items={(detail.versions || []).map((v) => ({
                children: (
                  <div>
                    <b>v{v.version}</b> · {v.changer_name || '-'} · {v.created_at?.slice(0, 10)}
                    {v.note && <div style={{ color: 'var(--ant-color-primary, #0f6bff)' }}>{v.note}</div>}
                    {v.file_name && <div><PaperClipOutlined /> {v.file_name}</div>}
                  </div>
                ),
              }))}
            />
          </div>
        )}
      </Drawer>

      {/* 新版本 */}
      <Modal title="上传新版本" open={versionOpen} onOk={onNewVersion} onCancel={() => setVersionOpen(false)} confirmLoading={uploading} destroyOnHidden>
        <Form form={verForm} layout="vertical">
          <Form.Item name="title" label="标题（留空沿用）"><Input /></Form.Item>
          <Form.Item name="content" label="正文（留空沿用）"><Input.TextArea rows={6} /></Form.Item>
          <Form.Item name="file" label="新附件" valuePropName="fileList" getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}>
            <Upload beforeUpload={() => false} maxCount={1}>
              <Button icon={<InboxOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="version_note" label="版本说明（重要变更请注明）" rules={[{ required: true, message: '请说明本次更新内容' }]}>
            <Input placeholder="如：激励系数调整，替代旧版" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
