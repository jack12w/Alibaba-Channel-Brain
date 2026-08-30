'use strict';

/**
 * 指标持续监控引擎
 * 双触发：
 * 1. breach（跌破目标）→ 落库 open 告警（同监控 open 不重复）+ 钉钉推送（红色）
 * 2. decline（未跌破但较上期下降）→ 落库 open 告警（同监控当日不重复）+ 钉钉推送（黄色）
 * 数据同步入库后即时检查 + 每日 00:20 全量 + 手动触发。
 * 推送失败不阻塞主流程。
 */

const { getMetricValue, getMetricPrev, METRIC_TYPES } = require('./metrics');
const dingtalk = require('./dingtalk');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isBreached(monitor, value) {
  if (monitor.compare === 'lte') return value > monitor.target_value;
  return value < monitor.target_value; // 默认 gte：不低于
}

function metricLabel(type) {
  return METRIC_TYPES[type] || type;
}

function customerName(db, id) {
  const c = db.prepare('SELECT company_name, store_id FROM customers WHERE id = ?').get(id);
  return c ? `${c.company_name}（${c.store_id || '无店铺'}）` : `客户#${id}`;
}

async function pushAlert({ cfg, type, company, metric, target, actual, prev }) {
  if (!cfg.enabled || !cfg.webhook) return;
  const text = type === 'breach'
    ? `#### ⚠️ 客户指标异常 · 跌破目标\n- **客户**：${company}\n- **指标**：${metric}\n- **目标**：${target}\n- **实际**：${actual}\n- **建议**：尽快查看并干预，防止数据持续下滑`
    : `#### 📉 客户指标下降提醒\n- **客户**：${company}\n- **指标**：${metric}\n- **上期**：${prev}\n- **本期**：${actual}\n- **建议**：关注下降原因，必要时调整策略`;
  await dingtalk.sendMarkdown({
    webhook: cfg.webhook,
    secret: cfg.secret,
    title: type === 'breach' ? '⚠️ 客户指标异常' : '📉 客户指标下降提醒',
    text,
    atMobiles: cfg.atMobiles,
  });
}

/**
 * 检查监控并生成告警 + 钉钉推送
 * @returns { checked, alerts, created, pushed }
 */
async function check(db, customerId) {
  const where = customerId ? 'WHERE status = \'active\' AND customer_id = ?' : "WHERE status = 'active'";
  const params = customerId ? [customerId] : [];
  const monitors = db.prepare(`SELECT * FROM metric_monitors ${where}`).all(...params);

  const hasOpen = db.prepare(`
    SELECT id FROM metric_alerts WHERE monitor_id = ? AND status = 'open' AND alert_type = ? LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO metric_alerts (monitor_id, customer_id, metric_type, target_value, actual_value, alert_type, prev_value, alert_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `);

  const cfg = dingtalk.getConfig(db);
  const today = todayStr();
  let alerts = 0, created = 0, pushed = 0;

  for (const m of monitors) {
    const got = getMetricValue(db, m.customer_id, m.metric_type);
    if (!got) continue; // 无采集数据，跳过
    const company = customerName(db, m.customer_id);

    // 1. 跌破目标 → breach
    if (isBreached(m, got.value)) {
      if (!hasOpen.get(m.id, 'breach')) {
        insert.run(m.id, m.customer_id, m.metric_type, m.target_value, got.value, 'breach', null, today);
        alerts++;
        created++;
        try {
          await pushAlert({ cfg, type: 'breach', company, metric: metricLabel(m.metric_type), target: m.target_value, actual: got.value });
          pushed++;
        } catch (e) {
          console.error(`[dingtalk] breach 推送失败（监控 ${m.id}）: ${e.message}`);
        }
      }
      continue; // 已跌破，不再判断下降
    }

    // 2. 未跌破但较上期下降 → decline
    const prev = getMetricPrev(db, m.customer_id, m.metric_type);
    if (!prev || got.value >= prev.value) continue;
    if (!hasOpen.get(m.id, 'decline')) {
      insert.run(m.id, m.customer_id, m.metric_type, m.target_value, got.value, 'decline', prev.value, today);
      alerts++;
      created++;
      try {
        await pushAlert({ cfg, type: 'decline', company, metric: metricLabel(m.metric_type), prev: prev.value, actual: got.value });
        pushed++;
      } catch (e) {
        console.error(`[dingtalk] decline 推送失败（监控 ${m.id}）: ${e.message}`);
      }
    }
  }
  return { checked: monitors.length, alerts, created, pushed };
}

module.exports = { check, todayStr };
