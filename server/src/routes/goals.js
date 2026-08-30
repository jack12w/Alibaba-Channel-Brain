'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');
const goalEngine = require('../services/goalEngine');

const router = express.Router();
router.use(requireAuth);

// GET /api/goals?category=&period= — 达成查询
router.get('/', requirePermission('goal.view'), (req, res) => {
  res.json({ items: goalEngine.queryGoals(db, { category: req.query.category, period: req.query.period }) });
});

// GET /api/goals/periods — 可选周期（年份+季度）
router.get('/periods', requirePermission('goal.view'), (req, res) => {
  const year = new Date().getFullYear();
  const periods = [String(year), `${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`];
  res.json({ periods });
});

// GET /api/goals/p2w-customers — 2 万 P 打包客户使用监控清单
router.get('/p2w-customers', requirePermission('goal.view'), (req, res) => {
  const items = db.prepare(`
    SELECT c.id, c.company_name, c.store_id, c.plan_type, c.sign_date, c.p_package_amount,
      (SELECT COALESCE(SUM(a.spend), 0) FROM ad_stats_monthly a
       WHERE a.customer_id = c.id AND (a.ad_type LIKE '%P4P%' OR a.ad_type LIKE '%p4p%')) AS used
    FROM customers c WHERE c.p_package_amount > 0
    ORDER BY c.sign_date
  `).all();
  res.json({
    items: items.map((r) => ({
      ...r,
      usage_rate: r.p_package_amount ? Number((r.used / r.p_package_amount * 100).toFixed(1)) : 0,
      status: r.used >= r.p_package_amount ? 'full' : (r.used > 0 ? 'using' : 'unused'),
    })),
  });
});

// GET /api/goals/awb-payments?month=2026-08 — AWB 付款客户明细
router.get('/awb-payments', requirePermission('goal.view'), (req, res) => {
  const month = req.query.month || null;
  const items = month
    ? db.prepare('SELECT * FROM awb_payments WHERE month = ? ORDER BY pay_date').all(month)
    : db.prepare('SELECT * FROM awb_payments ORDER BY month DESC, pay_date').all();
  res.json({ items });
});

// POST /api/goals — 新增目标（管理）
router.post('/', requirePermission('goal.manage'), (req, res) => {
  const { category, period, name, metric, target_value, unit } = req.body;
  if (!category || !name || !metric || target_value === undefined) {
    return res.status(400).json({ error: 'category/name/metric/target_value 必填' });
  }
  const info = db.prepare(`
    INSERT INTO goal_targets (category, period, name, metric, target_value, unit, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(category, period || '', name, metric, Number(target_value), unit || '');
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/goals/:id — 调整目标（管理）
router.put('/:id', requirePermission('goal.manage'), (req, res) => {
  const g = db.prepare('SELECT * FROM goal_targets WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: '目标不存在' });
  const { name, target_value, unit, enabled, period } = req.body;
  db.prepare(`
    UPDATE goal_targets SET name = ?, target_value = ?, unit = ?, enabled = ?, period = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    name !== undefined ? name : g.name,
    target_value !== undefined ? Number(target_value) : g.target_value,
    unit !== undefined ? unit : g.unit,
    enabled !== undefined ? (enabled ? 1 : 0) : g.enabled,
    period !== undefined ? period : (g.period || ''),
    g.id,
  );
  res.json({ ok: true });
});

// PUT /api/goals/actuals/:goalId — 手动录入实际值（管理）
router.put('/actuals/:goalId', requirePermission('goal.manage'), (req, res) => {
  const g = db.prepare('SELECT * FROM goal_targets WHERE id = ?').get(req.params.goalId);
  if (!g) return res.status(404).json({ error: '目标不存在' });
  const { actual_value, period, note } = req.body;
  if (actual_value === undefined) return res.status(400).json({ error: 'actual_value 必填' });
  db.prepare(`
    INSERT INTO manual_actuals (goal_id, period, actual_value, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(goal_id, period) DO UPDATE SET
      actual_value = excluded.actual_value, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(g.id, period || '', Number(actual_value), note || '', req.user.uid);
  res.json({ ok: true });
});

module.exports = router;
