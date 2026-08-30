'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission, dataScope } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// 最新商家运营快照日期
const LATEST_STORE = '(SELECT MAX(stat_date) FROM snap_store WHERE account_id = c.account_id)';

// GET /api/customers — 客户列表（真实数据：customers + 最新快照聚合）
router.get('/', requirePermission('customer.view'), (req, res) => {
  const { keyword, region, manager, industry, page = 1, page_size = 20 } = req.query;
  const where = [];
  const params = {};
  if (keyword) {
    where.push('(c.company_name LIKE @kw OR c.account_id LIKE @kw OR c.manager_name LIKE @kw)');
    params.kw = `%${keyword}%`;
  }
  if (region) { where.push('c.region = @region'); params.region = region; }
  if (manager) { where.push('c.manager_name = @manager'); params.manager = manager; }
  if (industry) {
    where.push('(c.industry_l1 LIKE @ind OR c.industry_l2 LIKE @ind OR c.industry_l3 LIKE @ind)');
    params.ind = `%${industry}%`;
  }
  const scope = dataScope('c.', req.user, db);
  if (scope.sql) { where.push(scope.sql); Object.assign(params, scope.params); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers c ${whereSql}`).get(params).n;
  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const rows = db.prepare(`
    SELECT c.id, c.account_id, c.company_name, c.manager_name, c.supervisor_name,
      c.region, c.region_large, c.industry_l1, c.industry_l2, c.industry_l3,
      c.is_gold, c.lifecycle, c.expire_date, c.contract_start, c.shop_url, c.operator_name,
      s.p4p_monthly_spend, s.product_count, s.strength_products, s.super_products,
      s.p4p_status, s.p4p_level, s.pending_gmv_90d, s.settled_gmv_90d, s.renew_early_status
    FROM customers c
    LEFT JOIN snap_store s ON s.account_id = c.account_id AND s.stat_date = ${LATEST_STORE}
    ${whereSql}
    ORDER BY c.expire_date IS NULL, c.expire_date ASC, c.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({ total, page: Number(page), page_size: limit, items: rows });
});

// GET /api/customers/:accountId — 客户详情（四个快照 + AWB 订单 + 历史趋势）
router.get('/:accountId', requirePermission('customer.view'), (req, res) => {
  const accountId = req.params.accountId;
  const c = db.prepare('SELECT * FROM customers WHERE account_id = ?').get(accountId);
  if (!c) return res.status(404).json({ error: '客户不存在' });

  const store = db.prepare('SELECT * FROM snap_store WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId);
  const ad = db.prepare('SELECT * FROM snap_ad WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId);
  const milestone = db.prepare('SELECT * FROM snap_milestone WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId);
  const camp = db.prepare('SELECT * FROM snap_camp WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId);
  const awbOrders = db.prepare('SELECT * FROM awb_orders WHERE account_id = ? ORDER BY create_date DESC').all(accountId);
  const storeHistory = db.prepare(`
    SELECT stat_date, p4p_monthly_spend, exposure_30d, clicks_30d, inquiries_30d, pending_gmv_90d, settled_gmv_90d
    FROM snap_store WHERE account_id = ? ORDER BY stat_date
  `).all(accountId);

  res.json({ customer: c, store, ad, milestone, camp, awb_orders: awbOrders, store_history: storeHistory });
});

// GET /api/customers/meta/managers — 客户经理下拉（供筛选/绑定）
router.get('/meta/managers', requirePermission('customer.view'), (req, res) => {
  const rows = db.prepare(`
    SELECT manager_name, COUNT(*) AS n FROM customers
    WHERE manager_name IS NOT NULL AND manager_name != ''
    GROUP BY manager_name ORDER BY n DESC
  `).all();
  res.json(rows);
});

// GET /api/customers/meta/operators — 中台运营名单（供分配）
router.get('/meta/operators', requirePermission('customer.view'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.real_name FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.code = 'mid_operator' AND u.enabled = 1 AND u.real_name IS NOT NULL
    ORDER BY u.id
  `).all();
  res.json(rows.map((r) => r.real_name));
});

// PUT /api/customers/:accountId/operator — 分配中台运营
router.put('/:accountId/operator', requirePermission('customer.service'), (req, res) => {
  const { operator_name } = req.body;
  db.prepare('UPDATE customers SET operator_name = ? WHERE account_id = ?')
    .run(operator_name || null, req.params.accountId);
  res.json({ ok: true });
});

// POST /api/customers/assign-operator — 批量分配中台运营
router.post('/assign-operator', requirePermission('customer.service'), (req, res) => {
  const { account_ids, operator_name } = req.body;
  if (!Array.isArray(account_ids) || !account_ids.length) return res.status(400).json({ error: '请选择客户' });
  const stmt = db.prepare('UPDATE customers SET operator_name = ? WHERE account_id = ?');
  const tx = db.transaction((ids) => {
    for (const id of ids) stmt.run(operator_name || null, id);
  });
  tx(account_ids);
  res.json({ ok: true, count: account_ids.length });
});

// POST /api/customers — 手动补全客户（account_id 必填）
router.post('/', requirePermission('customer.create'), (req, res) => {
  const { account_id, company_name, manager_name, supervisor_name, region, region_large, industry_l1, industry_l2, industry_l3, is_gold, shop_url, lifecycle } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id 必填' });
  const cols = [];
  const vals = {};
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') { cols.push(k); vals[k] = v; } };
  add('account_id', account_id); add('company_name', company_name); add('manager_name', manager_name);
  add('supervisor_name', supervisor_name); add('region', region); add('region_large', region_large);
  add('industry_l1', industry_l1); add('industry_l2', industry_l2); add('industry_l3', industry_l3);
  add('is_gold', is_gold); add('shop_url', shop_url); add('lifecycle', lifecycle);
  if (!cols.includes('company_name')) { cols.push('company_name'); vals.company_name = account_id; }
  try {
    const info = db.prepare(`INSERT INTO customers (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map((k) => '@' + k).join(', ')}, datetime('now','localtime'), datetime('now','localtime'))`).run(vals);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: '账号已存在或字段错误', detail: e.message });
  }
});

// PUT /api/customers/:accountId — 更新客户主数据（补全公司名等）
router.put('/:accountId', requirePermission('customer.edit'), (req, res) => {
  const { company_name, manager_name, supervisor_name, region, region_large, industry_l1, industry_l2, industry_l3, is_gold, shop_url, lifecycle } = req.body;
  const sets = [];
  const vals = { account_id: req.params.accountId };
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') { sets.push(`${k} = @${k}`); vals[k] = v; } };
  add('company_name', company_name); add('manager_name', manager_name); add('supervisor_name', supervisor_name);
  add('region', region); add('region_large', region_large);
  add('industry_l1', industry_l1); add('industry_l2', industry_l2); add('industry_l3', industry_l3);
  add('is_gold', is_gold); add('shop_url', shop_url); add('lifecycle', lifecycle);
  if (!sets.length) return res.status(400).json({ error: '无更新字段' });
  const info = db.prepare(`UPDATE customers SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE account_id = @account_id`).run(vals);
  if (!info.changes) return res.status(404).json({ error: '客户不存在' });
  res.json({ ok: true });
});

module.exports = router;
