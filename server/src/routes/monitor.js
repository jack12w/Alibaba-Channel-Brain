'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');
const { METRIC_TYPES, getMetricValue } = require('../services/metrics');
const monitorEngine = require('../services/monitorEngine');

const router = express.Router();
router.use(requireAuth);

// GET /api/monitor/meta — 指标类型
router.get('/meta', requirePermission('work.view'), (req, res) => {
  res.json({ metric_types: METRIC_TYPES });
});

// GET /api/monitor/checks?customer_id=&status=&page= — 告警列表
router.get('/checks', requirePermission('work.view'), (req, res) => {
  const { customer_id, status, page = 1, page_size = 20 } = req.query;
  const where = [];
  const params = {};
  if (customer_id) { where.push('a.customer_id = @customer_id'); params.customer_id = Number(customer_id); }
  if (status) { where.push('a.status = @status'); params.status = status; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM metric_alerts a ${whereSql}`).get(params).n;
  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const items = db.prepare(`
    SELECT a.*, c.company_name, c.store_id, m.name AS handled_name
    FROM metric_alerts a
    JOIN customers c ON c.id = a.customer_id
    LEFT JOIN team_members m ON m.id = a.handled_by
    ${whereSql}
    ORDER BY a.status = 'open' DESC, a.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({ total, page: Number(page), page_size: limit, items });
});

// GET /api/monitor/checks/open-count — open 告警数（Tab 角标）
router.get('/checks/open-count', requirePermission('work.view'), (req, res) => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM metric_alerts WHERE status = 'open'").get().n;
  res.json({ open: n });
});

// GET /api/monitor/monitors — 监控规则列表
router.get('/monitors', requirePermission('work.view'), (req, res) => {
  const rows = db.prepare(`
    SELECT mm.*, c.company_name, m.name AS creator_name
    FROM metric_monitors mm
    JOIN customers c ON c.id = mm.customer_id
    LEFT JOIN team_members m ON m.id = mm.created_by
    ORDER BY mm.id DESC
  `).all();
  res.json(rows);
});

// POST /api/monitor/monitors — 新增监控
router.post('/monitors', requirePermission('work.create'), (req, res) => {
  const { customer_id, metric_type, target_value, compare, note } = req.body;
  if (!customer_id || !metric_type || target_value === undefined) {
    return res.status(400).json({ error: 'customer_id / metric_type / target_value 必填' });
  }
  const info = db.prepare(`
    INSERT INTO metric_monitors (customer_id, metric_type, target_value, compare, note, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(Number(customer_id), metric_type, Number(target_value), compare || 'gte', note || null, req.user.member_id || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/monitor/monitors/:id — 更新监控
router.put('/monitors/:id', requirePermission('work.create'), (req, res) => {
  const m = db.prepare('SELECT * FROM metric_monitors WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: '监控不存在' });
  const upd = {};
  for (const f of ['metric_type', 'target_value', 'compare', 'note', 'status']) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  if (!Object.keys(upd).length) return res.status(400).json({ error: '无更新字段' });
  const sets = Object.keys(upd).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE metric_monitors SET ${sets}, updated_at = datetime('now','localtime') WHERE id = @id`)
    .run({ ...upd, id: req.params.id });
  res.json({ ok: true });
});

// POST /api/monitor/checks/run — 手动触发检查
router.post('/checks/run', requirePermission('work.create'), async (req, res) => {
  const customerId = req.body.customer_id ? Number(req.body.customer_id) : undefined;
  try {
    const r = await monitorEngine.check(db, customerId);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: `检查失败：${e.message}` });
  }
});

// POST /api/monitor/checks/:id/handle — 处理告警
router.post('/checks/:id/handle', requirePermission('work.create'), (req, res) => {
  const a = db.prepare('SELECT * FROM metric_alerts WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: '告警不存在' });
  db.prepare(`
    UPDATE metric_alerts SET status = 'handled', handled_by = ?, handled_at = datetime('now','localtime'), handle_note = ?
    WHERE id = ?
  `).run(req.user.member_id || null, req.body.note || null, req.params.id);
  res.json({ ok: true });
});

// GET /api/monitor/metrics/:customerId/:metricType/latest — 指标最新值（回验自动带出）
router.get('/metrics/:customerId/:metricType/latest', requirePermission('work.view'), (req, res) => {
  const got = getMetricValue(db, Number(req.params.customerId), req.params.metricType);
  res.json({ metric_type: req.params.metricType, ...(got || { value: null }) });
});

module.exports = router;
