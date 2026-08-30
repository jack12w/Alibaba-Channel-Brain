# 渠道中心大脑系统 · 总体架构设计文档

- 版本：v0.1（项目启动版）
- 日期：2026-08-17
- 所属：成都阿里巴巴国际站渠道商
- 状态：草案，待评审

---

## 1. 项目背景与目标

### 1.1 背景

我们是成都地区阿里巴巴国际站渠道商，业务覆盖国际站会员销售（新签）、客户运营服务（育商）、续约管理（重资产）及公司内部后端管理。当前业务数据分散在 Excel、商家后台、OKKI CRM 及人工记忆中，缺乏统一视图，导致：

- 运营中台无法快速掌握每个客户的真实数据表现，育商动作靠经验；
- 续约管理靠人工记忆到期时间，容易错过续约窗口；
- 新签团队的 leads 跟进过程不透明，交接困难、漏斗不可见；
- 人事行政报表靠手工汇总，耗时且易错。

### 1.2 目标

建设"**渠道中心大脑**"——一套服务于全公司四大业务场景的统一经营管理系统：

| 场景 | 团队 | 核心诉求 |
|---|---|---|
| a. 运营中台育商服务 | 运营中台 | 客户数据看板、数据表现分析、育商动作留痕 |
| b. 重资产续约支持 | 重资产团队 | T3/T6 续约预警、产品/广告售卖机会识别 |
| c. 新签客户跟进 | 新签团队 | leads → 签单全流程跟进管理 |
| d. 后端服务支持 | 人事/行政 | 报表汇总、数据统计 |

### 1.3 关键术语口径（重要）

- **T3 客户**：合同到期时间在未来 **3 个月以内**（含）的可续约客户 —— 已进入续约窗口，需重点跟进。
- **T6 客户**：合同到期时间在未来 **6 个月以内**（含）的可续约客户 —— 进入续约预备期，开始接触与铺垫。
- T3 ⊂ T6（T3 是 T6 的子集，T3 客户同时属于 T6 列表，但 T3 优先级更高）。
- 续约对象：国际站会员年费（金品诚企/出口通等套餐）。

---

## 2. 总体架构

```
┌────────────────────────────────────────────────────────────────┐
│                   渠道中心大脑 Web 应用（浏览器访问）             │
│  ┌────────────┬────────────┬────────────┬────────────┐        │
│  │ ① 运营看板  │ ② 续约面板  │ ③ 新签跟进  │ ④ 人事行政  │        │
│  │  (场景a)   │  (场景b)   │  (场景c)   │  (场景d)   │        │
│  └────────────┴────────────┴────────────┴────────────┘        │
│                 前端：React + Vite + Ant Design                │
├────────────────────────────────────────────────────────────────┤
│                REST API 层：Node.js + Express                  │
│          （认证 / 鉴权 / 业务逻辑 / 数据校验 / 定时任务）        │
├────────────────────────────────────────────────────────────────┤
│                   统一数据底座（SQLite）                        │
│  客户主数据 │ 团队主数据 │ 店铺数据表现 │ 商机/跟进 │ 服务记录   │
│  广告数据  │ 续约预警   │ 人事报表     │ 同步日志               │
├────────────────────────────────────────────────────────────────┤
│                        数据接入层                              │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐    │
│  │ 浏览器插件      │ │ OKKI / CRM    │ │ Excel 批量导入  │    │
│  │ (采集商家后台)  │ │ (Leads 同步)   │ │ (人事/历史数据) │    │
│  └────────────────┘ └────────────────┘ └────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

### 2.1 架构原则

1. **统一数据底座**：客户档案是唯一主数据（ID 全局唯一），四大场景共享，杜绝数据孤岛。
2. **场景解耦**：四个场景以模块方式挂载在统一底座上，可独立迭代、独立上线。
3. **轻量可维护**：无专职开发团队，选型以"AI 可维护、部署简单、成本低"为第一优先级。
4. **数据可追溯**：所有外部采集数据记录来源与同步日志，支持对账。

---

## 3. 四大场景模块设计

### 3.1 场景 a：运营中台育商服务

**用户**：运营中台运营人员、客户经理

**功能清单**：

| 功能 | 说明 |
|---|---|
| 客户总览看板 | 客户列表 + 核心指标（曝光/点击/询盘/TM/订单/GMV/广告消耗），支持筛选、排序、搜索 |
| 客户详情页 | 单客户全维度数据：近 30 天趋势、环比同比、TOP 产品、询盘质量、广告投放 |
| 数据表现对比 | 与同行/同行业均值对标（数据来源：商家后台行业数据或预设基准） |
| 客户健康分层 | 按数据表现自动分层：健康 / 关注 / 预警 / 沉默，驱动育商优先级 |
| 育商动作留痕 | 服务记录（电话/上门/培训/方案），形成客户服务时间线 |
| 月度育商报告 | 一键生成客户月度数据报告（HTML），用于客户沟通 |

**关键指标**：询盘数、TM 咨询数、曝光量、点击量、点击率、订单数、成交额、广告消耗、ROI。

### 3.2 场景 b：重资产团队 T3/T6 续约支持 + 售卖机会

**用户**：重资产团队（续约顾问）、销售管理层

**功能清单**：

| 功能 | 说明 |
|---|---|
| T3/T6 续约面板 | 按续约窗口列出客户：到期日倒排、剩余天数、套餐金额、客户经理、数据表现摘要 |
| 续约预警分级 | 红（<30 天）/ 橙（30~60 天）/ 黄（60~90 天），每日自动更新 |
| 续约数据包 | 每个续约客户的历史数据表现（用于续约谈判的"成绩单"） |
| 售卖机会识别 | 规则引擎扫描：未开通 P4P/问鼎/顶展、广告消耗低但流量潜力大、店铺星级低等信号 → 生成机会清单 |
| 机会管理 | 机会类型（广告/产品/服务）、预估金额、跟进人、状态（待跟进/洽谈中/已成交/已关闭） |
| 续约目标看板 | 本月/本季续约目标 vs 实际，漏斗视图 |

**售卖机会规则示例**（v1 可配置）：

- 客户未开通 P4P 且月曝光 > X → 广告售卖机会
- 客户广告消耗 < Y 元/月 且询盘占比高 → 加投机会
- 客户星级 < 3 星且产品数 < N → 服务产品机会
- 客户未购买问鼎/顶展 → 品牌广告机会

### 3.3 场景 c：新签团队客户跟进

**用户**：新签销售、销售主管

**功能清单**：

| 功能 | 说明 |
|---|---|
| Leads 管理 | 录入/导入 leads：来源（展会/转介绍/地推/线上/OKKI）、联系方式、行业、意向 |
| Leads 分配 | 主管分配 leads 给销售，支持抢单/自动轮询规则 |
| 销售漏斗 | 阶段：初步接触 → 需求挖掘 → 方案报价 → 商务谈判 → 签单 → 已流失 |
| 跟进记录 | 每次跟进的时间线（电话/拜访/微信/邮件），下次跟进提醒 |
| 商机管理 | 关联金额、预计签单时间、竞争情况 |
| 签单转化 | 签单后一键生成客户档案（衔接场景 a/b），记录首年金额与合同期 |
| 团队看板 | 销售个人/团队漏斗转化率、签单排行、leads 响应时效 |

**OKKI 对接**：见第 7 节。

### 3.4 场景 d：后端人事行政

**用户**：人事、行政、财务

**功能清单**：

| 功能 | 说明 |
|---|---|
| 员工花名册 | 部门、岗位、入职/离职日期、状态（在职/试用/离职） |
| KPI 报表 | 运营/销售岗位 KPI 数据汇总（复用已有 KPI 考核方案口径） |
| 行政数据汇总 | 考勤、费用报销、办公用品等汇总表（Excel 导入 + 系统统计） |
| 报表导出 | 各类汇总报表导出 Excel/CSV |

---

## 4. 数据模型设计（核心表结构）

### 4.1 ER 总览

```
team_members ──┬──< customers（客户主数据：客户经理/团队归属）
               └──< opportunities（商机：跟进人）
customers ──< store_stats（店铺数据表现，按月/日）
customers ──< ad_stats（广告数据）
customers ──< service_records（育商服务记录）
customers ──< renewal_snapshots（续约预警快照）
opportunities ──< opportunity_activities（跟进记录）
opportunities ──< customers（签单后关联创建）
admin_reports（人事行政报表）
data_sync_logs（采集/导入日志）
```

### 4.2 表结构定义（SQLite DDL 摘要）

```sql
-- 员工/团队成员
CREATE TABLE team_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,          -- 运营/续约/新签销售/人事/行政/管理层
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
CREATE TABLE customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name  TEXT NOT NULL,          -- 客户公司名（中文）
  company_en    TEXT,                   -- 英文名（国际站主体）
  store_id      TEXT UNIQUE,            -- 国际站店铺 ID（如 cdyzbg）
  industry      TEXT,                   -- 行业/类目
  plan_type     TEXT,                   -- 套餐：出口通/金品诚企
  plan_amount   REAL,                   -- 年费金额（元）
  sign_date     TEXT,                   -- 签约日期
  expire_date   TEXT,                   -- 到期日期（续约预警依据）
  status        TEXT DEFAULT 'active',  -- active/expiring/expired/churned
  owner_id      INTEGER,                -- 客户经理（team_members.id）
  team_scope    TEXT,                   -- 归属团队：运营中台/重资产/新签
  source        TEXT,                   -- 来源：新签/续约/转介绍/展会
  remark        TEXT,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 店铺数据表现（按月汇总，插件采集）
CREATE TABLE store_stats_monthly (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL,
  month        TEXT NOT NULL,           -- 'YYYY-MM'
  exposure     INTEGER,                 -- 曝光
  clicks       INTEGER,                 -- 点击
  click_rate   REAL,                    -- 点击率
  inquiries    INTEGER,                 -- 询盘数
  tm_contacts  INTEGER,                 -- TM 咨询
  orders       INTEGER,                 -- 订单数
  gmv          REAL,                    -- 成交额
  ad_spend     REAL,                    -- 广告消耗
  ad_roi       REAL,                    -- 广告 ROI
  data_source  TEXT,                    -- 采集来源：plugin/manual/import
  synced_at    TEXT,
  UNIQUE(customer_id, month)
);

-- 广告数据（按月，按广告类型）
CREATE TABLE ad_stats_monthly (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL,
  month        TEXT NOT NULL,
  ad_type      TEXT NOT NULL,           -- P4P标准推/全站推FSP/品牌广告(问鼎顶展)
  spend        REAL,
  impressions  INTEGER,
  clicks       INTEGER,
  ctr          REAL,
  cost_per_click REAL,
  conversions  INTEGER,
  UNIQUE(customer_id, month, ad_type)
);

-- 育商服务记录
CREATE TABLE service_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL,
  member_id    INTEGER,                 -- 执行人
  record_date  TEXT,
  service_type TEXT,                    -- 电话回访/上门/培训/方案/装修/其他
  content      TEXT,
  next_action  TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- 商机（新签场景）
CREATE TABLE opportunities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_source  TEXT,                    -- 展会/转介绍/地推/线上/OKKI
  company_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_wechat TEXT,
  industry     TEXT,
  stage        TEXT DEFAULT 'initial',  -- initial/need/quote/negotiate/won/lost
  amount       REAL,                    -- 预估/合同金额
  owner_id     INTEGER,                 -- 跟进销售
  expected_date TEXT,                   -- 预计签单日期
  won_date     TEXT,                    -- 签单日期
  customer_id  INTEGER,                 -- 签单后关联客户档案
  remark       TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  updated_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- 商机跟进记录
CREATE TABLE opportunity_activities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL,
  member_id    INTEGER,
  activity_date TEXT,
  activity_type TEXT,                   -- 电话/拜访/微信/邮件/报价
  content      TEXT,
  next_follow_date TEXT,                -- 下次跟进日期（提醒）
  created_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- 续约预警快照（每日任务生成，供 T3/T6 面板查询）
CREATE TABLE renewal_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL,
  snapshot_date TEXT,                   -- 'YYYY-MM-DD'
  expire_date  TEXT,
  days_left    INTEGER,
  window_type  TEXT,                    -- T3/T6
  alert_level  TEXT,                    -- red/orange/yellow
  plan_amount  REAL,
  owner_id     INTEGER,
  status       TEXT DEFAULT 'open',     -- open/following/done/lost
  UNIQUE(customer_id, snapshot_date)
);

-- 人事行政报表（Excel 导入/系统生成）
CREATE TABLE admin_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type  TEXT,                    -- staff/kpi/attendance/expense
  period       TEXT,                    -- 'YYYY-MM'
  member_id    INTEGER,
  metrics_json TEXT,                    -- 指标 JSON（灵活扩展）
  imported_at  TEXT DEFAULT (datetime('now','localtime'))
);

-- 数据同步日志（插件采集/导入审计）
CREATE TABLE data_sync_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT,                    -- plugin/okki/excel
  customer_id  INTEGER,
  sync_type    TEXT,                    -- store_stats/ad_stats/leads/staff
  status       TEXT,                    -- success/failed
  message      TEXT,
  synced_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 3级类目行业数据（TOP诊断 / 行业门户插件采集，v0.3 新增）
CREATE TABLE industry_stats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  industry     TEXT NOT NULL,           -- 3级类目名
  month        TEXT NOT NULL,           -- 'YYYY-MM'
  store_count  INTEGER,                 -- 行业店铺数
  avg_exposure REAL,                    -- 效果均值：曝光
  avg_clicks   REAL,
  avg_inquiries REAL,
  avg_orders   REAL,
  avg_gmv      REAL,
  data_source  TEXT,                    -- top_diagnosis / industry
  synced_at    TEXT,
  UNIQUE(industry, month, data_source)
);

-- AWB 售卖数据（插件采集，v0.3 新增）
CREATE TABLE awb_stats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  month         TEXT NOT NULL,
  metric        TEXT NOT NULL,          -- AWB售卖数/渗透率/覆盖率
  value         REAL,
  unit          TEXT,
  source_detail TEXT,
  synced_at     TEXT,
  UNIQUE(month, metric)
);

-- 客户 sync_token（插件采集鉴权，v0.3 新增，见 customers 表 sync_token 列）
```

---

## 5. T3/T6 续约预警机制设计

### 5.1 定义（已确认口径）

- **T3**：`expire_date` 在 `(today, today + 3个月]` 的客户。
- **T6**：`expire_date` 在 `(today, today + 6个月]` 的客户。
- 关系：T3 ⊆ T6，同一客户可同时出现在两个列表，T3 优先级更高。

### 5.2 预警分级

| 等级 | 剩余天数 | 颜色 | 动作建议 |
|---|---|---|---|
| 红 red | ≤ 30 天 | 红 | 本周必须触达，续约谈判 |
| 橙 orange | 31~60 天 | 橙 | 两周内触达，准备续约方案 |
| 黄 yellow | 61~90 天（T3）| 黄 | 月度触达，铺垫价值 |
| 蓝 blue | 91~180 天（T6）| 蓝 | 季度触达，建立关系 |

### 5.3 生成机制

- 每日定时任务（node-cron）扫描 `customers`，为窗口内客户写入 `renewal_snapshots` 快照。
- 面板读取当日快照；历史快照用于复盘（预警覆盖率、续约转化）。
- 续约状态流转：open（预警）→ following（已跟进）→ done（已续约）→ lost（流失）。

### 5.4 续约数据包

每个 T3/T6 客户详情页自动聚合：近 12 个月数据表现（曝光/询盘/订单/GMV 趋势）、广告投入产出、服务记录——形成续约谈判"成绩单"。

---

## 6. 浏览器插件采集方案（v0.3 完整设计）

### 6.1 定位

运营/客户经理在客户授权后，登录阿里内部看板（FBI / DeepInsight），由 Chrome 插件自动拦截看板数据请求并回传渠道中心。**只读采集，不修改任何数据。**

### 6.2 数据源与采集内容（已确认 5 源）

| # | 报告类型 | 页面 | 采集内容 | 入库表 |
|---|---|---|---|---|
| 1 | customer_data | deepinsight.alibaba-inc.com（reportId=D2019080500161401000000832264） | 客户数据：曝光/点击/询盘/TM/订单/GMV/广告消耗/ROI | store_stats_monthly |
| 2 | p4p_brand_ads | fbi.alibaba-inc.com id=1184441 | P4P 与品牌广告：按类型（标准推/全站推/品牌广告）消耗/展现/点击/转化 | ad_stats_monthly |
| 3 | top_diagnosis | fbi.alibaba-inc.com id=1511201 | TOP 诊断：3级类目行业数据 + 单店铺 vs 行业均值 | industry_stats |
| 4 | awb | fbi.alibaba-inc.com id=1936890 | AWB 售卖及渗透：售卖数/渗透率/覆盖率 | awb_stats |
| 5 | industry | deepinsight.alipay.com 门户 | 3级类目行业店铺数与效果均值 | industry_stats |

### 6.3 采集机制（参考既有 P4P 脚本验证过的链路）

**核心原理：拦截页面 API 响应而非 DOM 抓取**——看板数据由前端 fetch 请求产生，在 `document_start` 阶段包裹 `window.fetch` 与 `XMLHttpRequest`，捕获数据响应并解析表格结构。

| 采集器 | 拦截规则 | 解析结构 |
|---|---|---|
| fbi_widget（FBI 看板） | URL 含 `WidgetAction` | `{ data: { value: { columns[], values[][] } } }` → 列名取 cells[1].props.label |
| deepinsight（DeepInsight 门户） | JSON 数据接口关键词 | 递归查找 `columns + values/data` 结构（深度 ≤8，最多 10 表） |

### 6.4 插件架构

```
看板页面（FBI / DeepInsight）
    │ content/injector.js（document_start 注入，all_frames）
    │   ├─ 包裹 fetch / XHR → 拦截数据响应
    │   ├─ 按 URL 匹配数据源（config/sources.js）→ 解析表格
    │   └─ chrome.runtime.sendMessage（CB_CAPTURED）
    ▼
background/service-worker.js
    ├─ 按报告类型累积（storage.local pending）
    ├─ 防抖 8 秒合并
    └─ fetch POST → 渠道中心 /api/sync/plugin（x-sync-token 鉴权）
    ▼
渠道中心后端（routes/sync.js）
    ├─ 校验 token → 匹配客户（store_id 一致性）
    ├─ syncParser.js 列名模糊匹配解析（容忍"曝光量/总曝光"等列名变化）
    └─ 分类型入库 + data_sync_logs 审计
```

### 6.5 插件 UI

- **popup**：显示当前页数据源、已捕获表格数、配置状态、最近上传结果；一键"立即采集并上传"
- **options**：渠道中心地址（apiBase）、店铺 ID（store_id）、sync_token、自动上传开关；配置存 `chrome.storage.sync`
- 触发方式：自动（捕获即上传，可关）+ 手动（popup 按钮）

### 6.6 服务端解析与字段映射（syncParser.js）

列名包含匹配（模糊），支持"万/亿/k"单位换算、百分比处理：

| 报告 | 关键映射 |
|---|---|
| customer_data | 曝光/点击/询盘/TM咨询/订单/GMV/广告消耗/ROI → store_stats_monthly（按月 upsert） |
| p4p_brand_ads | 行内广告类型（标准推广→P4P标准推、全站推→全站推FSP、品牌/问鼎/顶展→品牌广告）→ ad_stats_monthly |
| top_diagnosis / industry | 每行一类目：店铺数、平均曝光/点击/询盘/订单/GMV → industry_stats（类目+月份 upsert） |
| awb | 指标行：AWB售卖数/渗透率/覆盖率 → awb_stats |

### 6.7 安全与合规

- 鉴权：每客户 `sync_token`（管理员生成，32 位随机 hex），请求头 `x-sync-token`，服务端校验后按 `store_id` 关联客户，store_id 不一致拒绝（403）；
- 仅采集业务指标，不采集密码、Cookie 等敏感信息；
- 采集留痕（data_sync_logs：来源/报告/状态/解析日志），支持审计与对账；
- 传输：HTTPS（生产），CORS 放行扩展来源；
- 客户授权声明：渠道商与客户服务协议中约定数据使用范围。

### 6.8 已知限制与后续增强

- 看板页面结构变化可能导致列名不匹配 → 解析日志可定位，更新 syncParser 映射即可（无需发插件版本）；
- 定时采集（alarms 每日自动打开页面采集）为后续增强项；
- DeepInsight 部分报告需手动切换 TAB 触发请求后插件方可捕获（页面加载完成 4 秒后自动上报一次已有数据）。

---

## 7. OKKI / CRM 对接方案

### 7.1 现状

新签 leads 与商机在 OKKI 系统中管理。对接目标：将 leads/商机同步到渠道中心，统一跟进视图。

### 7.2 对接策略（分两步）

| 阶段 | 方案 | 说明 |
|---|---|---|
| 第一步（先行） | OKKI 导出 CSV → 系统导入 | 不依赖 OKKI 开放 API 权限，快速打通 |
| 第二步（进阶） | OKKI 开放平台 API 定时同步 | 需确认 OKKI API 权限（账号/密钥），实现自动双向同步 |

### 7.3 字段映射（OKKI → 渠道中心）

| OKKI 字段 | 渠道中心字段 |
|---|---|
| 客户/线索名称 | opportunities.company_name |
| 联系人 | contact_name / contact_phone / contact_wechat |
| 来源 | lead_source |
| 跟进阶段 | stage（映射到本系统五阶段） |
| 预计金额 | amount |
| 下次跟进时间 | opportunity_activities.next_follow_date |
| 负责人 | owner_id（按姓名匹配 team_members） |

### 7.4 导入流程

```
OKKI 导出 CSV ──> 系统导入页（字段映射预览/校验）──> opportunities 表
                                                    └──> data_sync_logs（审计）
```

---

## 8. 分阶段实施路线图

| 阶段 | 周期 | 交付内容 | 里程碑验收 |
|---|---|---|---|
| Phase 0 项目骨架 | 1 周 | 全栈骨架、数据库 schema、登录与权限、基础布局 | 前后端可运行，能登录 |
| Phase 1 运营看板 | 2~3 周 | 客户列表/详情、数据表现看板、健康分层、服务记录、插件 v1 采集 | 运营可用真实数据看板 |
| Phase 2 续约与售卖 | 2 周 | T3/T6 面板、预警分级、售卖机会规则引擎、续约数据包 | 重资产团队替换手工表 |
| Phase 3 新签跟进 | 2~3 周 | Leads/商机/跟进/漏斗、OKKI 导入、签单转客户 | 新签团队全流程上线 |
| Phase 4 后端与上线 | 1~2 周 | 人事行政模块、Excel 导入、部署上线、备份策略 | 全公司投入使用 |

**依赖关系**：Phase 1 依赖 Phase 0；Phase 2 依赖 Phase 1 的客户与数据底座；Phase 3 与 Phase 2 可并行；Phase 4 依赖前序各模块稳定。

---

## 9. 部署方案

### 9.1 服务器要求

- 云服务器：Linux（Ubuntu 22.04+），2C4G 起步，带宽 5Mbps（内网使用可更低）
- 域名 + HTTPS 证书（Let's Encrypt 免费）

### 9.2 部署架构

```
客户端浏览器
    │ HTTPS
    ▼
Nginx（反向代理 + 静态托管前端构建产物 + SSL 终止）
    │ 反向代理 /api → 
    ▼
Node.js 服务（PM2 守护，端口 3000）
    │
    ▼
SQLite 单文件数据库（每日备份到 OSS/异地）
```

### 9.3 运维要点

- 进程管理：PM2（开机自启、崩溃重启、日志轮转）；
- 数据库备份：每日 cron 执行 `sqlite3 .backup` + 保留 30 天；
- 升级流程：git pull → 构建前端 → pm2 reload；
- 迁移预案：SQLite 数据量增长后可平滑迁移 PostgreSQL（schema 已按标准 SQL 设计）。

---

## 10. 项目目录结构

```
channel-brain/
├── docs/                 # 设计文档（本文件）
├── server/               # 后端 Node.js + Express + SQLite
│   ├── src/
│   │   ├── index.js      # 入口
│   │   ├── db.js         # 数据库连接与初始化
│   │   ├── schema.sql    # 建表语句
│   │   ├── seed.js       # 种子数据
│   │   ├── routes/       # API 路由（customers/stats/renewals/opportunities/...）
│   │   ├── services/     # 业务逻辑（续约预警/售卖机会规则）
│   │   └── jobs/         # 定时任务（每日快照）
│   ├── package.json
│   └── data/             # SQLite 数据文件（gitignore）
├── web/                  # 前端 React + Vite + Ant Design
│   ├── src/
│   │   ├── pages/        # 四大场景页面
│   │   ├── components/   # 通用组件
│   │   ├── api/          # API 客户端
│   │   └── App.jsx
│   └── package.json
├── extension/            # 浏览器插件（Chrome MV3）
│   ├── manifest.json
│   ├── content/          # 页面采集脚本
│   ├── background/       # 后台服务
│   └── config/           # 采集选择器配置
└── deploy/               # 部署脚本（nginx/pm2/backup）
```

---

## 11. 知识库模块设计（v0.2 新增）

### 11.1 定位

渠道商内部资料统一管理：激励规则、平台规则、产品资料、流程制度、话术模板、培训资料。解决资料散落网盘/微信群、版本混乱、无法追溯"某时点生效版本"的问题。

### 11.2 分类体系

默认六类（可扩展）：**平台规则 / 激励政策 / 产品资料 / 流程制度 / 话术模板 / 培训资料**。

### 11.3 核心能力

| 能力 | 说明 |
|---|---|
| 版本管理 | 文档可迭代版本（v1→v2→…），历史版本完整保留，附版本说明（如"2026 激励规则更新"） |
| 附件 | 支持 PDF/Word/Excel/图片 等（单文件 ≤50MB，存储于 server/data/uploads/） |
| 检索 | 标题/摘要/正文全文搜索 |
| 生命周期 | 发布 → 归档下架（归档后列表不可见，历史版本仍可追溯） |
| 权限分级 | 查看（全员）→ 上传/新版本（knowledge.upload：运营/管理层/管理员）→ 分类与归档管理（knowledge.manage：管理层/管理员） |

### 11.4 表结构

`knowledge_categories`（分类）/ `knowledge_docs`（文档主表，含当前版本）/ `knowledge_versions`（版本历史）——见 schema.sql。

### 11.5 后续增强

- 附件内容全文检索（解析 PDF/Word 正文）
- 新版本发布通知（订阅者提醒）
- 置顶/推荐、阅读统计

---

## 12. 角色权限体系（RBAC）（v0.2 新增）

### 12.1 模型："岗位角色 + 数据范围"两级

- **功能级**：角色 → 权限点（菜单/操作），控制"能不能进这个模块、能不能做这个操作"；
- **行级**：数据范围（all / team / self），控制"能看到哪些数据行"（客户、商机按负责人过滤）。

比单一角色字段的优势：同一角色在不同数据范围下含义清晰；权限点可组合，新增角色无需改代码。

### 12.2 权限矩阵（7 角色 × 17 权限点）

| 权限点 | admin | boss | ops | renewal | sales_manager | sales | hr |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| dashboard.view 经营总览 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| customer.view / create / edit / service | ✓ | ✓ | ✓ | — | view | — | — |
| renewal.view / manage | ✓ | ✓ | view | ✓ | — | — | — |
| opportunity.view / create / edit / win | ✓ | ✓ | — | — | ✓ | ✓ | — |
| knowledge.view / upload / manage | ✓ | ✓ | view+upload | view | view | view | view |
| staff.view / manage | ✓ | ✓ | — | — | — | — | view |
| system.manage | ✓ | — | — | — | — | — | — |
| **数据范围 data_scope** | all | all | all | all | **team** | **self** | all |

### 12.3 实现要点

- 表：`roles` / `permissions` / `role_permissions`；用户通过 `users.role_id` 绑定角色；
- 登录时 JWT 携带 `permissions` + `data_scope`，前端据此渲染菜单（隐藏无权限入口）并做路由守卫（403）；
- 后端中间件：`requirePermission(code)` 功能级校验、`scopeFilter(alias, user)` 行级过滤（all 无过滤 / team 本团队 / self 仅本人）；
- 客户与商机的列表/详情/统计接口均已接入行级过滤；知识库、续约等按功能权限控制。

### 12.4 扩展方式

新增角色：`roles` 表加行 + `role_permissions` 关联权限点；新增权限点：`permissions` 表加行并分配；前端菜单项加 `permission` 字段即可自动过滤。

---

## 13. 售卖机会规则引擎（v0.4 新增，场景 b 核心）

### 13.1 定位

重资产团队的售卖自动化：根据客户数据表现与广告开通情况，自动识别"广告冷启动 / P4P 加投 / 品牌广告 / 全站推 / 数据改善服务"等售卖机会，生成机会清单供续约顾问跟进。**规则可配置、不写死代码**，运营可自行调整阈值与组合。

### 13.2 规则定义（sell_rules）

| 字段 | 说明 |
|---|---|
| name / opportunity_type | 规则名 + 机会类型（ad_new/ad_add/brand_ad/fsp/service） |
| conditions | JSON：`{logic: AND\|OR, conditions: [{field, op, value}]}` |
| estimated_min/max | 预估金额区间（机会展示与汇总） |
| priority / enabled | 优先级 / 启停开关 |

运算符：`eq / neq / gt / gte / lt / lte / is_true / is_false / contains`。

### 13.3 字段池（引擎自动从数据组装画像）

客户档案（套餐/行业/剩余到期天数）+ 最新月店铺数据（曝光/点击/点击率/询盘/TM/订单/GMV/广告消耗/ROI）+ 近 3 月广告开通与消耗（has_p4p/has_fsp/has_brand、各类型月消耗）+ 数据月份数。**数据来自插件采集**——规则引擎是采集数据的消费者。

### 13.4 执行流程（每日 01:00 自动 + 手动触发）

```
遍历规则（含禁用规则）× 活跃客户（排除流失/过期）
├─ 命中 → upsert 机会（UNIQUE(rule_id, customer_id)）
│     ├─ 新机会 → open
│     └─ 已存在 → 更新内容；won/lost 保留业务状态，其余恢复 open
├─ 启用规则未命中 → 该规则下 open/following 机会标记 closed（条件不再满足）
└─ 禁用规则 → 关闭其全部进行中机会（记录保留，可追溯）
```

### 13.5 内置规则（seed，可编辑）

| 规则 | 条件 | 预估 |
|---|---|---|
| P4P 广告冷启动 | 未开通 P4P 且 月曝光 ≥ 50000 | 3000-8000 |
| P4P 加投 | 已开通 P4P 且 月消耗 < 5000 且 月询盘 ≥ 80 | 5000-12000 |
| 品牌广告（问鼎/顶展） | 未购买品牌广告 且 月曝光 ≥ 100000 | 20000-50000 |
| 全站推（FSP） | 未开通全站推 且 月点击 ≥ 3000 | 5000-10000 |
| 数据改善服务 | 数据月份 ≤ 2 且 月曝光 ≤ 30000 | 5000-15000 |

### 13.6 前端

售卖机会页面双 Tab：**机会列表**（类型/客户/预估区间/状态流转/负责人分配，顶部统计卡）+ **规则管理**（启停开关、动态条件表单编辑、手动扫描）。

### 13.7 续约 × 售卖机会联动（v0.8 已落地）

**双向打通**：续约顾问在 T3/T6 面板直接看到客户的售卖机会，续约谈判时打包售卖；售卖机会列表显示客户续约窗口背景。

| 联动点 | 实现 |
|---|---|
| 续约面板"售卖机会"列 | 每客户 open/following 机会数与预估金额合计（红色高亮） |
| 续约数据包 Drawer | 点击客户行 → 抽屉聚合：客户档案 + 续约窗口 + 售卖机会列表（可直接改状态）+ 近 6 月数据表现 + 服务记录——续约谈判"一张图" |
| 售卖机会"续约窗口"列 | 每条机会标注客户 T3/T6 窗口与剩余天数（T3 红 / T6 蓝），机会跟进时知道续约背景 |
| 数据源 | GET /api/renewals/package/:customerId 聚合接口；panel/sell 列表接口增强字段 |

### 13.8 后续增强

- 机会跟进记录（类似商机 activity）；
- 规则命中审计与 A/B 效果对比（规则命中 → 成交转化率）。

---

## 14. 过程记录与绩效验证（v0.5 新增，场景 a 核心）

### 14.1 需求本质

运营的"**动作 → 结果**"闭环管理：动作（如调 P4P 把日均消耗从 100 提到 200）→ 立目标 → 事后回验实际数据 → 判定达标。运营的工作价值有了可验证依据，绩效考核从"做了事"升级为"做出了效果"。

### 14.2 各岗位适用性（已分析确认）

| 岗位 | 动作 → 结果 | 现状 | 处理 |
|---|---|---|---|
| 运营中台 | 优化广告/关键词/装修 → 消耗/曝光/询盘变化 | 仅简单服务记录 | **已实现**（work_logs） |
| 新签销售 | 跟进/报价 → 签单 | 商机+跟进记录，签单即闭环 | 已有，不重复建设 |
| 续约顾问 | 触达/方案/谈判 → 续约/售卖成交 | 续约面板+售卖机会状态已闭环 | 结果已有；过程动作后续复用同一机制 |
| 人事行政 | 招聘/报表 → 难量化 | — | 过程性工作，暂缓 |

### 14.3 数据模型（work_logs）

| 字段 | 说明 |
|---|---|
| customer_id / member_id | 客户 + 执行人（运营） |
| action_type | 广告优化/关键词优化/店铺装修/产品发布/培训/活动/其他 |
| metric_type | 目标指标：p4p_daily_spend(日均消耗)/exposure/clicks/inquiries/gmv/ctr |
| baseline_value / target_value | 基线值（动作前）→ 目标值 |
| target_date | 回验日期 |
| status | active(进行中)/achieved(达标)/missed(未达标)/closed(关闭) |
| actual_value / verified_at / verify_note | 回验实际值/时间/备注 |

### 14.4 回验机制

到回验日期后运营填写实际值 → 系统自动判定：**实际 ≥ 目标 → 已达标，否则未达标**（鼓励复盘备注）。回验后的数据形成"动作 → 结果"证据链，管理层可在绩效排行中横向对比运营效能（动作数/达标率）。

### 14.5 前端

- **运营工作台**（ops 角色，菜单）：过程记录列表（基线→目标→实际展示、状态流转、回验操作）+ 运营绩效排行（按执行人统计动作数/达标/未达标/达标率）
- **客户详情页**：新增"过程记录"页签，单客户视角查看

### 14.6 指标持续监控预警（v0.6 已落地）

**需求本质**：运营设定监控（如"客户 X 的 P4P 日均消耗不低于 200"），系统持续监控，**跌破即告警**，提醒运营干预——"一直监控不要降下来，降下来就提示"。

| 要素 | 实现 |
|---|---|
| 监控规则 metric_monitors | 客户 + 指标类型 + 目标值 + 比较符（gte 不低于 / lte 不高于）+ 说明 |
| 指标取值 metrics.js | 公共能力：p4p_daily_spend = ad_stats 最新月 P4P 消耗 ÷ 当月天数；其余取 store_stats 最新月字段 |
| 检查触发 | 插件数据同步入库后**即时检查该客户** + 每日 00:20 全量 + 手动"立即检查" |
| 告警 metric_alerts | 跌破 → 生成 open 告警（同监控 open 告警不重复刷屏；处理后可再触发） |
| 告警处理 | 运营填干预说明 → handled（附处理人/时间） |
| 前端 | 运营工作台"指标监控"Tab（红色角标显示待处理数）+ 新增监控 + 处理 |
| 回验自动带出 | 回验弹窗打开时自动从采集数据带出实际值（可修改），减少人工查数 |
| 钉钉推送 | 跌破目标（⚠️ 红色）与指标下降（📉 黄色）自动推送到钉钉群 |

### 14.8 钉钉推送（v0.7 已落地）

**触发规则（双触发）**：

| 场景 | 判定 | 推送 |
|---|---|---|
| 客户指标异常（跌破） | 监控指标跌破目标（实际 < 目标） | ⚠️ 客户指标异常：客户/指标/目标/实际/干预建议 |
| 指标下降 | 未跌破但较上期下降（本期 < 上期） | 📉 客户指标下降提醒：客户/指标/上期/本期 |

**实现要点**：
- 钉钉群机器人 webhook + 可选加签（HMAC-SHA256，timestamp+sign 参数）+ 可选 @ 手机号；
- 推送时机与监控检查一致：插件数据同步入库后即时 + 每日 00:20 + 手动触发；
- 去重：跌破告警同监控 open 不重复；下降提醒同监控当日不重复；推送失败不阻塞主流程；
- 配置：系统设置页（仅管理员）保存 webhook/secret/开关/at 手机号，支持发送测试消息；
- 安全：secret 掩码存储，不落明文日志。

### 14.9 后续增强

- 续约顾问动作记录复用同一机制（action_type 扩展续约动作）；
- 监控目标与过程记录联动（达标记录自动转为监控规则）；
- 推送渠道扩展（飞书/企业微信/短信）。

---

## 15. 目标与达成（业绩指标 & 营收任务，v0.9 新增）

### 15.1 定位

渠道公司两级业绩管理：
- **渠道营收任务**：年度/季度营收目标 + 分来源拆解（新签营收/订单数、老客户、AWB、广告）达成监控；
- **中台运营业绩**：广告维度（新签 2 万 P 消耗客户数、广告产品关注）与育商维度（新商里程碑、大盘达标线、续签率）指标达成。

### 15.2 指标口径（自动计算，可在目标配置中调整）

| 指标 | 口径 |
|---|---|
| 新签贡献营收 | 周期内 stage=won 商机合同金额合计 |
| 新签贡献订单数 | 周期内 won 商机数量 |
| 老客户贡献 | 周期内续约成功客户（snapshot done）年费合计 |
| 广告贡献 | 周期内广告消耗合计（口径可调） |
| AWB 贡献 | 周期内付款成功客户数 × 单价（awb_unit_price 配置；单价未配置时提示"营收待确认"）——付款客户明细来自插件采集 AWB"售卖客户明细"TAB |
| 新签 2 万 P 打包客户 | customers.p_package_amount>0 的客户数（目标）+ 使用监控（每人 P4P 累计消耗/使用率/未使用·使用中·用满） |
| 新商里程碑 | 按 sign_date 计算考核人群（签约满 N 天），达成率=达成客户/应考核客户；P 消耗取 ad_stats、订单取 store_stats、**30 天品数/120 天优爆品取 product_stats**（金品优爆品≥50/其他≥20）、**180 天 GMV 取 store_stats（生意参谋 GMV 为美金口径，无需汇率换算）** |
| 续签率 | 到期客户中 done/(done+lost)；首次年/多年区分需补充续约次数数据 |

> 口径说明（2026-08-22 用户确认）：生意参谋 GMV 本身就是美金（国际站美元结算），**不做汇率换算**；"90 信保挂账订单金额"（deepinsight componentId=b542bc43）为**挂账数据（下单未实际收款）**，仅作参考字段（store_stats.pending_gmv），不参与达成目标。

### 15.3 数据缺口（待插件扩展采集或手动录入）

- 结构化商详、AI 知识库、市场热卖品（大盘达标线，用户已确认暂缓）
- 广告产品开通状态（无忧PLUS/超级充、省心版、AI智投、金品推工厂、千寻）
- 首次年/多年续签区分（需 customers.renewal_count 或续约记录）

### 15.4 实现

- goal_targets（目标配置，25 条预置）/ manual_actuals（手动实际值覆盖）
- goalEngine：autoActual 自动计算 + manual 覆盖；source 标注（自动计算/手动录入/待数据）
- GET /api/goals?category=&period= 达成查询；目标调整/手动录入 API（goal.manage）
- 前端"目标与达成"：渠道营收任务（周期切换+总进度+来源卡片）+ 中台运营业绩（广告/续签/里程碑/大盘）双 Tab

## 16. 待确认事项

1. **客户数量与数据量**：当前服务客户总数？决定插件采集并发与存储规划。
2. **OKKI API 权限**：是否有开放平台账号/密钥，决定第 7 节第二步是否可行。
3. **续约金额口径**：续约金额 = 年费金额？是否含增购（广告/产品）？
4. **广告售卖机会规则参数**：曝光阈值 X、消耗阈值 Y、产品数阈值 N 需运营确认。
5. **登录方式**：公司内部账号密码 or 对接钉钉/企业微信 SSO？
6. **服务器**：是否已有云服务器（阿里云 ECS？），操作系统要求。

---

## 17. 真实数据迁移（2026-08-28 已上线）

用 5 个真实 CSV 替换 seed 模拟数据，改造数据层 + 前端。

### 17.1 数据源（5 个 CSV，每日快照）

| CSV | 行数 | 入库表 |
|---|---|---|
| 商家运营明细 | 251 | snap_store（客户主档+续约+商品+P4P+信保挂账） |
| 180天新商明细 | 55 | snap_milestone（6 里程碑官方达标） |
| P4P消耗明细 | 201 | snap_ad（消耗+广告产品营收+活跃/流失+是否开P） |
| AWB购买明细 | 44 | awb_orders（订单流水，签约/付款金额） |
| AW成交营明细 | 12 | snap_camp（育商大盘：知识库/商详/热卖/买驱GMV） |

统一主键 `account_id`（admin_mbr_id = 会员ID = 登录主账号ID = member_id = 主账号ID），一个账号=一个客户。

### 17.2 核心口径

- 续约：T3=90天内（红≤30/橙31-60/黄61-90），T6=180天内（蓝）；叠加官方「提前续约状态」字段
- 营收：付款金额为主（签约金额看应收缺口）
- 开P率：新签客户是否开始使用 P4P（is_open_p=1），非累计消耗
- 里程碑：直接采信官方「达标状态/是否达5000」，不再自算（无汇率换算问题）

### 17.3 数据导入

- 目录：`~/Desktop/渠道数据导入/`（跨平台，默认取当前用户桌面），每天 09:00 定时扫描（node-cron）
- 编码：UTF-8 解码；AWB 公司名脱敏 → account_id 从 customers 回填
- 幂等：按 stat_date+account_id upsert + 文件 hash 去重（import_files）
- 历史：全量保留，永不删除，可查任意历史明细

### 17.4 行级隔离（v2）

`user_customer_binding`（用户↔客户经理姓名）+ `auth.dataScope(alias,user,db,field)`：
- all 不过滤（admin/boss/ops/renewal/hr）
- self/team 按绑定客户经理列表过滤（sales 只看名下）

### 17.5 售卖机会规则（真实字段 6 条）

续约加购 / 广告产品售卖 / 育商提升 / 充值续费 / 激活唤醒 / 金品开通。

---

*本文档为项目蓝图，随需求演进持续更新。*
