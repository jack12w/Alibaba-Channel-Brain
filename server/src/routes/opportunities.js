'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission, scopeFilter } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const STAGES = ['initial', 'need', 'quote', 'negotiate', 'won', 'lost'];
const STAGE_LABEL = { initial: '初步接触', need: '需求挖掘', quote: '方案报价', negotiate: '商务谈判', won: '签单', lost: '已流失' };

// GET /api/opportunities — 商机列表
router.get('/', requirePermission('opportunity.view'), (req, res) => {
  const { stage, owner_id, keyword, page = 1, page_size = 20 } = req.query;
  const where = [];
  const params = {};
  if (stage) { where.push('o.stage = @stage'); params.stage = stage; }
  if (owner_id) { where.push('o.owner_id = @owner_id'); params.owner_id = Number(owner_id); }
  if (keyword) { where.push('(o.company_name LIKE @kw OR o.contact_name LIKE @kw OR o.contact_phone LIKE @kw)'); params.kw = `%${keyword}%`; }
  const scope = scopeFilter('o.', req.user);
  if (scope.sql) { where.push(scope.sql); Object.assign(params, scope.params); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM opportunities o ${whereSql}`).get(params).n;
  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const items = db.prepare(`
    SELECT o.*, m.name AS owner_name,
      (SELECT COUNT(*) FROM opportunity_activities a WHERE a.opportunity_id = o.id) AS activity_count,
      (SELECT MAX(a.next_follow_date) FROM opportunity_activities a WHERE a.opportunity_id = o.id) AS next_follow_date
    FROM opportunities o LEFT JOIN team_members m ON m.id = o.owner_id
    ${whereSql}
    ORDER BY CASE o.stage WHEN 'won' THEN 1 WHEN 'lost' THEN 2 ELSE 0 END, o.updated_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({ total, page: Number(page), page_size: limit, items });
});

// GET /api/opportunities/funnel — 销售漏斗统计（按数据范围）
router.get('/funnel', requirePermission('opportunity.view'), (req, res) => {
  const scope = scopeFilter('o.', req.user);
  const scopeSql = scope.sql ? `WHERE ${scope.sql}` : '';
  const rows = db.prepare(`
    SELECT o.stage, COUNT(*) AS n, COALESCE(SUM(o.amount), 0) AS amount
    FROM opportunities o ${scopeSql} GROUP BY o.stage
  `).all(scope.params);
  const funnel = {};
  for (const s of STAGES) {
    funnel[s] = { label: STAGE_LABEL[s], count: 0, amount: 0 };
  }
  for (const r of rows) {
    if (funnel[r.stage]) {
      funnel[r.stage].count = r.n;
      funnel[r.stage].amount = r.amount;
    }
  }
  const won = funnel.won.count;
  const active = STAGES.slice(0, 4).reduce((s, k) => s + funnel[k].count, 0);
  const conversion = active + won > 0 ? Number((won / (active + won)).toFixed(3)) : 0;
  res.json({ stages: funnel, won_count: won, active_count: active, conversion_rate: conversion });
});

// POST /api/opportunities — 新增商机
router.post('/', requirePermission('opportunity.create'), (req, res) => {
  const { lead_source, company_name, contact_name, contact_phone, contact_wechat, industry, stage, amount, owner_id, expected_date, remark } = req.body;
  if (!company_name) return res.status(400).json({ error: '公司名必填' });
  const info = db.prepare(`
    INSERT INTO opportunities (lead_source, company_name, contact_name, contact_phone, contact_wechat, industry, stage, amount, owner_id, expected_date, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(lead_source || null, company_name, contact_name || null, contact_phone || null, contact_wechat || null, industry || null,
    stage || 'initial', amount || 0, owner_id || req.user.member_id || null, expected_date || null, remark || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// GET /api/opportunities/:id — 商机详情（含跟进记录）
router.get('/:id', requirePermission('opportunity.view'), (req, res) => {
  const scope = scopeFilter('o.', req.user);
  const o = scope.sql
    ? db.prepare(`
        SELECT o.*, m.name AS owner_name FROM opportunities o
        LEFT JOIN team_members m ON m.id = o.owner_id WHERE o.id = @id AND ${scope.sql}
      `).get({ id: req.params.id, ...scope.params })
    : db.prepare(`
        SELECT o.*, m.name AS owner_name FROM opportunities o
        LEFT JOIN team_members m ON m.id = o.owner_id WHERE o.id = @id
      `).get({ id: req.params.id });
  if (!o) return res.status(404).json({ error: '商机不存在或无权查看' });
  const activities = db.prepare(`
    SELECT a.*, m.name AS member_name FROM opportunity_activities a
    LEFT JOIN team_members m ON m.id = a.member_id
    WHERE a.opportunity_id = ? ORDER BY a.activity_date DESC, a.id DESC
  `).all(o.id);
  res.json({ ...o, activities });
});

// PUT /api/opportunities/:id — 更新商机（阶段/金额/负责人等）
router.put('/:id', requirePermission('opportunity.edit'), (req, res) => {
  const o = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: '商机不存在' });

  const upd = {};
  if (req.body.stage !== undefined) {
    if (!STAGES.includes(req.body.stage)) return res.status(400).json({ error: 'stage 不合法' });
    upd.stage = req.body.stage;
    if (req.body.stage === 'won') upd.won_date = new Date().toISOString().slice(0, 10);
  }
  for (const f of ['lead_source', 'company_name', 'contact_name', 'contact_phone', 'contact_wechat', 'industry', 'amount', 'owner_id', 'expected_date', 'remark']) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  if (!Object.keys(upd).length) return res.status(400).json({ error: '无更新字段' });
  const sets = Object.keys(upd).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE opportunities SET ${sets}, updated_at = datetime('now','localtime') WHERE id = @id`)
    .run({ ...upd, id: req.params.id });
  res.json({ ok: true });
});

// POST /api/opportunities/:id/activities — 添加跟进记录
router.post('/:id/activities', requirePermission('opportunity.edit'), (req, res) => {
  const { activity_type, content, next_follow_date, member_id, activity_date } = req.body;
  if (!activity_type || !content) return res.status(400).json({ error: 'activity_type 和 content 必填' });
  const info = db.prepare(`
    INSERT INTO opportunity_activities (opportunity_id, member_id, activity_date, activity_type, content, next_follow_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id, member_id || req.user.member_id || null, activity_date || new Date().toISOString().slice(0, 10), activity_type, content, next_follow_date || null);
  db.prepare(`UPDATE opportunities SET updated_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

// POST /api/opportunities/:id/win — 签单：创建客户档案并关联
router.post('/:id/win', requirePermission('opportunity.win'), (req, res) => {
  const o = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: '商机不存在' });
  if (o.customer_id) return res.status(400).json({ error: '该商机已关联客户' });
  const { plan_type, plan_amount, sign_date, expire_date, store_id, industry } = req.body;

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO customers (company_name, company_en, store_id, industry, plan_type, plan_amount, sign_date, expire_date, status, owner_id, team_scope, source, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, '运营中台', ?, ?)
    `).run(o.company_name, null, store_id || null, industry || o.industry || null, plan_type || null,
      plan_amount || o.amount || 0, sign_date || new Date().toISOString().slice(0, 10),
      expire_date || null, o.owner_id || null, o.lead_source || '新签', o.remark || null);
    const customerId = info.lastInsertRowid;
    db.prepare(`UPDATE opportunities SET stage = 'won', won_date = ?, customer_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(new Date().toISOString().slice(0, 10), customerId, o.id);
    return customerId;
  });
  const customerId = tx();
  res.status(201).json({ ok: true, customer_id: customerId });
});

module.exports = router;
module.exports.STAGES = STAGES;
module.exports.STAGE_LABEL = STAGE_LABEL;
