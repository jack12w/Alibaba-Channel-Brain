'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');
const ruleEngine = require('../services/ruleEngine');
const renewalService = require('../services/renewalService');

const router = express.Router();
router.use(requireAuth);

const RULE_FIELDS = ['name', 'opportunity_type', 'description', 'conditions', 'estimated_min', 'estimated_max', 'priority', 'enabled'];

function pickRule(body) {
  const row = {};
  for (const f of RULE_FIELDS) {
    if (body[f] !== undefined) row[f] = body[f];
  }
  return row;
}

// GET /api/sell/fields — 字段池与运算符（规则编辑用）
router.get('/fields', requirePermission('sell.view'), (req, res) => {
  res.json({ fields: ruleEngine.FIELD_POOL, ops: ruleEngine.OPS, types: ruleEngine.OPPORTUNITY_TYPES });
});

// ---------- 规则管理（admin / manager）----------

// GET /api/sell/rules
router.get('/rules', requirePermission('sell.view'), (req, res) => {
  const rows = db.prepare('SELECT * FROM sell_rules ORDER BY priority, id').all();
  res.json(rows);
});

// POST /api/sell/rules
router.post('/rules', requirePermission('sell.manage'), (req, res) => {
  const row = pickRule(req.body);
  if (!row.name || !row.opportunity_type || !row.conditions) {
    return res.status(400).json({ error: 'name / opportunity_type / conditions 必填' });
  }
  // 校验 conditions JSON
  try {
    const c = JSON.parse(row.conditions);
    if (!Array.isArray(c.conditions)) throw new Error('conditions.conditions 必须是数组');
  } catch (e) {
    return res.status(400).json({ error: `conditions 不是合法 JSON：${e.message}` });
  }
  const info = db.prepare(`
    INSERT INTO sell_rules (name, opportunity_type, description, conditions, estimated_min, estimated_max, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.name, row.opportunity_type, row.description || null, row.conditions,
    row.estimated_min || null, row.estimated_max || null, row.priority || 0, row.enabled !== undefined ? row.enabled : 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/sell/rules/:id
router.put('/rules/:id', requirePermission('sell.manage'), (req, res) => {
  const row = pickRule(req.body);
  if (row.conditions) {
    try {
      const c = JSON.parse(row.conditions);
      if (!Array.isArray(c.conditions)) throw new Error('bad');
    } catch (e) {
      return res.status(400).json({ error: 'conditions 不是合法 JSON' });
    }
  }
  if (!Object.keys(row).length) return res.status(400).json({ error: '无更新字段' });
  const sets = Object.keys(row).map((k) => `${k} = @${k}`).join(', ');
  const info = db.prepare(`UPDATE sell_rules SET ${sets}, updated_at = datetime('now','localtime') WHERE id = @id`)
    .run({ ...row, id: req.params.id });
  if (!info.changes) return res.status(404).json({ error: '规则不存在' });
  res.json({ ok: true });
});

// POST /api/sell/rules/:id/toggle — 启停
router.post('/rules/:id/toggle', requirePermission('sell.manage'), (req, res) => {
  const rule = db.prepare('SELECT enabled FROM sell_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: '规则不存在' });
  db.prepare('UPDATE sell_rules SET enabled = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(rule.enabled ? 0 : 1, req.params.id);
  res.json({ ok: true, enabled: rule.enabled ? 0 : 1 });
});

// ---------- 机会 ----------

// GET /api/sell/opportunities?type=&status=&keyword=&owner_id=
router.get('/opportunities', requirePermission('sell.view'), (req, res) => {
  const { type, status, keyword, owner_id, page = 1, page_size = 20 } = req.query;
  const where = [];
  const params = {};
  if (type) { where.push('s.opportunity_type = @type'); params.type = type; }
  if (status) { where.push('s.status = @status'); params.status = status; }
  if (owner_id) { where.push('s.owner_id = @owner_id'); params.owner_id = Number(owner_id); }
  if (keyword) {
    where.push('(c.company_name LIKE @kw OR s.title LIKE @kw)');
    params.kw = `%${keyword}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM sell_opportunities s ${whereSql}`).get(params).n;
  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const items = db.prepare(`
    SELECT s.*, c.company_name, c.store_id, c.industry, c.expire_date,
           m.name AS owner_name,
           (SELECT inquiries FROM store_stats_monthly st WHERE st.customer_id = c.id ORDER BY st.month DESC LIMIT 1) AS latest_inquiries,
           (SELECT gmv FROM store_stats_monthly st WHERE st.customer_id = c.id ORDER BY st.month DESC LIMIT 1) AS latest_gmv
    FROM sell_opportunities s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN team_members m ON m.id = s.owner_id
    ${whereSql}
    ORDER BY s.status = 'won', s.estimated_max DESC, s.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  // 续约窗口标注（T3/T6）：机会与续约面板联动
  const today = renewalService.todayStr();
  for (const o of items) {
    o.window_type = null;
    o.days_left = null;
    o.alert_level = null;
    if (o.expire_date) {
      const daysLeft = renewalService.daysBetween(today, o.expire_date);
      const { windowType, alertLevel } = renewalService.classifyWindow(daysLeft);
      o.window_type = windowType;
      o.days_left = daysLeft;
      o.alert_level = alertLevel;
    }
  }

  res.json({ total, page: Number(page), page_size: limit, items });
});

// GET /api/sell/summary — 机会汇总
router.get('/summary', requirePermission('sell.view'), (req, res) => {
  const byType = db.prepare(`
    SELECT opportunity_type, COUNT(*) AS n, COALESCE(SUM(estimated_max), 0) AS amount
    FROM sell_opportunities WHERE status != 'closed' AND status != 'lost'
    GROUP BY opportunity_type
  `).all();
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM sell_opportunities GROUP BY status').all();
  const open = db.prepare("SELECT COUNT(*) AS n FROM sell_opportunities WHERE status = 'open'").get().n;
  const won = db.prepare("SELECT COUNT(*) AS n FROM sell_opportunities WHERE status = 'won'").get().n;
  const totalAmount = db.prepare(`
    SELECT COALESCE(SUM(estimated_max), 0) AS s FROM sell_opportunities
    WHERE status != 'closed' AND status != 'lost'
  `).get().s;
  res.json({ by_type: byType, by_status: byStatus, open_count: open, won_count: won, total_amount: totalAmount });
});

// PUT /api/sell/opportunities/:id — 状态/负责人更新
router.put('/opportunities/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM sell_opportunities WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: '机会不存在' });
  const upd = {};
  if (req.body.status !== undefined) {
    if (!['open', 'following', 'won', 'lost', 'closed'].includes(req.body.status)) {
      return res.status(400).json({ error: 'status 不合法' });
    }
    upd.status = req.body.status;
  }
  if (req.body.owner_id !== undefined) upd.owner_id = req.body.owner_id || null;
  if (!Object.keys(upd).length) return res.status(400).json({ error: '无更新字段' });
  const sets = Object.keys(upd).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE sell_opportunities SET ${sets}, updated_at = datetime('now','localtime') WHERE id = @id`)
    .run({ ...upd, id: req.params.id });
  res.json({ ok: true });
});

// POST /api/sell/scan — 手动触发扫描（admin / manager）
router.post('/scan', requirePermission('sell.manage'), (req, res) => {
  const r = ruleEngine.scan(db);
  res.json({ ok: true, ...r });
});

module.exports = router;
