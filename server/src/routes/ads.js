'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/ads/overview — P4P 消耗 + 广告产品营收 + 活跃/流失标记
router.get('/overview', requirePermission('goal.view'), (req, res) => {
  const latest = '(SELECT MAX(stat_date) FROM snap_ad)';
  const sum = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(p4p_monthly_spend), 0) AS monthly_spend,
      COALESCE(SUM(p4p_quarter_spend), 0) AS quarter_spend,
      COALESCE(SUM(p4p_year_spend), 0) AS year_spend,
      COALESCE(SUM(cash_balance), 0) AS cash_balance,
      COALESCE(SUM(rev_brand_month), 0) AS rev_brand,
      COALESCE(SUM(rev_top_month), 0) AS rev_top,
      COALESCE(SUM(rev_ask_month), 0) AS rev_ask,
      COALESCE(SUM(rev_review_month), 0) AS rev_review,
      COALESCE(SUM(rev_star_month), 0) AS rev_star,
      SUM(CASE WHEN is_open_p = '1' THEN 1 ELSE 0 END) AS open_p,
      SUM(CASE WHEN active_30d = 1 THEN 1 ELSE 0 END) AS active_30d,
      SUM(CASE WHEN dormant_7d_balance = 1 OR churned_30d = 1 OR lost_7d = 1 THEN 1 ELSE 0 END) AS lost_dormant,
      SUM(CASE WHEN p4p_monthly_spend IS NOT NULL AND p4p_monthly_spend > 0 THEN 1 ELSE 0 END) AS spending
    FROM snap_ad WHERE stat_date = ${latest}
  `).get();
  const overview = {
    ...sum,
    open_p_rate: sum.total ? Number((sum.open_p / sum.total * 100).toFixed(1)) : 0,
    ad_revenue_total: sum.rev_brand + sum.rev_top + sum.rev_ask + sum.rev_review + sum.rev_star,
  };
  res.json(overview);
});

// GET /api/ads/p2w — 开P率 + 未开P客户清单
router.get('/p2w', requirePermission('goal.view'), (req, res) => {
  const latest = '(SELECT MAX(stat_date) FROM snap_ad)';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM snap_ad WHERE stat_date = ${latest}`).get().n;
  const openP = db.prepare(`SELECT COUNT(*) AS n FROM snap_ad WHERE stat_date = ${latest} AND is_open_p = '1'`).get().n;
  const notOpen = db.prepare(`
    SELECT a.account_id, a.company_name, a.manager_name, a.p4p_monthly_spend, a.cash_balance
    FROM snap_ad a WHERE a.stat_date = ${latest} AND (a.is_open_p IS NULL OR a.is_open_p != '1')
    ORDER BY a.p4p_monthly_spend DESC
  `).all();
  res.json({
    total, open_p: openP, not_open: total - openP,
    open_p_rate: total ? Number((openP / total * 100).toFixed(1)) : 0,
    not_open_list: notOpen,
  });
});

module.exports = router;
