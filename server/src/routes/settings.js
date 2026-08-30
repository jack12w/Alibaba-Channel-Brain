'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const { requireAuth, requirePermission, getJwtSecret, regenerateJwtSecret } = require('../auth');
const dingtalk = require('../services/dingtalk');

const router = express.Router();

// ---------- 渠道 Logo 上传 ----------
const LOGO_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGO_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.png').replace(/[\\/:*?"<>|]/g, '_');
    cb(null, `channel_logo_${Date.now()}${ext}`);
  },
});
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}
// GET /api/settings/logo — 公共下发 Logo（侧边栏 <img> 直接引用，无需鉴权），必须注册在 requireAuth 之前
router.get('/logo', (req, res) => {
  const rel = getSetting('channel_logo');
  if (!rel) return res.status(404).json({ error: '未配置 logo' });
  const abs = path.join(__dirname, '..', '..', rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'logo 文件缺失' });
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(abs);
});

router.use(requireAuth);

// GET /api/settings/dingtalk — 读取钉钉配置（含真实 secret，内部管理员可见，前端用密码框显隐）
router.get('/dingtalk', requirePermission('system.manage'), (req, res) => {
  const cfg = dingtalk.getConfig(db);
  res.json({
    webhook: cfg.webhook,
    secret: cfg.secret || '',
    enabled: cfg.enabled,
    at_mobiles: cfg.atMobiles,
  });
});

// PUT /api/settings/dingtalk — 保存钉钉配置
router.put('/dingtalk', requirePermission('system.manage'), (req, res) => {
  const { webhook, secret, enabled, at_mobiles } = req.body;
  const set = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  // 保存时：webhook/secret 为空（未填）则保留原值，避免误清空密钥导致推送失效
  const current = dingtalk.getConfig(db);
  const finalWebhook = webhook !== undefined && webhook !== '' ? webhook : current.webhook;
  const finalSecret = secret !== undefined && secret !== '' ? secret : current.secret;
  set.run('dingtalk_webhook', finalWebhook || '');
  set.run('dingtalk_secret', finalSecret || '');
  set.run('dingtalk_enabled', enabled ? 'true' : 'false');
  set.run('dingtalk_at_mobiles', JSON.stringify(at_mobiles || []));
  res.json({ ok: true });
});

// POST /api/settings/dingtalk/test — 发送测试消息
router.post('/dingtalk/test', requirePermission('system.manage'), async (req, res) => {
  const cfg = dingtalk.getConfig(db);
  if (!cfg.enabled || !cfg.webhook) {
    return res.status(400).json({ error: '钉钉推送未启用或未配置 webhook' });
  }
  try {
    const r = await dingtalk.sendMarkdown({
      webhook: cfg.webhook,
      secret: cfg.secret,
      title: '✅ 渠道中心大脑测试消息',
      text: `#### ✅ 钉钉推送配置成功\n- 系统：渠道中心大脑\n- 时间：${new Date().toLocaleString('zh-CN')}\n- 后续客户指标异常/下降将推送到此群`,
      atMobiles: cfg.atMobiles,
    });
    res.json({ ok: true, errcode: r.errcode });
  } catch (e) {
    res.status(500).json({ error: `推送失败：${e.message}` });
  }
});

// GET /api/settings/import — 读取数据导入目录配置
router.get('/import', requirePermission('system.manage'), (req, res) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'import_dir'").get();
  res.json({ import_dir: row ? row.value : '' });
});

// PUT /api/settings/import — 保存数据导入目录配置
router.put('/import', requirePermission('system.manage'), (req, res) => {
  const { import_dir } = req.body || {};
  if (!import_dir || !String(import_dir).trim()) {
    return res.status(400).json({ error: '请填写导入目录路径' });
  }
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run('import_dir', String(import_dir).trim());
  res.json({ ok: true });
});

// ---------- 渠道 Logo ----------
// POST /api/settings/logo — 上传渠道 Logo（仅管理员）
router.post('/logo', requirePermission('system.manage'), logoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
  const rel = path.relative(path.join(__dirname, '..', '..'), req.file.path);
  setSetting('channel_logo', rel);
  res.json({ ok: true, path: '/api/settings/logo' });
});

// DELETE /api/settings/logo — 删除渠道 Logo（仅管理员）：同时删数据库记录 + 磁盘文件
router.delete('/logo', requirePermission('system.manage'), (req, res) => {
  const rel = getSetting('channel_logo');
  if (rel) {
    const abs = path.join(__dirname, '..', '..', rel);
    try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch (e) { /* 文件缺失则忽略，继续清记录 */ }
    db.prepare("DELETE FROM app_settings WHERE key = 'channel_logo'").run();
  }
  res.json({ ok: true });
});

// ---------- 渠道考核（基准值 / 目标值）----------
// GET /api/settings/channel-assessment — 读取渠道考核配置
router.get('/channel-assessment', requirePermission('system.manage'), (req, res) => {
  const raw = getSetting('channel_assessment');
  let data = { baseline: {}, target: {} };
  if (raw) {
    try { data = JSON.parse(raw); } catch (e) { /* 损坏则回退默认 */ }
  }
  res.json(data);
});

// PUT /api/settings/channel-assessment — 保存渠道考核配置
router.put('/channel-assessment', requirePermission('system.manage'), (req, res) => {
  const { baseline, target } = req.body || {};
  if (!baseline || typeof baseline !== 'object') {
    return res.status(400).json({ error: '参数错误：缺少 baseline' });
  }
  setSetting('channel_assessment', JSON.stringify({ baseline, target: target || {} }));
  res.json({ ok: true });
});

// ---------- JWT 密钥（仅系统管理员）----------
// GET /api/settings/jwt-secret — 读取当前密钥（明文返回，前端用显隐切换；无权限返回 403）
router.get('/jwt-secret', requirePermission('system.manage'), (req, res) => {
  res.json({ secret: getJwtSecret() });
});

// POST /api/settings/jwt-secret/regenerate — 重新生成密钥（旧令牌立即失效，全员掉登录）
router.post('/jwt-secret/regenerate', requirePermission('system.manage'), (req, res) => {
  try {
    const secret = regenerateJwtSecret();
    res.json({ ok: true, secret });
  } catch (e) {
    res.status(500).json({ error: `重新生成失败：${e.message}` });
  }
});

module.exports = router;
