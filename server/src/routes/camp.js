'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/camp/overview — 育商大盘（成交营经营指标）
router.get('/overview', requirePermission('goal.view'), (req, res) => {
  const latest = '(SELECT MAX(stat_date) FROM snap_camp)';
  const sum = db.prepare(`
    SELECT
      COUNT(*) AS customers,
      COALESCE(SUM(product_count), 0) AS products,
      COALESCE(SUM(top_count), 0) AS top_products,
      COALESCE(SUM(hot_bid_count), 0) AS hot_bid,
      COALESCE(SUM(hot_potential_count), 0) AS hot_potential,
      COALESCE(SUM(biz_bid_count), 0) AS biz_bid,
      COALESCE(SUM(ai_kb_count), 0) AS ai_kb,
      COALESCE(SUM(structured_detail_count), 0) AS structured_detail,
      COALESCE(SUM(buy_gmv_30d), 0) AS buy_gmv_30d,
      COALESCE(SUM(settled_gmv_30d), 0) AS settled_gmv_30d,
      COALESCE(SUM(revenue_zhonggong), 0) AS revenue_zhonggong,
      COALESCE(SUM(revenue_okki), 0) AS revenue_okki,
      COALESCE(SUM(revenue_pinguang), 0) AS revenue_pinguang,
      COALESCE(SUM(revenue_effect_ad), 0) AS revenue_effect_ad,
      COALESCE(AVG(p4p_spend_30d), 0) AS avg_p4p_30d
    FROM snap_camp WHERE stat_date = ${latest}
  `).get();
  const list = db.prepare(`
    SELECT account_id, company_name, is_gold, star_predicted, product_count, top_count,
      ai_kb_count, structured_detail_count, hot_bid_count, buy_gmv_30d, settled_gmv_30d,
      revenue_zhonggong, revenue_pinguang, revenue_effect_ad, sales_name
    FROM snap_camp WHERE stat_date = ${latest} ORDER BY settled_gmv_30d DESC
  `).all();
  res.json({ overview: sum, list });
});

module.exports = router;
