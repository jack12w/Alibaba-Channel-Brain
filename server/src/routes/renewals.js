'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission, dataScope } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function todayStr() { return new Date().toISOString().slice(0, 10); }

// 续约窗口计算：T3=90天内（red≤30/orange31-60/yellow61-90），T6=180天内（blue）
function compute(contractEnd) {
  if (!contractEnd) return null;
  const days = Math.floor((new Date(contractEnd) - new Date(todayStr())) / 86400000);
  if (days < 0) return { window_type: 'expired', alert_level: null, days_left: days };
  if (days <= 90) return { window_type: 'T3', alert_level: days <= 30 ? 'red' : days <= 60 ? 'orange' : 'yellow', days_left: days };
  if (days <= 180) return { window_type: 'T6', alert_level: 'blue', days_left: days };
  return { window_type: null, alert_level: null, days_left: days };
}

function latestStoreRows(scope) {
  const where = ['s.stat_date = (SELECT MAX(stat_date) FROM snap_store)'];
  const params = {};
  if (scope.sql) { where.push(scope.sql); Object.assign(params, scope.params); }
  return db.prepare(`
    SELECT c.account_id, c.company_name, c.manager_name, c.supervisor_name, c.region, c.is_gold,
      s.contract_end, s.renew_early_status, s.contract_amount, s.plan_amount_1y, s.plan_amount_2y,
      s.p4p_monthly_spend, s.pending_gmv_90d, s.settled_gmv_90d, s.product_count, s.strength_products,
      s.super_products, s.lifecycle, s.lifecycle_type
    FROM snap_store s LEFT JOIN customers c ON c.account_id = s.account_id
    WHERE ${where.join(' AND ')}
  `).all(params);
}

// GET /api/renewals/panel — 续约面板（T3/T6 动态计算）
router.get('/panel', requirePermission('renewal.view'), (req, res) => {
  const windowType = req.query.window === 'T6' ? 'T6' : 'T3';
  const level = req.query.level || null;
  const scope = dataScope('s.', req.user, db);
  const rows = latestStoreRows(scope);
  const items = [];
  for (const r of rows) {
    const info = compute(r.contract_end);
    if (!info || info.window_type !== windowType) continue;
    if (level && info.alert_level !== level) continue;
    const st = db.prepare('SELECT status FROM renewal_status WHERE account_id = ?').get(r.account_id);
    items.push({ ...r, ...info, status: st ? st.status : 'open' });
  }
  items.sort((a, b) => a.days_left - b.days_left);
  res.json({ window_type: windowType, total: items.length, items });
});

// GET /api/renewals/summary — 续约汇总（T3/T6 各等级数量）
router.get('/summary', requirePermission('renewal.view'), (req, res) => {
  const scope = dataScope('s.', req.user, db);
  const rows = latestStoreRows(scope);
  const summary = { T3: { red: 0, orange: 0, yellow: 0, total: 0 }, T6: { blue: 0, total: 0 }, expired: 0 };
  for (const r of rows) {
    const info = compute(r.contract_end);
    if (!info) continue;
    if (info.window_type === 'expired') { summary.expired++; continue; }
    if (!summary[info.window_type]) continue;
    if (info.alert_level && summary[info.window_type][info.alert_level] !== undefined) summary[info.window_type][info.alert_level]++;
    summary[info.window_type].total++;
  }
  res.json(summary);
});

// GET /api/renewals/package/:accountId — 续约数据包
router.get('/package/:accountId', requirePermission('renewal.view'), (req, res) => {
  const accountId = req.params.accountId;
  const c = db.prepare('SELECT * FROM customers WHERE account_id = ?').get(accountId);
  if (!c) return res.status(404).json({ error: '客户不存在' });
  const store = db.prepare('SELECT * FROM snap_store WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId);
  const ad = db.prepare('SELECT * FROM snap_ad WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId);
  const awbOrders = db.prepare('SELECT * FROM awb_orders WHERE account_id = ? ORDER BY create_date DESC').all(accountId);
  const renewal = compute(c.expire_date || (store ? store.contract_end : null));
  const status = db.prepare('SELECT * FROM renewal_status WHERE account_id = ?').get(accountId);
  res.json({ customer: c, store, ad, awb_orders: awbOrders, renewal, status: status ? status.status : 'open' });
});

// PUT /api/renewals/:accountId/status — 更新续约跟进状态
router.put('/:accountId/status', requirePermission('renewal.manage'), (req, res) => {
  const { status } = req.body;
  if (!['open', 'following', 'done', 'lost'].includes(status)) {
    return res.status(400).json({ error: 'status 不合法' });
  }
  db.prepare(`
    INSERT INTO renewal_status (account_id, status, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(account_id) DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(req.params.accountId, status, req.user.uid || null);
  res.json({ ok: true });
});

module.exports = router;
