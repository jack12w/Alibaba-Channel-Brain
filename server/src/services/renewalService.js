'use strict';

/**
 * 续约预警服务（T3/T6 逻辑）
 * 口径（用户确认）：T3 = 到期日在未来 3 个月内；T6 = 到期日在未来 6 个月内；T3 ⊆ T6。
 * 预警分级：red <=30天 / orange 31-60 / yellow 61-90 / blue 91-180
 */

function daysBetween(from, to) {
  const ms = new Date(to) - new Date(from);
  return Math.round(ms / 86400000);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function classifyWindow(daysLeft) {
  // 返回 { windowType, alertLevel }
  if (daysLeft <= 90) return { windowType: 'T3', alertLevel: daysLeft <= 30 ? 'red' : daysLeft <= 60 ? 'orange' : 'yellow' };
  if (daysLeft <= 180) return { windowType: 'T6', alertLevel: 'blue' };
  return { windowType: null, alertLevel: null };
}

/**
 * 计算某个客户的续约窗口信息（不落库，供实时查询）
 */
function computeForCustomer(customer, today = todayStr()) {
  if (!customer.expire_date) return null;
  const daysLeft = daysBetween(today, customer.expire_date);
  if (daysLeft < 0) {
    return { customer_id: customer.id, days_left: daysLeft, window_type: null, alert_level: null, expired: true };
  }
  const { windowType, alertLevel } = classifyWindow(daysLeft);
  if (!windowType) return { customer_id: customer.id, days_left: daysLeft, window_type: null, alert_level: null };
  return {
    customer_id: customer.id,
    days_left: daysLeft,
    window_type: windowType,
    alert_level: alertLevel,
    expire_date: customer.expire_date,
    plan_amount: customer.plan_amount,
    owner_id: customer.owner_id,
  };
}

/**
 * 生成当日续约预警快照（每日任务调用）
 * 返回本次写入条数
 */
function snapshot(db, today = todayStr()) {
  const customers = db.prepare("SELECT * FROM customers WHERE expire_date IS NOT NULL AND status != 'churned'").all();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO renewal_snapshots
      (customer_id, snapshot_date, expire_date, days_left, window_type, alert_level, plan_amount, owner_id, status)
    VALUES (@customer_id, @snapshot_date, @expire_date, @days_left, @window_type, @alert_level, @plan_amount, @owner_id, 'open')
  `);
  const del = db.prepare('DELETE FROM renewal_snapshots WHERE snapshot_date = ?');
  const tx = db.transaction(() => {
    del.run(today);
    let n = 0;
    for (const c of customers) {
      const info = computeForCustomer(c, today);
      if (info && info.window_type) {
        insert.run({ ...info, snapshot_date: today });
        n++;
      }
    }
    return n;
  });
  return tx();
}

/**
 * 查询续约面板（T3/T6 客户列表，含客户信息与数据表现摘要）
 */
function queryPanel(db, { windowType = 'T3', alertLevel = null, ownerId = null } = {}) {
  let sql = `
    SELECT s.customer_id, s.expire_date, s.days_left, s.window_type, s.alert_level,
           s.plan_amount, s.status AS renewal_status,
           c.company_name, c.store_id, c.industry, c.plan_type, c.owner_id,
           m.name AS owner_name,
           (SELECT COUNT(*) FROM store_stats_monthly st WHERE st.customer_id = c.id) AS months_on_record,
           (SELECT inquiries FROM store_stats_monthly st WHERE st.customer_id = c.id ORDER BY st.month DESC LIMIT 1) AS latest_inquiries,
           (SELECT gmv FROM store_stats_monthly st WHERE st.customer_id = c.id ORDER BY st.month DESC LIMIT 1) AS latest_gmv,
           (SELECT COUNT(*) FROM sell_opportunities so WHERE so.customer_id = c.id AND so.status IN ('open', 'following')) AS open_opp_count,
           (SELECT COALESCE(SUM(so.estimated_max), 0) FROM sell_opportunities so WHERE so.customer_id = c.id AND so.status IN ('open', 'following')) AS open_opp_amount
    FROM renewal_snapshots s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN team_members m ON m.id = c.owner_id
    WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM renewal_snapshots)
      AND s.window_type = ?
  `;
  const params = [windowType];
  if (alertLevel) {
    sql += ' AND s.alert_level = ?';
    params.push(alertLevel);
  }
  if (ownerId) {
    sql += ' AND c.owner_id = ?';
    params.push(ownerId);
  }
  sql += ' ORDER BY s.days_left ASC';
  return db.prepare(sql).all(...params);
}

module.exports = { computeForCustomer, snapshot, queryPanel, classifyWindow, daysBetween, addMonths, todayStr };
