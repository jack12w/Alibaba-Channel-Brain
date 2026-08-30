'use strict';

/**
 * 指标取值公共服务
 * - 监控引擎（每日/同步触发检查）与回验自动带出共用
 * - p4p_daily_spend：ad_stats_monthly 最新月 P4P标准推 消耗 ÷ 当月天数（日均消耗）
 * - 其余指标：store_stats_monthly 最新月对应字段
 */

const METRIC_TYPES = {
  p4p_daily_spend: 'P4P日均消耗',
  exposure: '曝光',
  clicks: '点击',
  inquiries: '询盘',
  gmv: 'GMV',
  ctr: '点击率',
};

const STORE_FIELDS = { exposure: 'exposure', clicks: 'clicks', inquiries: 'inquiries', gmv: 'gmv', ctr: 'click_rate' };

function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * 取某客户某指标的最新值（来自插件采集数据）
 * 返回 { value, source: 'ad_stats'|'store_stats', month, raw } 或 null（无数据）
 */
function getMetricValue(db, customerId, metricType) {
  if (metricType === 'p4p_daily_spend') {
    const row = db.prepare(`
      SELECT month, spend FROM ad_stats_monthly
      WHERE customer_id = ? AND ad_type LIKE '%P4P%'
      ORDER BY month DESC LIMIT 1
    `).get(customerId);
    if (!row || row.spend === null) return null;
    const days = daysInMonth(row.month);
    return { value: Number((row.spend / days).toFixed(1)), source: 'ad_stats', month: row.month, raw: row.spend };
  }
  const field = STORE_FIELDS[metricType];
  if (!field) return null;
  const latest = db.prepare(`
    SELECT month, ${field} AS v FROM store_stats_monthly
    WHERE customer_id = ? ORDER BY month DESC LIMIT 1
  `).get(customerId);
  if (!latest || latest.v === null || latest.v === undefined) return null;
  return { value: latest.v, source: 'store_stats', month: latest.month, raw: latest.v };
}

/**
 * 取某客户某指标的上一期值（较最新一期更早的最近一期）
 */
function getMetricPrev(db, customerId, metricType) {
  if (metricType === 'p4p_daily_spend') {
    const row = db.prepare(`
      SELECT month, spend FROM ad_stats_monthly
      WHERE customer_id = ? AND ad_type LIKE '%P4P%'
      ORDER BY month DESC LIMIT 1 OFFSET 1
    `).get(customerId);
    if (!row || row.spend === null) return null;
    const days = daysInMonth(row.month);
    return { value: Number((row.spend / days).toFixed(1)), source: 'ad_stats', month: row.month, raw: row.spend };
  }
  const field = STORE_FIELDS[metricType];
  if (!field) return null;
  const prev = db.prepare(`
    SELECT month, ${field} AS v FROM store_stats_monthly
    WHERE customer_id = ? AND month < (SELECT MAX(month) FROM store_stats_monthly WHERE customer_id = ?)
    ORDER BY month DESC LIMIT 1
  `).get(customerId, customerId);
  if (!prev || prev.v === null || prev.v === undefined) return null;
  return { value: prev.v, source: 'store_stats', month: prev.month, raw: prev.v };
}

module.exports = { getMetricValue, getMetricPrev, METRIC_TYPES };
