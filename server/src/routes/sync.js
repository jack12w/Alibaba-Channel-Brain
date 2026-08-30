'use strict';

const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');
const syncParser = require('../services/syncParser');
const monitorEngine = require('../services/monitorEngine');

const router = express.Router();

// POST /api/sync/token/:customerId — 生成/重置客户 sync_token（管理员）
router.post('/token/:customerId', requireAuth, requirePermission('system.manage'), (req, res) => {
  const c = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.customerId);
  if (!c) return res.status(404).json({ error: '客户不存在' });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE customers SET sync_token = ? WHERE id = ?').run(token, c.id);
  res.json({ ok: true, sync_token: token });
});

// POST /api/sync/plugin — 插件数据上报（sync_token 鉴权，无需登录）
router.post('/plugin', (req, res) => {
  const token = req.headers['x-sync-token'];
  if (!token) return res.status(401).json({ error: '缺少 sync_token' });
  const customer = db.prepare('SELECT * FROM customers WHERE sync_token = ?').get(token);
  if (!customer) return res.status(403).json({ error: 'sync_token 无效' });

  const payload = req.body || {};
  const { store_id, source, report, date, tables } = payload;
  if (!report || !Array.isArray(tables)) {
    return res.status(400).json({ error: 'payload 需包含 report 与 tables 数组' });
  }

  // store_id 一致性校验（有则校验，无则信任 token 对应客户）
  if (store_id && customer.store_id && store_id !== customer.store_id) {
    db.prepare(`
      INSERT INTO data_sync_logs (source, customer_id, sync_type, status, message, synced_at)
      VALUES (?, ?, ?, 'failed', ?, datetime('now','localtime'))
    `).run(source || 'plugin', customer.id, report, `store_id 不一致：${store_id} != ${customer.store_id}`);
    return res.status(403).json({ error: 'store_id 与 token 不匹配' });
  }

  try {
    const { saved, logs } = syncParser.parse(db, payload, customer);
    const message = logs.join('; ') || `入库 ${saved} 条`;
    db.prepare(`
      INSERT INTO data_sync_logs (source, customer_id, sync_type, status, message, synced_at)
      VALUES (?, ?, ?, 'success', ?, datetime('now','localtime'))
    `).run(source || 'plugin', customer.id, report, `tables=${tables.length}, saved=${saved}${logs.length ? '；' + message : ''}`);
    // 数据入库后即时触发该客户指标监控检查（新鲜数据立即判断）
    monitorEngine.check(db, customer.id).then((m) => {
      if (m.created > 0) {
        console.log(`[monitor] 同步触发告警 ${m.created} 条（客户 ${customer.id}，推送 ${m.pushed}）`);
      }
    }).catch((e) => {
      console.error('[monitor] 同步触发检查失败', e.message);
    });
    res.json({ ok: true, saved, logs });
  } catch (e) {
    console.error('[sync] 解析失败', e);
    db.prepare(`
      INSERT INTO data_sync_logs (source, customer_id, sync_type, status, message, synced_at)
      VALUES (?, ?, ?, 'failed', ?, datetime('now','localtime'))
    `).run(source || 'plugin', customer.id, report, e.message);
    res.status(500).json({ error: '数据解析失败', detail: e.message });
  }
});

// GET /api/sync/logs — 同步日志（管理员/管理层）
router.get('/logs', requireAuth, requirePermission('system.manage'), (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, c.company_name FROM data_sync_logs l
    LEFT JOIN customers c ON c.id = l.customer_id
    ORDER BY l.id DESC LIMIT 100
  `).all();
  res.json(rows);
});

module.exports = router;
