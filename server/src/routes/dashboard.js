'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function todayStr() { return new Date().toISOString().slice(0, 10); }

function renewWindow(contractEnd) {
  if (!contractEnd) return null;
  const days = Math.floor((new Date(contractEnd) - new Date(todayStr())) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 90) return 'T3';
  if (days <= 180) return 'T6';
  return null;
}

// GET /api/dashboard/overview — 真实数据概览
router.get('/overview', requirePermission('dashboard.view'), (req, res) => {
  const customers = db.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
  const storeRows = db.prepare(`
    SELECT account_id, contract_end FROM snap_store WHERE stat_date = (SELECT MAX(stat_date) FROM snap_store)
  `).all();
  let t3 = 0, t6 = 0, expired = 0;
  for (const r of storeRows) {
    const w = renewWindow(r.contract_end);
    if (w === 'T3') t3++;
    else if (w === 'T6') t6++;
    else if (w === 'expired') expired++;
  }

  const adTotal = db.prepare('SELECT COUNT(*) AS n FROM snap_ad WHERE stat_date = (SELECT MAX(stat_date) FROM snap_ad)').get().n;
  const openP = db.prepare("SELECT COUNT(*) AS n FROM snap_ad WHERE stat_date = (SELECT MAX(stat_date) FROM snap_ad) AND is_open_p = '1'").get().n;

  const awb = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(pay_amount), 0) AS s FROM awb_orders').get();

  const milestoneRows = db.prepare(`
    SELECT p180_gmv_status FROM snap_milestone WHERE stat_date = (SELECT MAX(stat_date) FROM snap_milestone)
  `).all();
  const msEligible = milestoneRows.filter((r) => ['达标', '不达标'].includes(r.p180_gmv_status)).length;
  const msHit = milestoneRows.filter((r) => r.p180_gmv_status === '达标').length;

  const managers = db.prepare(`
    SELECT manager_name, COUNT(*) AS n FROM customers
    WHERE manager_name IS NOT NULL AND manager_name != ''
    GROUP BY manager_name ORDER BY n DESC LIMIT 10
  `).all();

  res.json({
    counts: {
      customers,
      t3, t6, expired,
      open_p: openP,
      open_p_rate: adTotal ? Number((openP / adTotal * 100).toFixed(1)) : 0,
      awb_orders: awb.n,
      awb_pay_amount: awb.s,
      milestone_180_rate: msEligible ? Number((msHit / msEligible * 100).toFixed(1)) : 0,
    },
    managers,
  });
});

// GET /api/dashboard/team-members — 团队成员列表（下拉等用途）
router.get('/team-members', requirePermission('dashboard.view'), (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, role, team, status FROM team_members WHERE status != 'left' ORDER BY team, id
  `).all();
  res.json(rows);
});

module.exports = router;
