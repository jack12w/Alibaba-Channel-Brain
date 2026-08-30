'use strict';

/**
 * 插件数据解析服务
 * 插件上传结构：{ store_id, source, report, date, tables: [{ title, columns, rows }] }
 * rows 为二维数组（AoA），columns 为列名数组。
 * 解析规则用"列名包含匹配"，容忍列名变化（如"曝光量/总曝光"均匹配"曝光"）。
 */

// ---------- 工具 ----------

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/,/g, '').replace(/，/g, '').replace(/%/g, '');
  if (s === '-' || s === '--' || s === 'N/A' || s === '') return null;
  let mult = 1;
  if (s.endsWith('亿')) { mult = 1e8; s = s.slice(0, -1); }
  else if (s.endsWith('万')) { mult = 1e4; s = s.slice(0, -1); }
  else if (s.endsWith('k') || s.endsWith('K')) { mult = 1e3; s = s.slice(0, -1); }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n * mult;
}

function rowToObj(columns, row) {
  const obj = {};
  (columns || []).forEach((c, i) => { obj[String(c || '').trim()] = row[i]; });
  return obj;
}

/** 按列名包含匹配取值：findCol(rowObj, ['曝光', '展现']) */
function findCol(row, names) {
  for (const n of names) {
    const hit = Object.entries(row).find(([k]) => k.includes(n));
    if (hit && hit[1] !== undefined && hit[1] !== null) return hit[1];
  }
  return null;
}

/** 取数值列：findNum(row, ['曝光', '展现']) */
function findNum(row, names) {
  return toNum(findCol(row, names));
}

// ---------- 各报告解析 ----------

/**
 * 客户数据 → store_stats_monthly
 * 期望列：曝光/点击/询盘/TM/订单/GMV/广告消耗/ROI
 */
function parseCustomerData(db, tables, customerId, month, log) {
  let saved = 0;
  const stmt = db.prepare(`
    INSERT INTO store_stats_monthly (customer_id, month, exposure, clicks, click_rate, inquiries, tm_contacts, orders, gmv, ad_spend, ad_roi, data_source, synced_at)
    VALUES (@customer_id, @month, @exposure, @clicks, @ctr, @inquiries, @tm_contacts, @orders, @gmv, @ad_spend, @ad_roi, 'plugin', datetime('now','localtime'))
    ON CONFLICT(customer_id, month) DO UPDATE SET
      exposure=excluded.exposure, clicks=excluded.clicks, click_rate=excluded.click_rate,
      inquiries=excluded.inquiries, tm_contacts=excluded.tm_contacts, orders=excluded.orders,
      gmv=excluded.gmv, ad_spend=excluded.ad_spend, ad_roi=excluded.ad_roi, data_source=excluded.data_source, synced_at=excluded.synced_at
  `);
  for (const t of tables) {
    const rows = t.rows || [];
    const first = rows[0];
    if (!first) continue;
    const row = rowToObj(t.columns, first);
    const exposure = findNum(row, ['曝光']);
    const clicks = findNum(row, ['点击']);
    const inquiries = findNum(row, ['询盘']);
    const tm = findNum(row, ['TM', '旺旺', '咨询']);
    const orders = findNum(row, ['订单', '成交订单']);
    const gmv = findNum(row, ['GMV', '成交额', '成交金额']);
    const adSpend = findNum(row, ['广告消耗', '消耗', '推广花费']);
    const adRoi = findNum(row, ['ROI', '投产比', '回报率']);
    if (exposure === null && clicks === null && inquiries === null && gmv === null) {
      log(`⚠️ ${t.title || '客户表格'} 无匹配列，跳过（列：${(t.columns || []).join(' / ')}）`);
      continue;
    }
    const ctr = exposure && clicks ? Number((clicks / exposure).toFixed(4)) : null;
    stmt.run({ customer_id: customerId, month, exposure, clicks, ctr, inquiries, tm_contacts: tm, orders, gmv, ad_spend: adSpend, ad_roi: adRoi });
    saved++;
  }
  return saved;
}

/**
 * P4P 与品牌广告 → ad_stats_monthly
 * 表格行含广告类型列（标准推广/全站推/品牌广告），或单表默认类型
 */
function parseAds(db, tables, customerId, month, log) {
  let saved = 0;
  const stmt = db.prepare(`
    INSERT INTO ad_stats_monthly (customer_id, month, ad_type, spend, impressions, clicks, ctr, cost_per_click, conversions)
    VALUES (@customer_id, @month, @ad_type, @spend, @impressions, @clicks, @ctr, @cpc, @conversions)
    ON CONFLICT(customer_id, month, ad_type) DO UPDATE SET
      spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks,
      ctr=excluded.ctr, cost_per_click=excluded.cost_per_click, conversions=excluded.conversions
  `);

  function mapAdType(text) {
    const s = String(text || '');
    if (s.includes('标准') || s.includes('P4P') || s.includes('p4p')) return 'P4P标准推';
    if (s.includes('全站') || s.includes('FSP')) return '全站推FSP';
    if (s.includes('品牌') || s.includes('问鼎') || s.includes('顶展') || s.includes('brand')) return '品牌广告';
    return null;
  }

  for (const t of tables) {
    const rows = t.rows || [];
    const titleType = mapAdType(t.title);
    for (const r of rows) {
      const row = rowToObj(t.columns, r);
      const typeCol = findCol(row, ['广告类型', '投放类型', '推广类型']);
      const adType = mapAdType(typeCol) || titleType;
      if (!adType) continue;
      const spend = findNum(row, ['消耗', '花费', '总费用']);
      const impressions = findNum(row, ['展现', '曝光']);
      const clicks = findNum(row, ['点击']);
      const ctr = findNum(row, ['点击率']);
      const conversions = findNum(row, ['转化', '询盘']);
      if (spend === null && impressions === null && clicks === null) continue;
      stmt.run({
        customer_id: customerId, month, ad_type: adType,
        spend, impressions, clicks,
        ctr: ctr !== null ? ctr / 100 : (impressions && clicks ? Number((clicks / impressions).toFixed(4)) : null),
        cpc: spend && clicks ? Number((spend / clicks).toFixed(2)) : null,
        conversions,
      });
      saved++;
    }
  }
  return saved;
}

/**
 * TOP 诊断 / 行业门户 → industry_stats
 * 每行一个类目：类目名 + 店铺数 + 效果均值
 */
function parseIndustry(db, tables, month, source, log) {
  let saved = 0;
  const stmt = db.prepare(`
    INSERT INTO industry_stats (industry, month, store_count, avg_exposure, avg_clicks, avg_inquiries, avg_orders, avg_gmv, data_source, synced_at)
    VALUES (@industry, @month, @store_count, @avg_exposure, @avg_clicks, @avg_inquiries, @avg_orders, @avg_gmv, @data_source, datetime('now','localtime'))
    ON CONFLICT(industry, month, data_source) DO UPDATE SET
      store_count=excluded.store_count, avg_exposure=excluded.avg_exposure, avg_clicks=excluded.avg_clicks,
      avg_inquiries=excluded.avg_inquiries, avg_orders=excluded.avg_orders, avg_gmv=excluded.avg_gmv, synced_at=excluded.synced_at
  `);
  for (const t of tables) {
    for (const r of t.rows || []) {
      const row = rowToObj(t.columns, r);
      const industry = String(findCol(row, ['类目', '行业', '叶子类目']) || t.title || '').trim();
      if (!industry || industry === 'undefined' || industry === 'null') continue;
      const storeCount = findNum(row, ['店铺数', '商家数', '卖家数']);
      if (storeCount === null) {
        // 无店铺数列 → 可能是单店铺 vs 行业均值行，跳过单店铺行（含"本店/我的"）
        if (findCol(row, ['本店', '我的', '店铺']) && !findCol(row, ['行业', '大盘'])) continue;
      }
      stmt.run({
        industry, month, data_source: source,
        store_count: storeCount,
        avg_exposure: findNum(row, ['曝光']),
        avg_clicks: findNum(row, ['点击']),
        avg_inquiries: findNum(row, ['询盘']),
        avg_orders: findNum(row, ['订单']),
        avg_gmv: findNum(row, ['GMV', '成交额']),
      });
      saved++;
    }
  }
  return saved;
}

/**
 * AWB 售卖数据 → awb_stats（汇总指标）+ awb_payments（售卖客户明细 TAB）
 * 明细特征：表格标题含"售卖客户明细"，或列含"付款日期/付款时间"（付款成功客户清单）
 */
function parseAwb(db, tables, month, log) {
  let saved = 0;
  const stmt = db.prepare(`
    INSERT INTO awb_stats (month, metric, value, unit, source_detail, synced_at)
    VALUES (@month, @metric, @value, @unit, @source_detail, datetime('now','localtime'))
    ON CONFLICT(month, metric) DO UPDATE SET
      value=excluded.value, unit=excluded.unit, source_detail=excluded.source_detail, synced_at=excluded.synced_at
  `);
  const payStmt = db.prepare(`
    INSERT INTO awb_payments (month, customer_name, pay_date, amount, synced_at)
    VALUES (@month, @customer_name, @pay_date, @amount, datetime('now','localtime'))
    ON CONFLICT(month, customer_name) DO UPDATE SET
      pay_date=excluded.pay_date, amount=excluded.amount, synced_at=excluded.synced_at
  `);
  for (const t of tables) {
    const title = String(t.title || '');
    const isDetail = title.includes('售卖客户明细') || title.includes('付款明细') || title.includes('成交客户');
    for (const r of t.rows || []) {
      const row = rowToObj(t.columns, r);
      const payDateCol = findCol(row, ['付款日期', '付款时间', '支付日期', '成交日期']);
      if (isDetail || payDateCol) {
        const name = String(findCol(row, ['客户', '公司', '店铺', '买家']) || '').trim();
        if (!name) continue;
        payStmt.run({
          month, customer_name: name,
          pay_date: payDateCol ? String(payDateCol).slice(0, 10) : null,
          amount: findNum(row, ['金额', '成交额']),
        });
        saved++;
        continue;
      }
      const metric = String(findCol(row, ['指标', '名称', '类目', '维度']) || '').trim();
      if (!metric) continue;
      let value = null, unit = null;
      for (const [k, v] of Object.entries(row)) {
        const n = toNum(v);
        if (n !== null && !['指标', '名称', '类目', '维度'].some((x) => k.includes(x))) {
          value = n;
          unit = /%/.test(String(v)) ? '%' : null;
          break;
        }
      }
      if (value === null) continue;
      stmt.run({ month, metric, value, unit, source_detail: title || 'AWB' });
      saved++;
    }
  }
  return saved;
}

/**
 * 90 信保挂账订单金额（参考字段，非实际成交）
 * deepinsight componentId=b542bc43 组件：行/列含"挂账"或"信保"
 * → UPDATE store_stats_monthly.pending_gmv（美金口径）
 */
function parsePendingGmv(db, tables, customerId, month, log) {
  let saved = 0;
  const upd = db.prepare(`
    INSERT INTO store_stats_monthly (customer_id, month, pending_gmv, data_source, synced_at)
    VALUES (?, ?, ?, 'plugin', datetime('now','localtime'))
    ON CONFLICT(customer_id, month) DO UPDATE SET
      pending_gmv = excluded.pending_gmv, synced_at = excluded.synced_at
  `);
  for (const t of tables) {
    for (const r of (t.rows || []).slice(0, 3)) {
      const row = rowToObj(t.columns, r);
      let value = null;
      for (const [k, v] of Object.entries(row)) {
        if (k.includes('挂账') || k.includes('信保')) {
          const n = toNum(v);
          if (n !== null) { value = n; break; }
        }
      }
      if (value === null) {
        // 无挂账列名时取第一个数值列（组件通常单值）
        for (const v of Object.values(row)) {
          const n = toNum(v);
          if (n !== null) { value = n; break; }
        }
      }
      if (value === null) continue;
      upd.run(customerId, month, value);
      saved++;
      break; // 单值组件，取第一行即可
    }
  }
  if (!saved) log(`⚠️ 信保挂账组件无匹配值（表格数 ${tables.length}）`);
  return saved;
}

/**
 * 产品数据 → product_stats
 * deepinsight 产品数组件页：产品数 + 优爆品数（实力优品 + 超级优品）
 */
function parseProductInfo(db, tables, customerId, month, log) {
  let saved = 0;
  const stmt = db.prepare(`
    INSERT INTO product_stats (customer_id, month, product_count, top_product_count, synced_at)
    VALUES (@customer_id, @month, @product_count, @top_product_count, datetime('now','localtime'))
    ON CONFLICT(customer_id, month) DO UPDATE SET
      product_count=excluded.product_count, top_product_count=excluded.top_product_count, synced_at=excluded.synced_at
  `);
  for (const t of tables) {
    const rows = t.rows || [];
    const first = rows[0];
    if (!first) continue;
    const row = rowToObj(t.columns, first);
    // 优爆品数：实力优品 + 超级优品（列可能分开或合并）
    const topPower = findNum(row, ['实力优品']);
    const topSuper = findNum(row, ['超级优品']);
    const topMerged = findNum(row, ['优爆品', '优选爆品']);
    const topProductCount = topMerged !== null ? topMerged : (topPower !== null || topSuper !== null ? (topPower || 0) + (topSuper || 0) : null);
    const productCount = findNum(row, ['产品总数', '商品总数', '产品数', '商品数', '在线产品']);
    if (productCount === null && topProductCount === null) {
      log(`⚠️ 产品数据表格无匹配列（列：${(t.columns || []).join(' / ')}）`);
      continue;
    }
    stmt.run({ customer_id: customerId, month, product_count: productCount, top_product_count: topProductCount });
    saved++;
  }
  return saved;
}

/**
 * 主入口：按 report 分发解析
 */
function parse(db, payload, customer) {
  const { report, date, tables = [], source } = payload;
  const month = (payload.month || (date || '')).slice(0, 7);
  const logs = [];
  const log = (m) => logs.push(m);

  let saved = 0;
  switch (report) {
    case 'customer_data':
      saved = parseCustomerData(db, tables, customer.id, month, log);
      break;
    case 'p4p_brand_ads':
      saved = parseAds(db, tables, customer.id, month, log);
      break;
    case 'top_diagnosis':
    case 'industry':
      saved = parseIndustry(db, tables, month, report, log);
      break;
    case 'awb':
      saved = parseAwb(db, tables, month, log);
      break;
    case 'product_info':
      saved = parseProductInfo(db, tables, customer.id, month, log);
      break;
    case 'pending_gmv':
      saved = parsePendingGmv(db, tables, customer.id, month, log);
      break;
    default:
      log(`未知报告类型：${report}`);
  }
  return { saved, logs };
}

module.exports = { parse, toNum, findCol, findNum };
