import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Switch, Button, Select, App, Alert, Typography, Space, Upload, InputNumber, Tooltip, Table } from 'antd';
import { SendOutlined, UploadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { api, getToken } from '../api/client';

// 渠道考核指标结构（驱动两列表单渲染）
const ASSESS_GROUPS = [
  {
    key: 'new_merchant', title: '新商客户',
    items: [
      { key: 'sku_30d', label: '30天 品(SKU)', unit: '个', hasRate: true },
      { key: 'p4p_60d', label: '60天 P4P月消耗', unit: '元', hasRate: true, hint: 'P4P月消耗达3000元' },
      { key: 'orders_90d', label: '90天 订单', unit: '单', hasRate: true },
      { key: 'hot_120d', label: '120天 优爆品', unit: '个', hasRate: true },
      { key: 'usd_180d', label: '180天 美金', unit: '美金', hasRate: true },
    ],
  },
  {
    key: 'dashboard', title: '大盘客户',
    items: [
      { key: 'sku', label: '品(SKU)', unit: '个', hasRate: true },
      { key: 'p4p', label: 'P4P月消耗', unit: '元', hasRate: true, hint: 'P4P月消耗达3000元' },
      { key: 'usd_90d', label: '90天 美金', unit: '美金', hasRate: true },
      { key: 'struct_detail', label: '结构化商详', type: 'bool' },
      { key: 'ai_kb', label: 'AI知识库', type: 'bool' },
      { key: 'hot_products', label: '市场热卖品≥', unit: '个', hasRate: true },
    ],
  },
  {
    key: 'gold', title: '金品客户',
    items: [
      { key: 'premium', label: '优品', unit: '个', hasRate: true },
      { key: 'p4p', label: 'P4P月消耗', unit: '元', hasRate: true, hint: 'P4P月消耗达6000元' },
      { key: 'sku', label: '品(SKU)', unit: '个', hasRate: true },
      { key: 'usd_90d', label: '90天 美金', unit: '美金', hasRate: true },
      { key: 'struct_detail', label: '结构化商详', type: 'bool' },
      { key: 'ai_kb', label: 'AI知识库', type: 'bool' },
      { key: 'hot_products', label: '市场热卖品≥', unit: '个', hasRate: true },
    ],
  },
  {
    key: 'renewal', title: '整体续签',
    items: [
      { key: 'first_year', label: '首次年续签率', unit: '%', hasRate: false },
      { key: 'multi_year', label: '多年续签率', unit: '%', hasRate: false },
    ],
  },
];

// 渠道考核基准值默认值（来自业务定义）
const DEFAULT_BASELINE = {
  new_merchant: {
    sku_30d: { value: 200, rate: 90 },
    p4p_60d: { value: 3000, rate: 60 },
    orders_90d: { value: 3, rate: 55 },
    hot_120d: { value: 20, rate: 60 },
    usd_180d: { value: 5000, rate: 60 },
  },
  dashboard: {
    sku: { value: 300 },
    p4p: { value: 3000 },
    usd_90d: { value: 30000 },
    struct_detail: { value: true },
    ai_kb: { value: true },
    hot_products: { value: 10 },
  },
  gold: {
    premium: { value: 50, rate: 60 },
    p4p: { value: 6000 },
    sku: { value: 300 },
    usd_90d: { value: 30000 },
    struct_detail: { value: true },
    ai_kb: { value: true },
    hot_products: { value: 10 },
  },
  renewal: {
    first_year: { value: 56 },
    multi_year: { value: 70 },
  },
};

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importDir, setImportDir] = useState('');
  const [importDirLoading, setImportDirLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoVer, setLogoVer] = useState(0);
  const [logoUploading, setLogoUploading] = useState(false);
  const [assess, setAssess] = useState({ baseline: DEFAULT_BASELINE, target: {} });
  const [assessSaving, setAssessSaving] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    api.get('/settings/dingtalk').then((cfg) => {
      form.setFieldsValue({
        webhook: cfg.webhook,
        secret: cfg.secret,
        enabled: cfg.enabled,
        at_mobiles: cfg.at_mobiles,
      });
    }).catch((e) => message.error(e.message));

    api.get('/settings/import').then((r) => setImportDir(r.import_dir || '')).catch(() => {});

    api.get('/settings/channel-assessment').then((d) => {
      // 按组合并默认值，避免服务端返回残缺 baseline 时丢失其它分组默认值
      const mergedBaseline = {};
      for (const g of ASSESS_GROUPS) {
        mergedBaseline[g.key] = { ...(DEFAULT_BASELINE[g.key] || {}), ...((d && d.baseline && d.baseline[g.key]) || {}) };
      }
      setAssess({
        baseline: mergedBaseline,
        target: (d && d.target) || {},
      });
    }).catch(() => {});
  }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    setLoading(true);
    try {
      await api.put('/settings/dingtalk', v);
      message.success('配置已保存');
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      await api.post('/settings/dingtalk/test', {});
      message.success('测试消息已发送，请查看钉钉群');
    } catch (e) {
      message.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const onSaveImportDir = async () => {
    if (!importDir.trim()) { message.warning('请填写导入目录路径'); return; }
    setImportDirLoading(true);
    try {
      await api.put('/settings/import', { import_dir: importDir.trim() });
      message.success('导入目录已保存');
    } catch (e) {
      message.error(e.message);
    } finally {
      setImportDirLoading(false);
    }
  };

  const onUploadFile = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      const token = getToken();
      const res = await fetch('/api/import/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `上传失败（${res.status}）`);
      const r = (data.results || [])[0] || {};
      if (r.error) message.error(`${file.name}: ${r.error}`);
      else if (r.skipped) message.warning(`${file.name}: ${r.reason}`);
      else message.success(`${file.name}: 导入 ${r.saved}/${r.total} 行`);
    } catch (e) {
      message.error(`${file.name}: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const onUploadLogo = async (file) => {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = getToken();
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `上传失败（${res.status}）`);
      message.success('Logo 已上传，左侧菜单已更新');
      setLogoVer(Date.now());
    } catch (e) {
      message.error(e.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const updateAssess = (side, groupKey, itemKey, patch) => {
    setAssess((prev) => {
      const group = (prev[side] || {})[groupKey] || {};
      const cell = group[itemKey] || {};
      return {
        ...prev,
        [side]: {
          ...(prev[side] || {}),
          [groupKey]: { ...group, [itemKey]: { ...cell, ...patch } },
        },
      };
    });
  };

  const renderValue = (item, side, groupKey, itemKey) => {
    const cell = ((assess[side] || {})[groupKey] || {})[itemKey] || {};
    if (item.type === 'bool') {
      return <Switch checked={!!cell.value} onChange={(c) => updateAssess(side, groupKey, itemKey, { value: c })} />;
    }
    return (
      <InputNumber
        value={cell.value ?? null}
        addonAfter={item.unit}
        style={{ width: 120 }}
        onChange={(v) => updateAssess(side, groupKey, itemKey, { value: v })}
      />
    );
  };

  // 区域考核指标 = 基准值 + 达成率 合并成一列
  const renderRegionCell = (item, groupKey, itemKey) => {
    const cell = ((assess.baseline || {})[groupKey] || {})[itemKey] || {};
    if (item.type === 'bool') {
      return <Switch checked={!!cell.value} onChange={(c) => updateAssess('baseline', groupKey, itemKey, { value: c })} />;
    }
    return (
      <Space size={6} wrap>
        <InputNumber
          value={cell.value ?? null}
          addonAfter={item.unit}
          style={{ width: 120 }}
          onChange={(v) => updateAssess('baseline', groupKey, itemKey, { value: v })}
        />
        {item.hasRate && (
          <InputNumber
            value={cell.rate ?? null}
            addonAfter="%"
            placeholder="达成率"
            style={{ width: 96 }}
            onChange={(v) => updateAssess('baseline', groupKey, itemKey, { rate: v })}
          />
        )}
      </Space>
    );
  };

  const assessRows = [];
  for (const g of ASSESS_GROUPS) {
    g.items.forEach((it, idx) => {
      assessRows.push({
        key: `${g.key}_${it.key}`,
        cat: g.title,
        catSpan: idx === 0 ? g.items.length : 0,
        groupKey: g.key,
        itemKey: it.key,
        label: it.label,
        unit: it.unit,
        hasRate: it.hasRate,
        type: it.type,
        hint: it.hint,
      });
    });
  }

  const assessColumns = [
    {
      title: '客户类型',
      dataIndex: 'cat',
      width: 92,
      onCell: (r) => ({ rowSpan: r.catSpan }),
      render: (v, r) => (r.catSpan ? <span style={{ fontWeight: 500 }}>{v}</span> : null),
    },
    {
      title: '考核指标',
      dataIndex: 'label',
      render: (v, r) => (
        <span>
          {v}
          {r.hint && (
            <Tooltip title={r.hint}><QuestionCircleOutlined style={{ marginLeft: 4, color: '#999' }} /></Tooltip>
          )}
        </span>
      ),
    },
    { title: '区域考核指标', key: 'region', render: (_, r) => renderRegionCell(r, r.groupKey, r.itemKey) },
    { title: '渠道考核指标', key: 'target', render: (_, r) => renderValue(r, 'target', r.groupKey, r.itemKey) },
  ];

  const onSaveAssess = async () => {
    setAssessSaving(true);
    try {
      await api.put('/settings/channel-assessment', assess);
      message.success('渠道考核配置已保存');
    } catch (e) {
      message.error(e.message);
    } finally {
      setAssessSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1080 }}>
      <Card title="渠道 Logo" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <img
            src={`/api/settings/logo?t=${logoVer}`}
            alt="渠道 Logo"
            style={{ height: 64, objectFit: 'contain', border: '1px solid var(--ant-color-border)', borderRadius: 8, padding: 4 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <Upload
            accept="image/*"
            showUploadList={false}
            disabled={logoUploading}
            beforeUpload={(file) => { onUploadLogo(file); return false; }}
          >
            <Button icon={<UploadOutlined />} loading={logoUploading}>上传 Logo</Button>
          </Upload>
        </div>
        <Alert type="info" showIcon style={{ marginTop: 12 }} message="建议正方形 PNG/SVG，高度约 40px；上传后左侧菜单顶部立即显示。" />
      </Card>

      <Card title="系统设置 · 钉钉推送" style={{ marginBottom: 16 }}>
        <Alert
          type="info" showIcon style={{ marginBottom: 20 }}
          message="配置后，客户指标异常（跌破监控目标）或指标下降时将自动推送到钉钉群"
        />
        <Form form={form} layout="vertical">
          <Form.Item name="enabled" label="启用钉钉推送" valuePropName="checked">
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            name="webhook" label="钉钉群机器人 Webhook"
            rules={[{ required: true, message: '请填写 webhook' }]}
            extra="钉钉群 → 群设置 → 机器人 → 自定义 → 复制 Webhook 地址"
          >
            <Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx" />
          </Form.Item>
          <Form.Item
            name="secret" label="加签 Secret（可选）"
            extra="机器人安全设置选【加签】时填写；选【自定义关键词】则留空"
          >
            <Input.Password placeholder="SEC 开头的加签密钥" />
          </Form.Item>
          <Form.Item name="at_mobiles" label="@ 手机号（可选）">
            <Select mode="tags" placeholder="输入手机号回车添加" tokenSeparators={[',', '，', ' ']} open={false} suffixIcon={null} />
          </Form.Item>
          <Space>
            <Button type="primary" loading={loading} onClick={onSave}>保存配置</Button>
            <Button icon={<SendOutlined />} loading={testing} onClick={onTest}>发送测试消息</Button>
          </Space>
        </Form>
      </Card>

      <Card title="系统设置 · 数据导入" style={{ marginBottom: 16 }}>
        <Alert
          type="info" showIcon style={{ marginBottom: 20 }}
          message="服务器部署后可直接上传 CSV 立即导入；本机运行时每天 09:00 自动扫描下方目录并增量导入"
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input
            value={importDir}
            onChange={(e) => setImportDir(e.target.value)}
            placeholder="例如 C:/Users/TFKJ/Desktop/渠道数据导入"
            style={{ flex: 1 }}
          />
          <Button type="primary" loading={importDirLoading} onClick={onSaveImportDir}>保存目录</Button>
        </div>
        <Upload
          accept=".csv"
          multiple
          showUploadList={false}
          disabled={uploading}
          beforeUpload={(file) => { onUploadFile(file); return false; }}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>上传 CSV 并导入</Button>
        </Upload>
      </Card>

      <Card title="渠道考核（区域考核指标 / 渠道考核指标）" style={{ marginBottom: 16 }}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="左列「区域考核指标」为业务定义默认值（含达成率）；右列「渠道考核指标」结构相同，留空不计入。" />
        <Table
          columns={assessColumns}
          dataSource={assessRows}
          pagination={false}
          size="middle"
          bordered
          scroll={{ x: 820 }}
        />
        <Button type="primary" loading={assessSaving} onClick={onSaveAssess} style={{ marginTop: 16 }}>
          保存考核配置
        </Button>
      </Card>

      <Card title="推送规则说明" size="small">
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          <b>⚠️ 客户指标异常</b>：监控指标跌破目标值（如 P4P 日均消耗低于设定值）
        </Typography.Paragraph>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          <b>📉 客户指标下降提醒</b>：监控指标未跌破目标，但较上期数据下降（如本月询盘低于上月）
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
