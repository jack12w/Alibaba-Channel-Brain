'use strict';

/**
 * 售卖机会规则引擎（v2：基于真实快照 snap_store / snap_ad）
 *
 * 画像字段来自 customers 主档 + snap_store 最新快照 + snap_ad 最新快照。
 * 默认 6 条规则见 seedRules()。
 */

const OPPORTUNITY_TYPES = {
  renew_add: '续约加购',
  ad_product: '广告产品售卖',
  nursery_boost: '育商提升',
  recharge: '充值续费',
  activate: '激活唤醒',
  gold_open: '金品开通',
};

const FIELD_POOL = [
  { field: 'renew_window', label: '续约窗口(T3/T6)', type: 'text' },
  { field: 'renew_early_status', label: '官方续约状态', type: 'text' },
  { field: 'is_gold', label: '是否金品(Y/N)', type: 'text' },
  { field: 'is_gold_unopened', label: '金品未开通', type: 'text' },
  { field: 'p4p_status', label: 'P4P推广状态', type: 'text' },
  { field: 'p4p_level', label: 'P4P层级', type: 'text' },
  { field: 'p4p_monthly_spend', label: 'P4P月消耗', type: 'number' },
  { field: 'p4p_cash_balance', label: 'P4P现金余额', type: 'number' },
  { field: 'product_count', label: '商品数', type: 'number' },
  { field: 'strength_products', label: '实力优品', type: 'number' },
  { field: 'super_products', label: '超级优品', type: 'number' },
  { field: 'top_products', label: '优爆品数', type: 'number' },
  { field: 'star_rated', label: '评定星级', type: 'number' },
  { field: 'rev_brand_month', label: '当月品牌营收', type: 'number' },
  { field: 'rev_top_month', label: '当月顶展营收', type: 'number' },
  { field: 'rev_ask_month', label: '当月问鼎营收', type: 'number' },
  { field: 'is_open_p', label: '是否开P', type: 'bool' },
  { field: 'active_30d', label: '近30天活跃', type: 'bool' },
  { field: 'cash_spend_30d', label: '近30天现金消耗', type: 'number' },
  { field: 'low_balance_7d', label: '低余额', type: 'bool' },
  { field: 'spend_decline_30d', label: '消耗显著下降', type: 'bool' },
  { field: 'dormant_7d_balance', label: '有余额7日休眠', type: 'bool' },
  { field: 'churned_30d', label: '完全流失', type: 'bool' },
  { field: 'lost_7d', label: '近7日流失', type: 'bool' },
];

const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_true', 'is_false', 'contains'];

// ---------- 画像组装 ----------

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000);
}

/** 组装单个客户画像（真实快照） */
function buildContext(db, customer) {
  const accountId = customer.account_id;
  const store = accountId ? db.prepare('SELECT * FROM snap_store WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId) : null;
  const ad = accountId ? db.prepare('SELECT * FROM snap_ad WHERE account_id = ? ORDER BY stat_date DESC LIMIT 1').get(accountId) : null;

  let renew_window = null;
  if (customer.expire_date) {
    const days = daysBetween(todayStr(), customer.expire_date);
    if (days >= 0 && days <= 90) renew_window = 'T3';
    else if (days > 90 && days <= 180) renew_window = 'T6';
  }

  return {
    customer_id: customer.id,
    renew_window,
    renew_early_status: store ? store.renew_early_status : null,
    is_gold: customer.is_gold,
    is_gold_unopened: store ? store.is_gold_unopened : null,
    p4p_status: store ? store.p4p_status : null,
    p4p_level: store ? store.p4p_level : null,
    p4p_monthly_spend: store ? store.p4p_monthly_spend : null,
    p4p_cash_balance: store ? store.p4p_cash_balance : null,
    product_count: store ? store.product_count : null,
    strength_products: store ? store.strength_products : null,
    super_products: store ? store.super_products : null,
    top_products: store ? ((store.strength_products || 0) + (store.super_products || 0)) : null,
    star_rated: store ? store.star_rated : null,
    rev_brand_month: ad ? ad.rev_brand_month : null,
    rev_top_month: ad ? ad.rev_top_month : null,
    rev_ask_month: ad ? ad.rev_ask_month : null,
    is_open_p: ad ? ad.is_open_p === '1' : null,
    active_30d: ad ? ad.active_30d === 1 : null,
    cash_spend_30d: ad ? ad.cash_spend_30d : null,
    low_balance_7d: ad ? ad.low_balance_7d === 1 : null,
    spend_decline_30d: ad ? ad.spend_decline_30d === 1 : null,
    dormant_7d_balance: ad ? ad.dormant_7d_balance === 1 : null,
    churned_30d: ad ? ad.churned_30d === 1 : null,
    lost_7d: ad ? ad.lost_7d === 1 : null,
  };
}

// ---------- 条件评估 ----------

function evalCondition(ctx, cond) {
  const v = ctx[cond.field];
  const target = cond.value;
  switch (cond.op) {
    case 'eq': return v === target || String(v) === String(target);
    case 'neq': return v !== null && v !== undefined && String(v) !== String(target);
    case 'gt': return v !== null && v !== undefined && Number(v) > Number(target);
    case 'gte': return v !== null && v !== undefined && Number(v) >= Number(target);
    case 'lt': return v !== null && v !== undefined && Number(v) < Number(target);
    case 'lte': return v !== null && v !== undefined && Number(v) <= Number(target);
    case 'is_true': return v === true;
    case 'is_false': return v === false || v === null;
    case 'contains': return v !== null && v !== undefined && String(v).includes(String(target));
    default: return false;
  }
}

function evaluateRule(rule, ctx) {
  let conds;
  try {
    conds = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
  } catch (e) {
    return false;
  }
  const list = (conds && Array.isArray(conds.conditions)) ? conds.conditions : [];
  if (!list.length) return true;
  const results = list.map((c) => evalCondition(ctx, c));
  return conds.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

// ---------- 默认规则（真实字段） ----------

function seedRules(db) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM sell_rules').get().n;
  if (existing > 0) return existing; // 已配置则不动

  const ins = db.prepare(`
    INSERT INTO sell_rules (name, opportunity_type, description, conditions, estimated_min, estimated_max, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const rules = [
    {
      name: '续约加购', type: 'renew_add',
      desc: '处于续约窗口且 P4P 有余额，建议续约同时加购广告产品。',
      conds: { logic: 'AND', conditions: [{ field: 'renew_early_status', op: 'contains', value: '个月' }, { field: 'p4p_cash_balance', op: 'gt', value: 0 }] },
      min: 36800, max: 80000, priority: 1,
    },
    {
      name: '广告产品售卖（品牌/顶展/问鼎）', type: 'ad_product',
      desc: 'P4P 有持续消耗但未购买品牌/顶展/问鼎广告，建议加购抢占类目首屏。',
      conds: { logic: 'AND', conditions: [{ field: 'p4p_monthly_spend', op: 'gte', value: 2000 }, { field: 'rev_brand_month', op: 'lte', value: 0 }, { field: 'rev_top_month', op: 'lte', value: 0 }, { field: 'rev_ask_month', op: 'lte', value: 0 }] },
      min: 20000, max: 50000, priority: 2,
    },
    {
      name: '育商提升（优爆品）', type: 'nursery_boost',
      desc: '金品客户但优爆品数不足 20，建议运营育商提升优爆品。',
      conds: { logic: 'AND', conditions: [{ field: 'is_gold', op: 'eq', value: 'Y' }, { field: 'top_products', op: 'lt', value: 20 }] },
      min: 3000, max: 10000, priority: 3,
    },
    {
      name: '充值续费', type: 'recharge',
      desc: 'P4P 现金欠费，建议及时充值避免推广中断。',
      conds: { logic: 'AND', conditions: [{ field: 'p4p_status', op: 'contains', value: '欠费' }] },
      min: 5000, max: 20000, priority: 4,
    },
    {
      name: '激活唤醒（休眠/下降）', type: 'activate',
      desc: '有余额但 7 日休眠，或消耗显著下降，建议运营介入激活。',
      conds: { logic: 'OR', conditions: [{ field: 'dormant_7d_balance', op: 'is_true' }, { field: 'spend_decline_30d', op: 'is_true' }] },
      min: 3000, max: 10000, priority: 5,
    },
    {
      name: '金品开通', type: 'gold_open',
      desc: '已购买金品但未开通，建议协助开通。',
      conds: { logic: 'AND', conditions: [{ field: 'is_gold_unopened', op: 'eq', value: 'Y' }] },
      min: 0, max: 0, priority: 6,
    },
  ];
  for (const r of rules) {
    ins.run(r.name, r.type, r.desc, JSON.stringify(r.conds), r.min, r.max, r.priority);
  }
  return rules.length;
}

// ---------- 扫描主流程 ----------

function scan(db) {
  const rules = db.prepare('SELECT * FROM sell_rules WHERE enabled = 1 ORDER BY priority, id').all();
  const allRules = db.prepare('SELECT * FROM sell_rules').all();
  const customers = db.prepare("SELECT * FROM customers WHERE status != 'churned'").all();

  const upsert = db.prepare(`
    INSERT INTO sell_opportunities
      (rule_id, customer_id, opportunity_type, title, summary, estimated_min, estimated_max, status, created_at, updated_at)
    VALUES (@rule_id, @customer_id, @opportunity_type, @title, @summary, @min, @max, 'open', datetime('now','localtime'), datetime('now','localtime'))
    ON CONFLICT(rule_id, customer_id) DO UPDATE SET
      opportunity_type = excluded.opportunity_type,
      title = excluded.title,
      summary = excluded.summary,
      estimated_min = excluded.estimated_min,
      estimated_max = excluded.estimated_max,
      status = CASE WHEN sell_opportunities.status IN ('won', 'lost') THEN sell_opportunities.status ELSE 'open' END,
      updated_at = excluded.updated_at
  `);
  const closeStmt = db.prepare(`
    UPDATE sell_opportunities SET status = 'closed', updated_at = datetime('now','localtime') WHERE id = ?
  `);
  const openOpps = db.prepare(`
    SELECT id, customer_id FROM sell_opportunities WHERE rule_id = ? AND status IN ('open', 'following')
  `);

  let hits = 0, created = 0, updated = 0, closed = 0;
  for (const rule of allRules) {
    const typeName = OPPORTUNITY_TYPES[rule.opportunity_type] || rule.opportunity_type;
    if (rule.enabled !== 1) {
      for (const o of openOpps.all(rule.id)) { closeStmt.run(o.id); closed++; }
      continue;
    }
    const hitIds = new Set();
    for (const c of customers) {
      const ctx = buildContext(db, c);
      if (!evaluateRule(rule, ctx)) continue;
      hitIds.add(c.id);
      hits++;
      const info = upsert.run({
        rule_id: rule.id,
        customer_id: c.id,
        opportunity_type: rule.opportunity_type,
        title: `${typeName} · ${c.company_name}`,
        summary: rule.description || '',
        min: rule.estimated_min,
        max: rule.estimated_max,
      });
      if (info.changes === 1) created++;
      else updated++;
    }
    for (const o of openOpps.all(rule.id)) {
      if (!hitIds.has(o.customer_id)) { closeStmt.run(o.id); closed++; }
    }
  }
  return { rules: rules.length, customers: customers.length, hits, created, updated, closed };
}

module.exports = { scan, buildContext, evaluateRule, evalCondition, FIELD_POOL, OPS, OPPORTUNITY_TYPES, seedRules };
