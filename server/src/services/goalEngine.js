'use strict';

/**
 * 业绩目标达成计算引擎
 * 自动计算有数据源的指标；无数据源的返回 manual（等待手动录入/插件扩展采集）。
 *
 * 周期格式：'2026'（年度）/ '2026-Q2'（季度）
 * 返回：{ value, source: auto|manual|none, detail }
 */

function parsePeriod(period) {
  if (/^\d{4}$/.test(period)) {
    return { start: `${period}-01-01`, end: `${Number(period) + 1}-01-01` };
  }
  const m = period.match(/^(\d{4})-Q([1-4])$/);
  if (m) {
    const q = Number(m[2]);
    return { start: `${m[1]}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`, end: `${m[1]}-${String(q * 3 + 1).padStart(2, '0')}-01` };
  }
  return null;
}

function periodMonths(period) {
  const r = parsePeriod(period);
  if (!r) return [];
  const months = [];
  let d = new Date(r.start);
  while (new Date(r.end) > d) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 注：生意参谋 GMV 为美金口径（国际站美元结算），无需汇率换算。
// 若未来需要人民币口径目标，可在此引入配置化换算。

/** 自动实际值计算（按 metric 键） */
function autoActual(db, metric, period) {
  switch (metric) {
    case 'revenue_new': {
      const r = parsePeriod(period);
      if (!r) return null;
      const row = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS v FROM opportunities
        WHERE stage = 'won' AND updated_at >= @s AND updated_at < @e
      `).get({ s: r.start, e: r.end });
      return { value: row.v, detail: '已签单商机合同金额合计' };
    }
    case 'new_orders': {
      const r = parsePeriod(period);
      if (!r) return null;
      const row = db.prepare(`
        SELECT COUNT(*) AS v FROM opportunities
        WHERE stage = 'won' AND updated_at >= @s AND updated_at < @e
      `).get({ s: r.start, e: r.end });
      return { value: row.v, detail: '已签单商机数量' };
    }
    case 'revenue_renewal': {
      const r = parsePeriod(period);
      if (!r) return null;
      const row = db.prepare(`
        SELECT COALESCE(SUM(c.plan_amount), 0) AS v
        FROM renewal_snapshots s JOIN customers c ON c.id = s.customer_id
        WHERE s.status = 'done' AND s.snapshot_date >= @s AND s.snapshot_date < @e
      `).get({ s: r.start, e: r.end });
      return { value: row.v, detail: '周期内续约成功客户年费合计' };
    }
    case 'revenue_ad': {
      const months = periodMonths(period);
      if (!months.length) return null;
      const ph = months.map(() => '?').join(',');
      const row = db.prepare(`SELECT COALESCE(SUM(spend), 0) AS v FROM ad_stats_monthly WHERE month IN (${ph})`).all(...months);
      return { value: row.length ? row[0].v : 0, detail: '周期内广告消耗合计（口径可调）' };
    }
    case 'revenue_total': {
      // 各来源之和（revenue_awb 为手动值或自动值）
      let total = 0;
      for (const m of ['revenue_new', 'revenue_renewal', 'revenue_ad']) {
        const a = autoActual(db, m, period);
        if (a) total += a.value;
      }
      const awbManual = getManual(db, 'revenue_awb', period);
      if (awbManual !== null) total += awbManual;
      else {
        const a = autoActual(db, 'revenue_awb', period);
        if (a && a.value !== null) total += a.value;
      }
      return { value: Math.round(total), detail: '新签+老客户+广告+AWB' };
    }
    case 'revenue_awb': {
      // AWB 贡献 = 周期内付款成功客户数 × 单价（单价配置 awb_unit_price）
      const r = parsePeriod(period);
      if (!r) return null;
      const cnt = db.prepare('SELECT COUNT(*) AS v FROM awb_payments WHERE pay_date >= @s AND pay_date < @e').get({ s: r.start, e: r.end }).v;
      const priceRow = db.prepare("SELECT value FROM app_settings WHERE key = 'awb_unit_price'").get();
      const price = priceRow ? Number(priceRow.value) : 0;
      if (price > 0) return { value: cnt * price, detail: `付款客户 ${cnt} 家 × 单价 ¥${price}` };
      return { value: null, detail: `付款客户 ${cnt} 家（单价未配置，营收待确认）` };
    }
    case 'ad_p2w_customers': {
      // 新签打包 2 万 P 客户数 + 使用监控（打包额度 p_package_amount）
      const rows = db.prepare(`
        SELECT c.id, c.company_name, c.p_package_amount,
          (SELECT COALESCE(SUM(a.spend), 0) FROM ad_stats_monthly a
           WHERE a.customer_id = c.id AND (a.ad_type LIKE '%P4P%' OR a.ad_type LIKE '%p4p%')) AS used
        FROM customers c WHERE c.p_package_amount > 0
      `).all();
      const total = rows.length;
      const used = rows.filter((r) => r.used > 0).length;
      const full = rows.filter((r) => r.used >= r.p_package_amount).length;
      return { value: total, detail: `打包 ${total} 家：已使用 ${used} 家 / 用满 ${full} 家` };
    }
    case 'nursery_30_product': {
      // 签约满30天客户中产品数 ≥ 200 占比（product_stats）
      const cutoff = daysAgoStr(30);
      const total = db.prepare('SELECT COUNT(*) AS v FROM customers WHERE sign_date IS NOT NULL AND sign_date <= ?').get(cutoff).v;
      const hit = db.prepare(`
        SELECT COUNT(*) AS v FROM customers c
        WHERE c.sign_date IS NOT NULL AND c.sign_date <= ?
          AND (SELECT product_count FROM product_stats ps WHERE ps.customer_id = c.id ORDER BY ps.month DESC LIMIT 1) >= 200
      `).get(cutoff).v;
      return { value: total ? Number((hit / total * 100).toFixed(1)) : 0, detail: `签约满30天客户 ${total} 家中产品数≥200 的 ${hit} 家` };
    }
    case 'nursery_120_top': {
      // 签约满120天客户中优爆品数 ≥ 20（金品 50）占比（product_stats）
      const cutoff = daysAgoStr(120);
      const total = db.prepare('SELECT COUNT(*) AS v FROM customers WHERE sign_date IS NOT NULL AND sign_date <= ?').get(cutoff).v;
      const hit = db.prepare(`
        SELECT COUNT(*) AS v FROM customers c
        WHERE c.sign_date IS NOT NULL AND c.sign_date <= ?
          AND (SELECT top_product_count FROM product_stats ps WHERE ps.customer_id = c.id ORDER BY ps.month DESC LIMIT 1)
              >= CASE WHEN c.plan_type LIKE '%金品%' THEN 50 ELSE 20 END
      `).get(cutoff).v;
      return { value: total ? Number((hit / total * 100).toFixed(1)) : 0, detail: `签约满120天客户 ${total} 家中优爆品数达标 ${hit} 家（金品≥50/其他≥20）` };
    }
    case 'nursery_60_p3000': {
      const cutoff = daysAgoStr(60);
      const total = db.prepare('SELECT COUNT(*) AS v FROM customers WHERE sign_date IS NOT NULL AND sign_date <= ?').get(cutoff).v;
      const hit = db.prepare(`
        SELECT COUNT(*) AS v FROM (
          SELECT a.customer_id FROM ad_stats_monthly a
          JOIN customers c ON c.id = a.customer_id AND c.sign_date IS NOT NULL AND c.sign_date <= ?
          WHERE a.ad_type LIKE '%P4P%' OR a.ad_type LIKE '%p4p%'
          GROUP BY a.customer_id HAVING SUM(a.spend) >= 3000
        )
      `).get(cutoff).v;
      return { value: total ? Number((hit / total * 100).toFixed(1)) : 0, detail: `签约满60天客户 ${total} 家中 P4P 累计消耗≥3000 的 ${hit} 家` };
    }
    case 'nursery_90_orders': {
      const cutoff = daysAgoStr(90);
      const total = db.prepare('SELECT COUNT(*) AS v FROM customers WHERE sign_date IS NOT NULL AND sign_date <= ?').get(cutoff).v;
      const hit = db.prepare(`
        SELECT COUNT(*) AS v FROM (
          SELECT customer_id FROM store_stats_monthly GROUP BY customer_id HAVING SUM(orders) >= 3
        ) s JOIN customers c ON c.id = s.customer_id AND c.sign_date IS NOT NULL AND c.sign_date <= ?
      `).get(cutoff).v;
      return { value: total ? Number((hit / total * 100).toFixed(1)) : 0, detail: `签约满90天客户 ${total} 家中累计订单≥3 的 ${hit} 家` };
    }
    case 'nursery_180_gmv': {
      // 生意参谋 GMV 为美金口径（国际站美元结算），无需汇率换算，直接与 5000 美金目标比较
      const cutoff = daysAgoStr(180);
      const total = db.prepare('SELECT COUNT(*) AS v FROM customers WHERE sign_date IS NOT NULL AND sign_date <= ?').get(cutoff).v;
      const hit = db.prepare(`
        SELECT COUNT(*) AS v FROM (
          SELECT customer_id FROM store_stats_monthly GROUP BY customer_id HAVING SUM(gmv) >= 5000
        ) s JOIN customers c ON c.id = s.customer_id AND c.sign_date IS NOT NULL AND c.sign_date <= ?
      `).get(cutoff).v;
      return { value: total ? Number((hit / total * 100).toFixed(1)) : 0, detail: `签约满180天客户 ${total} 家中累计 GMV≥5000美金(生意参谋口径) 的 ${hit} 家` };
    }
    case 'renew_rate': {
      const row = db.prepare(`
        SELECT
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost
        FROM renewal_snapshots WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM renewal_snapshots)
      `).get();
      const total = (row.done || 0) + (row.lost || 0);
      return { value: total ? Number(((row.done || 0) / total * 100).toFixed(1)) : 0, detail: `到期客户 ${total} 家：续约 ${row.done || 0} / 流失 ${row.lost || 0}` };
    }
    default:
      return null; // 无数据源 → manual
  }
}

function getManual(db, metric, period) {
  const row = db.prepare(`
    SELECT m.actual_value FROM manual_actuals m
    JOIN goal_targets g ON g.id = m.goal_id
    WHERE g.metric = ? AND m.period = ?
  `).get(metric, period);
  return row ? row.actual_value : null;
}

/**
 * 查询达成：目标 + 实际 + 进度
 * GET /api/goals?category=&period=
 */
function queryGoals(db, { category, period }) {
  let sql = 'SELECT * FROM goal_targets WHERE enabled = 1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (period) { sql += ' AND (period = ? OR period IS NULL OR period = \'\')'; params.push(period); }
  sql += ' ORDER BY category, id';
  const goals = db.prepare(sql).all(...params);

  const manualOnly = new Set(['market_products', 'market_p_spend', 'market_gmv_90', 'market_structured_detail', 'market_ai_kb', 'market_hot_items', 'ad_products_attention', 'renew_rate_first', 'renew_rate_multi']);

  return goals.map((g) => {
    let actual = null, source = 'none', detail = '';
    // 手动值优先
    const mv = getManual(db, g.metric, period || '');
    if (mv !== null) {
      actual = mv; source = 'manual'; detail = '手动录入';
    } else if (!manualOnly.has(g.metric)) {
      const a = autoActual(db, g.metric, period || '');
      if (a) { actual = a.value; source = 'auto'; detail = a.detail; }
    }
    const progress = (g.target_value && actual !== null) ? Number((actual / g.target_value * 100).toFixed(1)) : null;
    return { ...g, actual, source, detail, progress };
  });
}

module.exports = { queryGoals, autoActual, parsePeriod, periodMonths };
