'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const ACTION_TYPES = ['广告优化', '关键词优化', '店铺装修', '产品发布', '培训', '活动', '其他'];
const METRIC_TYPES = {
  p4p_daily_spend: 'P4P日均消耗',
  exposure: '曝光',
  clicks: '点击',
  inquiries: '询盘',
  gmv: 'GMV',
  ctr: '点击率',
};

// GET /api/work/meta — 动作类型与指标类型（前端下拉）
router.get('/meta', requirePermission('work.view'), (req, res) => {
  res.json({ action_types: ACTION_TYPES, metric_types: METRIC_TYPES });
});

// GET /api/work/logs?customer_id=&member_id=&status=&metric_type=&keyword=&page=
router.get('/logs', requirePermission('work.view'), (req, res) => {
  const { customer_id, member_id, status, metric_type, keyword, page = 1, page_size = 20 } = req.query;
  const where = [];
  const params = {};
  if (customer_id) { where.push('w.customer_id = @customer_id'); params.customer_id = Number(customer_id); }
  if (member_id) { where.push('w.member_id = @member_id'); params.member_id = Number(member_id); }
  if (status) { where.push('w.status = @status'); params.status = status; }
  if (metric_type) { where.push('w.metric_type = @metric_type'); params.metric_type = metric_type; }
  if (keyword) { where.push('(c.company_name LIKE @kw OR w.title LIKE @kw)'); params.kw = `%${keyword}%`; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM work_logs w ${whereSql}`).get(params).n;
  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const items = db.prepare(`
    SELECT w.*, c.company_name, c.store_id, c.industry, m.name AS member_name
    FROM work_logs w
    JOIN customers c ON c.id = w.customer_id
    LEFT JOIN team_members m ON m.id = w.member_id
    ${whereSql}
    ORDER BY w.created_at DESC, w.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({ total, page: Number(page), page_size: limit, items });
});

// POST /api/work/logs — 创建过程记录
router.post('/logs', requirePermission('work.create'), (req, res) => {
  const { customer_id, action_type, title, description, metric_type, baseline_value, target_value, target_date, member_id } = req.body;
  if (!customer_id || !action_type || !title || !metric_type) {
    return res.status(400).json({ error: 'customer_id / action_type / title / metric_type 必填' });
  }
  const info = db.prepare(`
    INSERT INTO work_logs (customer_id, member_id, action_type, title, description, metric_type, baseline_value, target_value, target_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(Number(customer_id), member_id || req.user.member_id || null, action_type, title, description || null,
    metric_type, baseline_value || null, target_value || null, target_date || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/work/logs/:id — 更新记录（执行人或管理员）
router.put('/logs/:id', (req, res) => {
  const w = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: '记录不存在' });
  // 权限：管理员/管理层 或 记录本人
  const isAdmin = req.user.role === 'admin' || req.user.role === 'manager';
  if (!isAdmin && w.member_id !== req.user.member_id) {
    return res.status(403).json({ error: '只能编辑自己的记录' });
  }
  const upd = {};
  for (const f of ['action_type', 'title', 'description', 'metric_type', 'baseline_value', 'target_value', 'target_date', 'customer_id']) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  if (!Object.keys(upd).length) return res.status(400).json({ error: '无更新字段' });
  const sets = Object.keys(upd).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE work_logs SET ${sets}, updated_at = datetime('now','localtime') WHERE id = @id`)
    .run({ ...upd, id: req.params.id });
  res.json({ ok: true });
});

// POST /api/work/logs/:id/verify — 回验：填实际值自动判定
router.post('/logs/:id/verify', requirePermission('work.create'), (req, res) => {
  const w = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: '记录不存在' });
  if (w.status === 'closed') return res.status(400).json({ error: '已关闭的记录不能回验' });
  const actual = Number(req.body.actual_value);
  if (actual === undefined || Number.isNaN(actual)) {
    return res.status(400).json({ error: 'actual_value 必填且为数字' });
  }
  const target = w.target_value;
  const status = target !== null && actual >= target ? 'achieved' : 'missed';
  db.prepare(`
    UPDATE work_logs SET actual_value = ?, status = ?, verified_at = datetime('now','localtime'), verify_note = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(actual, status, req.body.verify_note || null, req.params.id);
  res.json({ ok: true, status });
});

// POST /api/work/logs/:id/close — 关闭记录（中止/放弃）
router.post('/logs/:id/close', (req, res) => {
  const w = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: '记录不存在' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'manager';
  if (!isAdmin && w.member_id !== req.user.member_id) {
    return res.status(403).json({ error: '只能关闭自己的记录' });
  }
  db.prepare(`UPDATE work_logs SET status = 'closed', updated_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// GET /api/work/stats?period=month|all — 绩效统计（执行人维度）
router.get('/stats', requirePermission('work.view'), (req, res) => {
  const period = req.query.period || 'month';
  const month = new Date().toISOString().slice(0, 7);
  const where = period === 'month' ? 'WHERE strftime(\'%Y-%m\', w.created_at) = ?' : '';
  const params = period === 'month' ? [month] : [];

  const rows = db.prepare(`
    SELECT w.member_id, m.name AS member_name, m.team,
      COUNT(*) AS total,
      SUM(CASE WHEN w.status = 'achieved' THEN 1 ELSE 0 END) AS achieved,
      SUM(CASE WHEN w.status = 'missed' THEN 1 ELSE 0 END) AS missed,
      SUM(CASE WHEN w.status = 'active' THEN 1 ELSE 0 END) AS active,
      ROUND(AVG(CASE WHEN w.status IN ('achieved','missed') THEN 1.0 END), 3) AS rate
    FROM work_logs w
    LEFT JOIN team_members m ON m.id = w.member_id
    ${where}
    GROUP BY w.member_id
    ORDER BY total DESC
  `).all(...params);

  const overall = {
    total: rows.reduce((s, r) => s + r.total, 0),
    achieved: rows.reduce((s, r) => s + (r.achieved || 0), 0),
    missed: rows.reduce((s, r) => s + (r.missed || 0), 0),
    active: rows.reduce((s, r) => s + (r.active || 0), 0),
  };
  overall.rate = overall.achieved + overall.missed > 0
    ? Number((overall.achieved / (overall.achieved + overall.missed)).toFixed(3))
    : 0;

  res.json({ period, month, overall, members: rows });
});

module.exports = router;
module.exports.METRIC_TYPES = METRIC_TYPES;
