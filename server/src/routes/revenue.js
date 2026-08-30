'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/revenue/overview — 营收汇总（付款金额为主，签约金额做参考）
router.get('/overview', requirePermission('goal.view'), (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const sum = db.prepare(`
    SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(sign_amount), 0) AS sign_amount,
      COALESCE(SUM(pay_amount), 0) AS pay_amount,
      SUM(CASE WHEN pay_status = 'payment_success' THEN 1 ELSE 0 END) AS paid_orders,
      SUM(CASE WHEN pay_status = 'payment_part' THEN 1 ELSE 0 END) AS part_orders,
      SUM(CASE WHEN pay_status = 'payment_none' OR pay_status IS NULL OR pay_status = '' THEN 1 ELSE 0 END) AS unpaid_orders
    FROM awb_orders
  `).get();
  const monthSum = db.prepare(`
    SELECT COALESCE(SUM(pay_amount), 0) AS pay, COALESCE(SUM(sign_amount), 0) AS sign, COUNT(*) AS orders
    FROM awb_orders WHERE substr(COALESCE(pay_date, create_date), 1, 7) = ?
  `).get(month);
  const byCategory = db.prepare(`
    SELECT product_category, COUNT(*) AS orders, COALESCE(SUM(pay_amount), 0) AS pay_amount, COALESCE(SUM(sign_amount), 0) AS sign_amount
    FROM awb_orders GROUP BY product_category ORDER BY pay_amount DESC
  `).all();
  res.json({
    total: { ...sum, receivable_gap: sum.sign_amount - sum.pay_amount },
    this_month: monthSum,
    by_category: byCategory,
  });
});

// GET /api/revenue/awb — AWB 订单明细
router.get('/awb', requirePermission('goal.view'), (req, res) => {
  const { pay_status, page = 1, page_size = 20 } = req.query;
  const where = [];
  const params = {};
  if (pay_status) { where.push('pay_status = @pay_status'); params.pay_status = pay_status; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM awb_orders ${whereSql}`).get(params).n;
  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = db.prepare(`
    SELECT * FROM awb_orders ${whereSql} ORDER BY create_date DESC, item_num DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });
  res.json({ total, page: Number(page), page_size: limit, items: rows });
});

module.exports = router;
