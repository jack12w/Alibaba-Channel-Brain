'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission, dataScope } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const MILESTONES = [
  { key: 'p30', name: '30天·品200', status: 'p30_status', days: 'p30_days', value: 'p30_value' },
  { key: 'p60', name: '60天·P3000', status: 'p60_status', days: 'p60_days', value: 'p60_value' },
  { key: 'p90', name: '90天·3单', status: 'p90_status', days: 'p90_days', value: 'p90_value' },
  { key: 'p120', name: '120天·优爆品20', status: 'p120_status', days: 'p120_days', value: 'p120_value' },
  { key: 'p180_gmv', name: '180天·5000美金', status: 'p180_gmv_status', days: 'p180_gmv_days', value: 'p180_gmv_value' },
  { key: 'p180_star', name: '180天·达1星', status: 'p180_star_status', days: 'p180_star_days', value: 'p180_star_value' },
];

function rate(rows, field) {
  const eligible = rows.filter((r) => r[field] === '达标' || r[field] === '不达标');
  const hit = rows.filter((r) => r[field] === '达标').length;
  return { total: eligible.length, hit, rate: eligible.length ? Number((hit / eligible.length * 100).toFixed(1)) : 0 };
}

// GET /api/milestones/overview — 6 里程碑达标率
router.get('/overview', requirePermission('goal.view'), (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM snap_milestone WHERE stat_date = (SELECT MAX(stat_date) FROM snap_milestone)
  `).all();
  const scope = dataScope('', req.user, db, 'sales_name');
  const filtered = scope.sql ? rows.filter((r) => {
    // 行级隔离用 sales_name 匹配绑定经理名
    const names = db.prepare('SELECT manager_name FROM user_customer_binding WHERE user_id = ?').all(req.user.uid).map((b) => b.manager_name);
    return names.includes(r.sales_name);
  }) : rows;

  const items = MILESTONES.map((m) => ({ key: m.key, name: m.name, ...rate(filtered, m.status) }));
  const highRisk = filtered.filter((r) => r.is_high_risk === '高风险').length;
  res.json({ snapshot_date: rows[0] ? rows[0].stat_date : null, total: filtered.length, high_risk: highRisk, items });
});

// GET /api/milestones/list — 明细（可按里程碑筛选）
router.get('/list', requirePermission('goal.view'), (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM snap_milestone WHERE stat_date = (SELECT MAX(stat_date) FROM snap_milestone)
    ORDER BY service_days DESC
  `).all();
  res.json({ total: rows.length, items: rows });
});

module.exports = router;
