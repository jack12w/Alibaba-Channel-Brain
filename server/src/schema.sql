-- 渠道中心大脑系统 Schema v0.1
-- 数据库：SQLite（better-sqlite3）

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 系统用户（登录账号，与 team_members 关联）
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  member_id     INTEGER,                -- 关联 team_members.id（可空）
  role          TEXT NOT NULL DEFAULT 'staff',  -- 兼容字段：admin/manager/staff
  role_id       INTEGER,                -- 关联 roles.id（RBAC 主角色）
  enabled       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 角色（RBAC）
CREATE TABLE IF NOT EXISTS roles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,   -- admin/boss/ops/renewal/sales_manager/sales/hr
  name          TEXT NOT NULL,
  data_scope    TEXT NOT NULL DEFAULT 'all',  -- all/team/self
  description   TEXT
);

-- 权限点
CREATE TABLE IF NOT EXISTS permissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  module        TEXT
);

-- 角色-权限关联
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);

-- 员工/团队成员
CREATE TABLE IF NOT EXISTS team_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,          -- 运营/续约顾问/新签销售/人事/行政/管理层
  team          TEXT,                   -- 运营中台/重资产/新签/后端
  phone         TEXT,
  email         TEXT,
  status        TEXT DEFAULT 'active',  -- active/trial/left
  hire_date     TEXT,
  leave_date    TEXT,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 客户主数据（唯一主数据源）
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name  TEXT NOT NULL,
  company_en    TEXT,
  store_id      TEXT UNIQUE,
  industry      TEXT,
  plan_type     TEXT,                   -- 出口通/金品诚企
  plan_amount   REAL,
  sign_date     TEXT,
  expire_date   TEXT,
  status        TEXT DEFAULT 'active',  -- active/expiring/expired/churned
  owner_id      INTEGER,                -- 客户经理 team_members.id
  team_scope    TEXT,                   -- 运营中台/重资产/新签
  source        TEXT,                   -- 新签/续约/转介绍/展会
  sync_token    TEXT,                   -- 插件采集鉴权 token（每客户唯一）
  remark        TEXT,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 店铺数据表现（按月汇总）
CREATE TABLE IF NOT EXISTS store_stats_monthly (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  month        TEXT NOT NULL,           -- 'YYYY-MM'
  exposure     INTEGER DEFAULT 0,
  clicks       INTEGER DEFAULT 0,
  click_rate   REAL DEFAULT 0,
  inquiries    INTEGER DEFAULT 0,
  tm_contacts  INTEGER DEFAULT 0,
  orders       INTEGER DEFAULT 0,
  gmv          REAL DEFAULT 0,
  ad_spend     REAL DEFAULT 0,
  ad_roi       REAL DEFAULT 0,
  data_source  TEXT DEFAULT 'manual',
  synced_at    TEXT,
  UNIQUE(customer_id, month)
);

-- 广告数据（按月 × 广告类型）
CREATE TABLE IF NOT EXISTS ad_stats_monthly (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  month        TEXT NOT NULL,
  ad_type      TEXT NOT NULL,           -- P4P标准推/全站推FSP/品牌广告
  spend        REAL DEFAULT 0,
  impressions  INTEGER DEFAULT 0,
  clicks       INTEGER DEFAULT 0,
  ctr          REAL DEFAULT 0,
  cost_per_click REAL DEFAULT 0,
  conversions  INTEGER DEFAULT 0,
  UNIQUE(customer_id, month, ad_type)
);

-- 育商服务记录
CREATE TABLE IF NOT EXISTS service_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  member_id    INTEGER,
  record_date  TEXT,
  service_type TEXT,                    -- 电话回访/上门/培训/方案/装修/其他
  content      TEXT,
  next_action  TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- 商机（新签场景）
CREATE TABLE IF NOT EXISTS opportunities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_source   TEXT,
  company_name  TEXT NOT NULL,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_wechat TEXT,
  industry      TEXT,
  stage         TEXT DEFAULT 'initial', -- initial/need/quote/negotiate/won/lost
  amount        REAL,
  owner_id      INTEGER,
  expected_date TEXT,
  won_date      TEXT,
  customer_id   INTEGER,                -- 签单后关联客户档案
  remark        TEXT,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 商机跟进记录
CREATE TABLE IF NOT EXISTS opportunity_activities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id  INTEGER NOT NULL REFERENCES opportunities(id),
  member_id       INTEGER,
  activity_date   TEXT,
  activity_type   TEXT,                 -- 电话/拜访/微信/邮件/报价
  content         TEXT,
  next_follow_date TEXT,
  created_at      TEXT DEFAULT (datetime('now','localtime'))
);

-- 续约预警快照（每日任务生成）
CREATE TABLE IF NOT EXISTS renewal_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  snapshot_date TEXT,
  expire_date   TEXT,
  days_left     INTEGER,
  window_type   TEXT,                   -- T3/T6
  alert_level   TEXT,                   -- red/orange/yellow/blue
  plan_amount   REAL,
  owner_id      INTEGER,
  status        TEXT DEFAULT 'open',    -- open/following/done/lost
  UNIQUE(customer_id, snapshot_date)
);

-- 人事行政报表
CREATE TABLE IF NOT EXISTS admin_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type  TEXT,
  period       TEXT,
  member_id    INTEGER,
  metrics_json TEXT,
  imported_at  TEXT DEFAULT (datetime('now','localtime'))
);

-- 数据同步日志（插件/导入审计）
CREATE TABLE IF NOT EXISTS data_sync_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT,
  customer_id  INTEGER,
  sync_type    TEXT,
  status       TEXT,
  message      TEXT,
  synced_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 知识库分类
CREATE TABLE IF NOT EXISTS knowledge_categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  parent_id     INTEGER DEFAULT 0,
  sort          INTEGER DEFAULT 0
);

-- 知识库文档
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL,
  title         TEXT NOT NULL,
  summary       TEXT,
  content       TEXT,                   -- 正文（文本/富文本）
  file_name     TEXT,                   -- 附件文件名
  file_path     TEXT,                   -- 附件存储相对路径
  file_size     INTEGER,
  version       INTEGER DEFAULT 1,
  status        TEXT DEFAULT 'published',  -- draft/published/archived
  creator_id    INTEGER,
  updated_by    INTEGER,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 知识库版本历史
CREATE TABLE IF NOT EXISTS knowledge_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id        INTEGER NOT NULL,
  version       INTEGER NOT NULL,
  title         TEXT,
  content       TEXT,
  file_name     TEXT,
  file_path     TEXT,
  file_size     INTEGER,
  changed_by    INTEGER,
  note          TEXT,                   -- 版本说明（如"2026 激励规则更新"）
  created_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 3级类目行业数据（TOP诊断 / 行业门户采集）
CREATE TABLE IF NOT EXISTS industry_stats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  industry      TEXT NOT NULL,          -- 3级类目名
  month         TEXT NOT NULL,          -- 'YYYY-MM'
  store_count   INTEGER,                -- 行业店铺数
  avg_exposure  REAL,                   -- 效果均值：曝光
  avg_clicks    REAL,
  avg_inquiries REAL,
  avg_orders    REAL,
  avg_gmv       REAL,
  data_source   TEXT,                   -- top_diagnosis / industry_portal
  synced_at     TEXT,
  UNIQUE(industry, month, data_source)
);

-- AWB 售卖数据
CREATE TABLE IF NOT EXISTS awb_stats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  month         TEXT NOT NULL,
  metric        TEXT NOT NULL,          -- 指标（AWB售卖数/渗透率/覆盖率等）
  value         REAL,
  unit          TEXT,
  source_detail TEXT,                   -- 原始描述
  synced_at     TEXT,
  UNIQUE(month, metric)
);

-- 售卖机会规则（规则引擎）
CREATE TABLE IF NOT EXISTS sell_rules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  opportunity_type TEXT NOT NULL,       -- ad_new/ad_add/brand_ad/fsp/service
  description      TEXT,
  conditions       TEXT NOT NULL,       -- JSON {logic, conditions:[{field,op,value}]}
  estimated_min    REAL,
  estimated_max    REAL,
  priority         INTEGER DEFAULT 0,
  enabled          INTEGER DEFAULT 1,
  created_at       TEXT DEFAULT (datetime('now','localtime')),
  updated_at       TEXT DEFAULT (datetime('now','localtime'))
);

-- 售卖机会（引擎产出）
CREATE TABLE IF NOT EXISTS sell_opportunities (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id          INTEGER,
  customer_id      INTEGER NOT NULL REFERENCES customers(id),
  opportunity_type TEXT NOT NULL,
  title            TEXT NOT NULL,
  summary          TEXT,
  estimated_min    REAL,
  estimated_max    REAL,
  status           TEXT DEFAULT 'open', -- open/following/won/lost/closed
  owner_id         INTEGER,
  created_at       TEXT DEFAULT (datetime('now','localtime')),
  updated_at       TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(rule_id, customer_id)
);

-- 运营过程记录（动作目标 + 回验，评估"动作→结果"）
CREATE TABLE IF NOT EXISTS work_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  member_id     INTEGER,                -- 执行人（运营）
  action_type   TEXT NOT NULL,          -- 广告优化/关键词优化/店铺装修/产品发布/培训/活动/其他
  title         TEXT NOT NULL,          -- 动作标题（如：P4P 日均消耗提升）
  description   TEXT,                   -- 过程描述（做了什么）
  metric_type   TEXT NOT NULL,          -- p4p_daily_spend/exposure/clicks/inquiries/gmv/ctr
  baseline_value REAL,                  -- 基线值（动作前）
  target_value  REAL,                   -- 目标值
  target_date   TEXT,                   -- 期望达成/回验日期
  status        TEXT DEFAULT 'active',  -- active/achieved/missed/closed
  actual_value  REAL,                   -- 回验实际值
  verified_at   TEXT,                   -- 回验时间
  verify_note   TEXT,                   -- 回验备注
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 指标持续监控规则（如：P4P 日均消耗不低于 200）
CREATE TABLE IF NOT EXISTS metric_monitors (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  metric_type   TEXT NOT NULL,          -- p4p_daily_spend/exposure/clicks/inquiries/gmv/ctr
  target_value  REAL NOT NULL,          -- 目标值
  compare       TEXT DEFAULT 'gte',     -- gte(不低于)/lte(不高于)
  note          TEXT,
  status        TEXT DEFAULT 'active',  -- active/paused/closed
  created_by    INTEGER,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 指标监控告警
CREATE TABLE IF NOT EXISTS metric_alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id    INTEGER NOT NULL REFERENCES metric_monitors(id),
  customer_id   INTEGER NOT NULL,
  metric_type   TEXT NOT NULL,
  target_value  REAL,
  actual_value  REAL,
  alert_type    TEXT DEFAULT 'breach',  -- breach(跌破目标)/decline(较上期下降)
  prev_value    REAL,                   -- 上期值（decline 用）
  alert_date    TEXT,
  status        TEXT DEFAULT 'open',    -- open/handled/ignored
  handled_by    INTEGER,
  handled_at    TEXT,
  handle_note   TEXT,
  created_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 系统配置（key-value）
CREATE TABLE IF NOT EXISTS app_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT,
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 业绩目标配置（渠道营收 / 广告维度 / 育商里程碑 / 大盘 / 续签率）
CREATE TABLE IF NOT EXISTS goal_targets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,          -- revenue/ad/nursery_new/nursery_market/renew_rate
  period        TEXT,                   -- 周期：2026 / 2026-Q2（营收类）；育商类为空
  name          TEXT NOT NULL,
  metric        TEXT NOT NULL,          -- 指标键（goalEngine 识别）
  target_value  REAL NOT NULL,
  unit          TEXT DEFAULT '',        -- 元/单/个/%/美金
  enabled       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 手动实际值（数据暂缺源的指标：产品数/优爆品数/大盘/广告产品/汇率等）
CREATE TABLE IF NOT EXISTS manual_actuals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id       INTEGER NOT NULL,
  period        TEXT NOT NULL,          -- 对应周期
  actual_value  REAL NOT NULL,
  note          TEXT,
  updated_by    INTEGER,
  updated_at    TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(goal_id, period)
);

-- AWB 售卖客户明细（插件采集：AWB 页面"售卖客户明细"TAB，付款成功客户+付款日期）
CREATE TABLE IF NOT EXISTS awb_payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  month         TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  pay_date      TEXT,
  amount        REAL,
  synced_at     TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(month, customer_name)
);

-- 客户产品数据（插件采集：deepinsight 产品数组件页；产品数 + 优爆品数=实力优品+超级优品）
CREATE TABLE IF NOT EXISTS product_stats (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER NOT NULL REFERENCES customers(id),
  month             TEXT NOT NULL,
  product_count     INTEGER,
  top_product_count INTEGER,            -- 优爆品数
  synced_at         TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(customer_id, month)
);

CREATE INDEX IF NOT EXISTS idx_customers_expire ON customers(expire_date);
CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_stats_customer_month ON store_stats_monthly(customer_id, month);
CREATE INDEX IF NOT EXISTS idx_adstats_customer ON ad_stats_monthly(customer_id, month);
CREATE INDEX IF NOT EXISTS idx_opps_owner ON opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON renewal_snapshots(snapshot_date, window_type);

-- =====================================================================
-- 真实数据模型（v2）：基于 5 个真实 CSV（商家运营/180天新商/P4P/AWB/成交营）
-- 口径：一个账号 = 一个客户（account_id 为业务主键）；按 stat_date 保留历史快照
-- =====================================================================

-- 用户 ↔ 客户经理 绑定（行级隔离：一个账号可绑定多个客户经理姓名）
CREATE TABLE IF NOT EXISTS user_customer_binding (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  manager_name  TEXT NOT NULL,           -- 真实客户经理姓名
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(user_id, manager_name)
);

-- 组织团队（新签主管看团队；团队成员归属记录）
CREATE TABLE IF NOT EXISTS teams (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,            -- 团队名（如"丁浩瀚团队"）
  leader_name  TEXT,                     -- 团队主管姓名
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(name)
);

-- 商家运营明细快照（客户主档 + 续约 + 商品 + P4P 基础 + 信保挂账）
CREATE TABLE IF NOT EXISTS snap_store (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date           TEXT NOT NULL,     -- 统计日期（快照）
  account_id          TEXT NOT NULL,     -- admin_mbr_id（账号）
  comp_id             TEXT,
  global_id           TEXT,
  manager_name        TEXT,              -- 客户经理
  supervisor_name     TEXT,              -- 主管
  region              TEXT,
  channel_type        TEXT,
  region_large        TEXT,
  industry_l1         TEXT,
  industry_l2         TEXT,
  industry_l3         TEXT,
  contract_start      TEXT,
  contract_end        TEXT,              -- 当前合同到期日期
  renew_early_status  TEXT,              -- 提前续约状态
  is_renew            TEXT,
  is_gold             TEXT,
  is_multi_platform   TEXT,
  is_gold_unopened    TEXT,
  service_years       REAL,
  star_rated          REAL,
  star_predicted      REAL,
  lifecycle_type      TEXT,
  lifecycle           TEXT,
  company_type        TEXT,
  shop_url            TEXT,
  contract_attr       TEXT,
  is_partner          TEXT,
  channel_company     TEXT,
  p4p_level           TEXT,
  p4p_status          TEXT,              -- p4p_当天推广状态
  contract_amount     REAL,              -- 当前合同的到款金额
  plan_amount_1y      REAL,
  plan_amount_2y      REAL,
  product_count       INTEGER,
  rts_count           INTEGER,
  normal_products     INTEGER,
  potential_products  INTEGER,
  strength_products   INTEGER,           -- 实力优品
  super_products      INTEGER,           -- 超级优品
  p4p_monthly_spend   REAL,
  p4p_daily_limit     REAL,
  p4p_cash_balance    REAL,
  p4p_last_recharge   REAL,
  credit_light        TEXT,
  is_taobao           TEXT,
  is_tmall            TEXT,
  is_cxt              TEXT,
  is_ae               TEXT,
  login_days_30d      INTEGER,
  wangwang_days_30d   INTEGER,
  exposure_30d        INTEGER,
  clicks_30d          INTEGER,
  inquiries_30d       INTEGER,
  tm_inquiries_30d    INTEGER,
  pv_30d              INTEGER,
  uv_30d              INTEGER,
  buyers_90d          INTEGER,
  pending_gmv_90d     REAL,              -- 近90天信保挂账订单金额
  pending_orders_90d  INTEGER,
  click_rate          REAL,
  risk_score          REAL,
  settled_gmv_90d     REAL,              -- 近90天信保交易成功订单金额
  buyer_rating        REAL,
  avg_reply_time      REAL,
  biz_value           REAL,
  total_biz           INTEGER,
  gold_cert_expire    TEXT,
  ab_30d              INTEGER,
  ab_blue_30d         INTEGER,
  ab_gold_30d         INTEGER,
  platform_count      INTEGER,
  rts_buyers_30d      INTEGER,
  rts_gmv_30d         REAL,
  rts_orders_30d      INTEGER,
  raw                 TEXT,              -- 原始行 JSON（兜底）
  synced_at           TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(stat_date, account_id)
);

-- 180天新商里程碑快照（6 大里程碑官方达标数据）
CREATE TABLE IF NOT EXISTS snap_milestone (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date           TEXT NOT NULL,
  account_id          TEXT NOT NULL,
  company_name        TEXT,
  is_high_risk        TEXT,
  first_service_date  TEXT,
  service_days        INTEGER,
  customer_group      TEXT,
  industry_l1         TEXT,
  industry_l2         TEXT,
  industry_l3         TEXT,
  star_rated          REAL,
  star_predicted      REAL,
  star_direct         REAL,
  p30_value           REAL,              -- 30天·品
  p30_current         REAL,
  p30_status          TEXT,
  p30_days            INTEGER,
  p60_value           REAL,              -- 60天·P4P
  p60_current         REAL,
  p60_status          TEXT,
  p60_days            INTEGER,
  p90_value           REAL,              -- 90天·订单
  p90_current         REAL,
  p90_status          TEXT,
  p90_days            INTEGER,
  p120_value          REAL,              -- 120天·优爆品
  p120_current        REAL,
  p120_status         TEXT,
  p120_days           INTEGER,
  p180_gmv_value      REAL,              -- 180天·GMV
  p180_gmv_current    REAL,
  p180_gmv_status     TEXT,
  p180_gmv_days       INTEGER,
  p180_gmv_hit5000    TEXT,              -- 当前GMV是否达5000
  p180_star_value     REAL,              -- 180天·星级
  p180_star_current   REAL,
  p180_star_status    TEXT,
  p180_star_days      INTEGER,
  p180_star_hit1      TEXT,              -- 当前星级是否达1星
  region_large        TEXT,
  mid_region          TEXT,
  region              TEXT,
  channel             TEXT,
  sales_name          TEXT,
  supervisor_group    TEXT,
  partner_company     TEXT,
  partner_sales       TEXT,
  partner_service     TEXT,
  eco_supervisor      TEXT,
  optimizer_name      TEXT,
  raw                 TEXT,
  synced_at           TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(stat_date, account_id)
);

-- P4P 消耗明细快照（广告消耗 + 广告产品营收 + 活跃/流失标记）
CREATE TABLE IF NOT EXISTS snap_ad (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date           TEXT NOT NULL,
  stat_month          TEXT,
  account_id          TEXT NOT NULL,
  comp_id             TEXT,
  company_name        TEXT,
  member_type         TEXT,
  is_serving          TEXT,
  region_large        TEXT,
  channel_type        TEXT,
  merge_region        TEXT,
  supervisor_group    TEXT,
  manager_name        TEXT,
  partner_company     TEXT,
  is_gold             TEXT,
  optimizer_name      TEXT,
  marketing_level     TEXT,
  star_level          TEXT,
  is_industry_leader  TEXT,
  industry_l1         TEXT,
  industry_l2         TEXT,
  industry_l3         TEXT,
  is_first_recharge   TEXT,
  is_open_p           TEXT,              -- 是否开P（开P率判定核心）
  p4p_daily_spend     REAL,
  p4p_monthly_spend   REAL,
  p4p_quarter_spend   REAL,
  p4p_year_spend      REAL,
  p4p_daily_budget    REAL,
  p4p_monthly_budget  REAL,
  cash_spend_7d       REAL,
  cash_spend_30d      REAL,
  cash_spend_60d      REAL,
  cash_spend_90d      REAL,
  cash_spend_365d     REAL,
  active_7d           INTEGER,
  active_30d          INTEGER,
  serious_active_30d  INTEGER,
  active_60d          INTEGER,
  active_90d          INTEGER,
  active_365d         INTEGER,
  low_balance_7d      INTEGER,
  spend_decline_30d   INTEGER,
  dormant_7d_balance  INTEGER,
  churned_30d         INTEGER,
  lost_7d             INTEGER,
  account_balance     REAL,
  cash_balance        REAL,
  avg_daily_hours_7d  REAL,
  is_dot_boom         INTEGER,
  dot_boom_budget     REAL,
  plan_count          INTEGER,
  rev_brand_month     REAL,              -- 当月品牌营收
  rev_top_month       REAL,              -- 当月顶展营收
  rev_ask_month       REAL,              -- 当月问鼎营收
  rev_review_month    REAL,              -- 当月回眸营收
  rev_star_month      REAL,              -- 当月明星展位营收
  newbie_pack_amount  REAL,
  new_product_count   INTEGER,
  p4p_new_product_count INTEGER,
  top_product_count   INTEGER,
  raw                 TEXT,
  synced_at           TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(stat_date, account_id)
);

-- AW 成交营快照（经营指标：知识库/商详/热卖/买驱GMV/营收拆分）
CREATE TABLE IF NOT EXISTS snap_camp (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date               TEXT NOT NULL,
  account_id              TEXT NOT NULL,
  company_name            TEXT,
  is_gold                 TEXT,
  star_predicted          REAL,
  product_count           INTEGER,
  top_count               INTEGER,
  hot_bid_count           INTEGER,
  hot_bid_q_inc           INTEGER,
  hot_potential_count     INTEGER,
  biz_bid_count           INTEGER,
  ai_kb_count             INTEGER,       -- AI知识库文件数
  structured_detail_count INTEGER,       -- 结构化商详品数
  daily_budget            REAL,
  rfq_quotes_30d          INTEGER,
  p4p_spend_30d           REAL,
  rec_ad_count            INTEGER,
  rec_ad_promo_count      INTEGER,
  ab_30d                  INTEGER,
  l1_buyers_30d           INTEGER,
  l3_buyers_30d           INTEGER,
  buy_order_30d           INTEGER,
  buy_gmv_30d             REAL,
  settled_gmv_30d         REAL,
  buy_order_90d           INTEGER,
  buy_gmv_90d             REAL,
  settled_gmv_90d         REAL,
  revenue_zhonggong       REAL,          -- 中供营收
  revenue_okki            REAL,          -- OKKI营收
  revenue_pinguang        REAL,          -- 品广营收
  avg_daily_spend         REAL,
  revenue_effect_ad       REAL,          -- 效果广告营收
  partner_company         TEXT,
  partner_sales           TEXT,
  mid_region              TEXT,
  region                  TEXT,
  supervisor_group        TEXT,
  sales_name              TEXT,
  raw                     TEXT,
  synced_at               TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(stat_date, account_id)
);

-- AWB 购买明细（订单流水，非快照；公司名从 customers 回填）
CREATE TABLE IF NOT EXISTS awb_orders (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  item_num              TEXT NOT NULL UNIQUE,
  account_id            TEXT,
  company_name          TEXT,
  product_category      TEXT,            -- 体验版/入门版/标准版/积分进阶包
  create_date           TEXT,
  is_pack               TEXT,
  is_star_pack          TEXT,
  pack_scheme           TEXT,
  biz_status            TEXT,
  sign_amount           REAL,            -- 签约金额
  pay_amount            REAL,            -- 付款金额（营收口径）
  pay_status            TEXT,
  pay_date              TEXT,
  period                INTEGER,
  period_unit           TEXT,
  service_start         TEXT,
  service_end           TEXT,
  is_cgs_serving        TEXT,
  is_gold               TEXT,
  new_renew_attr        TEXT,
  cgs_new_renew_attr    TEXT,
  pack_member_new_attr  TEXT,
  manager_name          TEXT,
  supervisor_group      TEXT,
  supervisor_name       TEXT,
  region                TEXT,
  mid_region            TEXT,
  region_large          TEXT,
  is_open               TEXT,
  sales_account         TEXT,
  sales_name            TEXT,
  is_ka_sign            TEXT,
  is_cgs_end            TEXT,
  pack_member_type      TEXT,
  channel_type          TEXT,
  raw                   TEXT,
  synced_at             TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_snap_store_acct ON snap_store(account_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_snap_milestone_acct ON snap_milestone(account_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_snap_ad_acct ON snap_ad(account_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_snap_camp_acct ON snap_camp(account_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_awb_orders_acct ON awb_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_binding_user ON user_customer_binding(user_id);

-- 续约跟进状态（account_id 维度，运营手动维护）
CREATE TABLE IF NOT EXISTS renewal_status (
  account_id  TEXT PRIMARY KEY,
  status      TEXT DEFAULT 'open',       -- open/following/done/lost
  updated_by  INTEGER,
  updated_at  TEXT DEFAULT (datetime('now','localtime'))
);

-- CSV 导入文件去重（hash 幂等）
CREATE TABLE IF NOT EXISTS import_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name   TEXT NOT NULL,
  file_hash   TEXT NOT NULL,
  table_type  TEXT,
  row_count   INTEGER,
  status      TEXT,
  message     TEXT,
  imported_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(file_hash)
);
