'use strict';

/**
 * 种子数据：团队 / 用户 / 客户 / 月度数据 / 广告数据 / 商机 / 服务记录
 * 运行：npm run seed（幂等，可重复执行）
 */

const crypto = require('crypto');
const { db, ensureSchema, initSchema } = require('./db');
const { hashPassword } = require('./auth');
const renewalService = require('./services/renewalService');
const ruleEngine = require('./services/ruleEngine');

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

function clearTables() {
  const tables = [
    'opportunity_activities', 'opportunities', 'service_records',
    'ad_stats_monthly', 'store_stats_monthly', 'renewal_snapshots',
    'admin_reports', 'data_sync_logs', 'knowledge_versions', 'knowledge_docs',
    'knowledge_categories', 'role_permissions', 'permissions', 'roles',
    'sell_opportunities', 'sell_rules', 'work_logs',
    'metric_alerts', 'metric_monitors',
    'manual_actuals', 'goal_targets',
    'awb_payments', 'product_stats',
    'customers', 'team_members', 'users',
  ];
  const tx = db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  });
  tx();
}

function fmtDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMonth(offsetMonths) {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function main() {
  ensureSchema();

  // 破坏性操作保护：seed 会清空全部业务表后重灌。
  // 若数据库已存在用户数据，默认中止，避免运维按文档重跑而误清空真实业务数据。
  const existingUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (existingUsers > 0 && process.env.SEED_FORCE !== '1') {
    console.error(
      `[seed] 检测到数据库已有数据（users 表 ${existingUsers} 行）。\n` +
      `        seed 会清空 customers / users / roles / opportunities / renewal_snapshots 等全部业务表，已中止。\n` +
      `        若确认要清空并重新灌入种子数据，请显式执行：SEED_FORCE=1 npm run seed`
    );
    process.exit(1);
  }

  clearTables();

  // ---- 团队成员 ----
  const members = [
    { name: '王总', role: '管理层', team: '管理层' },
    { name: '李运营', role: '运营', team: '运营中台' },
    { name: '张运营', role: '运营', team: '运营中台' },
    { name: '赵续约', role: '续约顾问', team: '重资产' },
    { name: '钱续约', role: '续约顾问', team: '重资产' },
    { name: '孙销售', role: '新签销售', team: '新签' },
    { name: '周销售', role: '新签销售', team: '新签' },
    { name: '吴人事', role: '人事', team: '后端' },
    { name: '郑行政', role: '行政', team: '后端' },
  ];
  const insMember = db.prepare('INSERT INTO team_members (name, role, team, phone, hire_date, status) VALUES (?, ?, ?, ?, ?, ?)');
  members.forEach((m, i) => insMember.run(m.name, m.role, m.team, `1380000${String(i + 1).padStart(4, '0')}`, fmtDate(-365 * (i + 1)), 'active'));

  const memberId = (name) => db.prepare('SELECT id FROM team_members WHERE name = ?').get(name).id;

  // ---- 角色与权限（RBAC）----
  const PERMISSIONS = [
    ['dashboard.view', '经营总览', 'dashboard'],
    ['customer.view', '客户查看', 'customer'],
    ['customer.create', '新增客户', 'customer'],
    ['customer.edit', '编辑客户', 'customer'],
    ['customer.service', '服务记录', 'customer'],
    ['renewal.view', '续约面板查看', 'renewal'],
    ['renewal.manage', '续约状态管理', 'renewal'],
    ['opportunity.view', '商机查看', 'opportunity'],
    ['opportunity.create', '新增商机', 'opportunity'],
    ['opportunity.edit', '编辑商机', 'opportunity'],
    ['opportunity.win', '签单操作', 'opportunity'],
    ['knowledge.view', '知识库查看', 'knowledge'],
    ['knowledge.upload', '知识库上传', 'knowledge'],
    ['knowledge.manage', '知识库管理', 'knowledge'],
    ['staff.view', '人事行政查看', 'staff'],
    ['staff.manage', '人事行政管理', 'staff'],
    ['sell.view', '售卖机会查看', 'sell'],
    ['sell.manage', '售卖机会管理', 'sell'],
    ['work.view', '过程记录查看', 'work'],
    ['work.create', '过程记录创建/回验', 'work'],
    ['goal.view', '目标与达成查看', 'goal'],
    ['goal.manage', '目标管理', 'goal'],
    ['system.manage', '系统管理', 'system'],
  ];
  const insPerm = db.prepare('INSERT INTO permissions (code, name, module) VALUES (?, ?, ?)');
  const permIds = {};
  for (const [code, name, module] of PERMISSIONS) {
    const info = insPerm.run(code, name, module);
    permIds[code] = info.lastInsertRowid;
  }

  const ROLES = [
    { code: 'admin', name: '系统管理员', scope: 'all', perms: PERMISSIONS.map((p) => p[0]) },
    { code: 'boss', name: '管理层', scope: 'all', perms: PERMISSIONS.filter((p) => p[0] !== 'system.manage').map((p) => p[0]) },
    { code: 'ops', name: '运营专员', scope: 'all', perms: ['dashboard.view', 'customer.view', 'customer.create', 'customer.edit', 'customer.service', 'renewal.view', 'work.view', 'work.create', 'goal.view', 'knowledge.view', 'knowledge.upload'] },
    { code: 'renewal', name: '续约顾问', scope: 'all', perms: ['dashboard.view', 'customer.view', 'renewal.view', 'renewal.manage', 'sell.view', 'goal.view', 'knowledge.view'] },
    { code: 'sales_manager', name: '销售主管', scope: 'team', perms: ['dashboard.view', 'opportunity.view', 'opportunity.create', 'opportunity.edit', 'opportunity.win', 'customer.view', 'knowledge.view'] },
    { code: 'sales', name: '新签销售', scope: 'self', perms: ['dashboard.view', 'opportunity.view', 'opportunity.create', 'opportunity.edit', 'opportunity.win', 'knowledge.view'] },
    { code: 'hr', name: '人事行政', scope: 'all', perms: ['dashboard.view', 'staff.view', 'knowledge.view'] },
  ];
  const insRole = db.prepare('INSERT INTO roles (code, name, data_scope, description) VALUES (?, ?, ?, ?)');
  const insRolePerm = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  const roleIds = {};
  for (const r of ROLES) {
    const info = insRole.run(r.code, r.name, r.scope, `${r.name}（数据范围：${r.scope === 'all' ? '全部' : r.scope === 'team' ? '本团队' : '仅本人'}）`);
    roleIds[r.code] = info.lastInsertRowid;
    for (const p of r.perms) insRolePerm.run(info.lastInsertRowid, permIds[p]);
  }

  // ---- 系统用户（绑定 RBAC 角色）----
  const users = [
    { username: 'admin', password: 'admin123', role: 'admin', roleCode: 'admin', member: '王总' },
    { username: 'boss', password: 'boss123', role: 'manager', roleCode: 'boss', member: '王总' },
    { username: 'ops', password: 'ops123', role: 'staff', roleCode: 'ops', member: '李运营' },
    { username: 'renewal', password: 'renewal123', role: 'staff', roleCode: 'renewal', member: '赵续约' },
    { username: 'sales', password: 'sales123', role: 'staff', roleCode: 'sales', member: '孙销售' },
    { username: 'salesmgr', password: 'mgr123', role: 'manager', roleCode: 'sales_manager', member: '周销售' },
    { username: 'hr', password: 'hr123', role: 'staff', roleCode: 'hr', member: '吴人事' },
  ];
  const insUser = db.prepare('INSERT INTO users (username, password_hash, member_id, role, role_id) VALUES (?, ?, ?, ?, ?)');
  for (const u of users) insUser.run(u.username, hashPassword(u.password), memberId(u.member), u.role, roleIds[u.roleCode]);

  // ---- 客户（覆盖 T3 红/橙/黄、T6 蓝、正常、过期）----
  const customers = [
    { company_name: '成都雅致办公家具', company_en: 'Chengdu Yazhi Office Furniture', store_id: 'cdyzbg', industry: '办公家具', plan_type: '金品诚企', plan_amount: 66800, expire_days: 20, owner: '李运营', source: '续约' },
    { company_name: '四川德信机械', company_en: 'Sichuan Dexin Machinery', store_id: 'scdxjx', industry: '工程机械', plan_type: '金品诚企', plan_amount: 66800, expire_days: 45, owner: '张运营', source: '新签', p_package: 20000 },
    { company_name: '成都锦城纺织品', company_en: 'Chengdu Jincheng Textile', store_id: 'cdjc fz', industry: '纺织服装', plan_type: '出口通', plan_amount: 36800, expire_days: 75, owner: '李运营', source: '续约' },
    { company_name: '重庆渝工液压', company_en: 'Chongqing Yugong Hydraulic', store_id: 'cgygyy', industry: '液压设备', plan_type: '金品诚企', plan_amount: 66800, expire_days: 120, owner: '张运营', source: '续约' },
    { company_name: '成都天府照明', company_en: 'Chengdu Tianfu Lighting', store_id: 'cdtfzm', industry: '照明灯具', plan_type: '出口通', plan_amount: 36800, expire_days: 160, owner: '李运营', source: '新签', p_package: 20000 },
    { company_name: '绵阳鸿运电子', company_en: 'Mianyang Hongyun Electronics', store_id: 'myhydz', industry: '消费电子', plan_type: '金品诚企', plan_amount: 66800, expire_days: 320, owner: '张运营', source: '新签', p_package: 20000 },
    { company_name: '乐山嘉州化工', company_en: 'Leshan Jiazhou Chemical', store_id: 'lsjzhg', industry: '化工原料', plan_type: '出口通', plan_amount: 36800, expire_days: -30, owner: '李运营', source: '续约' },
    { company_name: '宜宾五粮包装', company_en: 'Yibin Wuliang Packaging', store_id: 'ybwl bz', industry: '包装印刷', plan_type: '出口通', plan_amount: 36800, expire_days: 250, owner: '赵续约', source: '转介绍' },
  ];
  const insCustomer = db.prepare(`
    INSERT INTO customers (company_name, company_en, store_id, industry, plan_type, plan_amount, sign_date, expire_date, status, owner_id, team_scope, source, sync_token, p_package_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const custIds = {};
  for (const c of customers) {
    const signDays = c.expire_days - 365;
    const status = c.expire_days < 0 ? 'expired' : c.expire_days <= 90 ? 'expiring' : 'active';
    const info = insCustomer.run(c.company_name, c.company_en, c.store_id, c.industry, c.plan_type, c.plan_amount,
      fmtDate(signDays), fmtDate(c.expire_days), status, memberId(c.owner), '运营中台', c.source, genToken(), c.p_package || null);
    custIds[c.store_id] = info.lastInsertRowid;
  }

  // ---- 店铺月度数据（近 7 个月，主要客户）----
  const insStats = db.prepare(`
    INSERT OR REPLACE INTO store_stats_monthly
      (customer_id, month, exposure, clicks, click_rate, inquiries, tm_contacts, orders, gmv, ad_spend, ad_roi, data_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
  `);
  const genSeries = (base, growth) => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const f = 1 + growth * i;
      arr.push({
        exposure: Math.round(base.exposure * f),
        clicks: Math.round(base.clicks * f),
        inquiries: Math.round(base.inquiries * f),
        tm: Math.round(base.tm * f),
        orders: Math.round(base.orders * f),
        gmv: Math.round(base.gmv * f),
        ad: Math.round(base.ad * f),
      });
    }
    return arr;
  };
  const seriesMap = {
    cdyzbg: genSeries({ exposure: 85000, clicks: 4200, inquiries: 180, tm: 260, orders: 45, gmv: 320000, ad: 18000 }, 0.08),
    scdxjx: genSeries({ exposure: 60000, clicks: 3000, inquiries: 120, tm: 180, orders: 30, gmv: 450000, ad: 25000 }, 0.05),
    'cdjc fz': genSeries({ exposure: 120000, clicks: 6500, inquiries: 95, tm: 140, orders: 60, gmv: 280000, ad: 12000 }, 0.03),
    cgygyy: genSeries({ exposure: 45000, clicks: 2200, inquiries: 85, tm: 110, orders: 22, gmv: 380000, ad: 15000 }, 0.1),
    cdtfzm: genSeries({ exposure: 95000, clicks: 5000, inquiries: 140, tm: 200, orders: 50, gmv: 210000, ad: 20000 }, 0.06),
    myhydz: genSeries({ exposure: 180000, clicks: 9000, inquiries: 220, tm: 300, orders: 80, gmv: 520000, ad: 35000 }, 0.12),
  };
  for (const [sid, series] of Object.entries(seriesMap)) {
    const cid = custIds[sid];
    if (!cid) continue;
    series.forEach((s, i) => {
      const month = fmtMonth(i - 6);
      insStats.run(cid, month, s.exposure, s.clicks, Number((s.clicks / s.exposure).toFixed(4)), s.inquiries, s.tm, s.orders, s.gmv, s.ad, s.ad > 0 ? Number(((s.gmv / 100) / s.ad).toFixed(2)) : 0);
    });
  }

  // ---- 广告数据（近 3 个月 × 3 类型）----
  const insAds = db.prepare(`
    INSERT OR REPLACE INTO ad_stats_monthly (customer_id, month, ad_type, spend, impressions, clicks, ctr, cost_per_click, conversions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const adProfiles = {
    cdyzbg: { 'P4P标准推': [6000, 8000], '全站推FSP': [4000, 5500], '品牌广告': [8000, 10000] },
    scdxjx: { 'P4P标准推': [9000, 11000], '全站推FSP': [6000, 7000], '品牌广告': [10000, 12000] },
    myhydz: { 'P4P标准推': [15000, 18000], '全站推FSP': [9000, 11000], '品牌广告': [11000, 13000] },
  };
  for (const [sid, prof] of Object.entries(adProfiles)) {
    const cid = custIds[sid];
    if (!cid) continue;
    for (let i = 0; i < 3; i++) {
      const month = fmtMonth(i - 2);
      for (const [type, [lo, hi]] of Object.entries(prof)) {
        const spend = lo + Math.round(Math.random() * (hi - lo));
        const impressions = Math.round(spend * 8);
        const clicks = Math.round(impressions * 0.02);
        insAds.run(cid, month, type, spend, impressions, clicks, Number((clicks / impressions).toFixed(4)), Number((spend / (clicks || 1)).toFixed(2)), Math.round(clicks * 0.06));
      }
    }
  }

  // ---- 服务记录 ----
  const insService = db.prepare(`
    INSERT INTO service_records (customer_id, member_id, record_date, service_type, content, next_action)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insService.run(custIds.cdyzbg, memberId('李运营'), fmtDate(-10), '上门', '店铺装修优化沟通，重点产品重新排版，主图统一规范。', '7天后跟进新品上架进度');
  insService.run(custIds.scdxjx, memberId('张运营'), fmtDate(-5), '培训', 'P4P 关键词优化培训，梳理高转化词 20 个。', '3天后检查广告调整情况');
  insService.run(custIds.cdtfzm, memberId('李运营'), fmtDate(-15), '电话回访', '了解近期询盘质量，客户反馈俄罗斯询盘增加。', '下周提供俄语市场分析');

  // ---- 商机 + 跟进（新签场景）----
  const insOpp = db.prepare(`
    INSERT INTO opportunities (lead_source, company_name, contact_name, contact_phone, contact_wechat, industry, stage, amount, owner_id, expected_date, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const oppIds = [];
  const opps = [
    { lead_source: '展会', company_name: '成都恒达汽配', contact_name: '刘总', contact_phone: '13900001111', contact_wechat: 'liuhengda', industry: '汽车配件', stage: 'negotiate', amount: 66800, owner: '孙销售', expected_days: 15, remark: '广交会获取，对比两家渠道商' },
    { lead_source: '转介绍', company_name: '成都星辰科技', contact_name: '陈经理', contact_phone: '13900002222', contact_wechat: 'chenxingchen', industry: '3C配件', stage: 'quote', amount: 36800, owner: '孙销售', expected_days: 30, remark: '老客户介绍' },
    { lead_source: '地推', company_name: '成都宏远建材', contact_name: '黄总', contact_phone: '13900003333', contact_wechat: 'hyjc2026', industry: '建材', stage: 'need', amount: 36800, owner: '周销售', expected_days: 45, remark: '青龙建材城地推获取' },
    { lead_source: '线上', company_name: '成都启航食品机械', contact_name: '杨经理', contact_phone: '13900004444', contact_wechat: 'qihang_food', industry: '食品机械', stage: 'initial', amount: 66800, owner: '周销售', expected_days: 60, remark: '官网表单线索' },
    { lead_source: '转介绍', company_name: '成都凯瑞仪器', contact_name: '罗总', contact_phone: '13900005555', contact_wechat: 'kairui_yq', industry: '仪器仪表', stage: 'won', amount: 66800, owner: '孙销售', expected_days: -10, remark: '已签单，等待打款' },
    { lead_source: '展会', company_name: '成都博远包装', contact_name: '何经理', contact_phone: '13900006666', contact_wechat: 'boyuan_bz', industry: '包装印刷', stage: 'lost', amount: 36800, owner: '周销售', expected_days: -20, remark: '预算不足，3个月后再跟进' },
  ];
  for (const o of opps) {
    const info = insOpp.run(o.lead_source, o.company_name, o.contact_name, o.contact_phone, o.contact_wechat, o.industry, o.stage, o.amount, memberId(o.owner), o.expected_days ? fmtDate(o.expected_days) : null, o.remark);
    oppIds.push(info.lastInsertRowid);
  }

  // 跟进记录
  const insAct = db.prepare(`
    INSERT INTO opportunity_activities (opportunity_id, member_id, activity_date, activity_type, content, next_follow_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insAct.run(oppIds[0], memberId('孙销售'), fmtDate(-8), '拜访', '上门拜访，演示后台效果，客户意向强，进入价格谈判。', fmtDate(-2));
  insAct.run(oppIds[0], memberId('孙销售'), fmtDate(-2), '电话', '电话沟通合同细节，客户要求增加广告赠送。', fmtDate(3));
  insAct.run(oppIds[1], memberId('孙销售'), fmtDate(-5), '报价', '发送金品诚企报价方案 66800 元，含 P4P 首充。', fmtDate(5));
  insAct.run(oppIds[2], memberId('周销售'), fmtDate(-3), '微信', '微信发送成功案例，客户约下周面谈。', fmtDate(4));

  // ---- 知识库：分类 + 示例文档 ----
  const categories = ['平台规则', '激励政策', '产品资料', '流程制度', '话术模板', '培训资料'];
  const insCat = db.prepare('INSERT INTO knowledge_categories (name, sort) VALUES (?, ?)');
  const catIds = {};
  categories.forEach((name, i) => {
    const info = insCat.run(name, i);
    catIds[name] = info.lastInsertRowid;
  });

  const insDoc = db.prepare(`
    INSERT INTO knowledge_docs (category_id, title, summary, content, version, status, creator_id, updated_by)
    VALUES (?, ?, ?, ?, ?, 'published', ?, ?)
  `);
  const insVer = db.prepare(`
    INSERT INTO knowledge_versions (doc_id, version, title, content, changed_by, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const docs = [
    {
      cat: '激励政策',
      title: '2026 年度渠道激励政策（Q3 更新）',
      summary: '新签/续约激励系数、广告补贴规则、团队奖金池说明。',
      content: '一、新签激励：单签金品诚企奖励 5000 元/单，出口通 3000 元/单，超额完成部分系数上浮 20%。\n二、续约激励：T3 窗口内完成续约，续约顾问按年费 5% 计提；T6 窗口提前完成，额外奖励 1000 元/单。\n三、广告补贴：客户首充 P4P 满 2 万元，渠道补贴客户 1000 元。\n四、团队奖金池：季度总目标达成率 ≥ 100%，按超额部分的 10% 进入团队奖金池。\n注：本政策自 2026-07-01 起执行，此前版本同时废止。',
    },
    {
      cat: '平台规则',
      title: '阿里巴巴国际站平台规则速查手册',
      summary: '账号安全、商品发布、知识产权、交易履约高频规则速查。',
      content: '1. 账号安全：一店一主账号，子账号权限最小化；密码每 90 天更换。\n2. 商品发布：标题 3-128 字符，禁止品牌词滥用；重复铺货将被降权。\n3. 知识产权：侵权商品首次警告、二次扣分、三次下架处罚。\n4. 交易履约：订单 72 小时内确认，超时自动关闭；纠纷率影响店铺星级。\n5. 星级评定：按商品力、服务力、交易力三大维度，每月 5 日更新。',
    },
    {
      cat: '产品资料',
      title: '金品诚企套餐产品介绍',
      summary: '金品诚企权益清单、星级门槛、行业解决方案。',
      content: '金品诚企 = 出口通基础权益 + 专属标识 + 星等级加速 + 行业方案。\n核心权益：\n- 金品诚企专属标识与搜索加权\n- 每月行业数据报告\n- 专属客户经理服务\n- 问鼎/顶展优先购买资格\n适合企业：有稳定外贸团队、希望快速提升店铺星级的成熟卖家。',
    },
    {
      cat: '流程制度',
      title: '新签销售 SOP（线索到签单）',
      summary: '新签团队标准化作业流程，覆盖线索分配、跟进节奏、签单交接。',
      content: '1. 线索分配：主管当日分配，销售 2 小时内首次触达。\n2. 需求挖掘：首次沟通产出需求清单（预算/品类/团队）。\n3. 方案报价：3 个工作日内输出方案，含成功案例。\n4. 商务谈判：异议处理清单 + 价格底线确认。\n5. 签单交接：合同归档 → 创建客户档案 → 移交运营中台（72 小时内）。',
    },
    {
      cat: '话术模板',
      title: '首次电话沟通话术模板',
      summary: '新签首电开场、需求挖掘、异议处理标准话术。',
      content: '开场：您好，我是阿里巴巴国际站成都渠道中心 XX，之前了解到贵司做 XX 品类出口，想用 5 分钟帮您看看平台数据表现……\n挖掘三问：\n1. 目前出口主要通过什么渠道？\n2. 团队几个人负责外贸？\n3. 有没有考虑过线上获客？\n异议处理：\n- 太贵了 → 折算到天 = 每天不到 100 元，换来的是全球买家询盘……\n- 没效果 → 附同行业成功案例数据……',
    },
  ];
  for (const d of docs) {
    const info = insDoc.run(catIds[d.cat], d.title, d.summary, d.content, 1, memberId('李运营'), memberId('李运营'));
    insVer.run(info.lastInsertRowid, 1, d.title, d.content, memberId('李运营'), '初始版本');
  }
  // 平台规则手册演示多版本
  const ruleDoc = db.prepare('SELECT id FROM knowledge_docs WHERE title LIKE ?').get('%平台规则速查%');
  if (ruleDoc) {
    db.prepare(`UPDATE knowledge_docs SET title = ?, content = ?, version = 2, updated_by = ? WHERE id = ?`)
      .run('阿里巴巴国际站平台规则速查手册 v2', '1. 账号安全：一店一主账号，子账号权限最小化；密码每 90 天更换。\n2. 商品发布：标题 3-128 字符，禁止品牌词滥用；重复铺货将被降权。\n3. 知识产权：侵权商品首次警告、二次扣分、三次下架处罚；情节严重者关闭账号。\n4. 交易履约：订单 72 小时内确认，超时自动关闭；纠纷率影响店铺星级。\n5. 星级评定：按商品力、服务力、交易力三大维度，每月 5 日更新。\n6. 【新增】2026-09 起强制开启买家身份实名认证，请提前通知客户。', memberId('张运营'), ruleDoc.id);
    insVer.run(ruleDoc.id, 2, '阿里巴巴国际站平台规则速查手册 v2', '1. 账号安全：一店一主账号，子账号权限最小化；密码每 90 天更换。\n2. 商品发布：标题 3-128 字符，禁止品牌词滥用；重复铺货将被降权。\n3. 知识产权：侵权商品首次警告、二次扣分、三次下架处罚；情节严重者关闭账号。\n4. 交易履约：订单 72 小时内确认，超时自动关闭；纠纷率影响店铺星级。\n5. 星级评定：按商品力、服务力、交易力三大维度，每月 5 日更新。\n6. 【新增】2026-09 起强制开启买家身份实名认证，请提前通知客户。', memberId('张运营'), '更新平台规则：新增买家实名认证要求');
  }

  // ---- 售卖机会规则（内置 5 条）----
  const insRule = db.prepare(`
    INSERT INTO sell_rules (name, opportunity_type, description, conditions, estimated_min, estimated_max, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const rules = [
    {
      name: 'P4P 广告冷启动',
      type: 'ad_new',
      desc: '未开通 P4P 但店铺有一定流量基础，建议开通标准推广获取精准询盘。',
      conds: { logic: 'AND', conditions: [{ field: 'has_p4p', op: 'is_false' }, { field: 'exposure', op: 'gte', value: 50000 }] },
      min: 3000, max: 8000, priority: 1,
    },
    {
      name: 'P4P 加投',
      type: 'ad_add',
      desc: '已开通 P4P 但消耗偏低且询盘基础好，建议加投预算放大效果。',
      conds: { logic: 'AND', conditions: [{ field: 'has_p4p', op: 'is_true' }, { field: 'p4p_monthly_spend', op: 'lt', value: 5000 }, { field: 'inquiries', op: 'gte', value: 80 }] },
      min: 5000, max: 12000, priority: 2,
    },
    {
      name: '品牌广告（问鼎/顶展）',
      type: 'brand_ad',
      desc: '流量大盘已建立但未购买品牌广告，建议抢占类目关键词首屏。',
      conds: { logic: 'AND', conditions: [{ field: 'has_brand', op: 'is_false' }, { field: 'exposure', op: 'gte', value: 100000 }] },
      min: 20000, max: 50000, priority: 3,
    },
    {
      name: '全站推（FSP）',
      type: 'fsp',
      desc: '点击量充足但未开通全站推，建议补充场景流量。',
      conds: { logic: 'AND', conditions: [{ field: 'has_fsp', op: 'is_false' }, { field: 'clicks', op: 'gte', value: 3000 }] },
      min: 5000, max: 10000, priority: 4,
    },
    {
      name: '数据改善服务',
      type: 'service',
      desc: '数据积累不足的店铺，建议购买数据改善/代运营服务。',
      conds: { logic: 'AND', conditions: [{ field: 'months_on_record', op: 'lte', value: 2 }, { field: 'exposure', op: 'lte', value: 30000 }] },
      min: 5000, max: 15000, priority: 5,
    },
  ];
  for (const r of rules) {
    insRule.run(r.name, r.type, r.desc, JSON.stringify(r.conds), r.min, r.max, r.priority);
  }

  // ---- 运营过程记录（示例：动作→目标→回验闭环）----
  const insWork = db.prepare(`
    INSERT INTO work_logs (customer_id, member_id, action_type, title, description, metric_type, baseline_value, target_value, target_date, status, actual_value, verified_at, verify_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const workSamples = [
    {
      customer: 'cdyzbg', member: '李运营', action: '广告优化', metric: 'p4p_daily_spend',
      title: 'P4P 日均消耗从 100 提升至 200',
      desc: '优化关键词出价结构，删除低效词 15 个，主推词加价 20%，开启智能匹配补充流量。',
      baseline: 100, target: 200, status: 'achieved', actual: 215, note: '连续 7 天日均消耗稳定在 200+，询盘同步提升',
    },
    {
      customer: 'scdxjx', member: '张运营', action: '关键词优化', metric: 'inquiries',
      title: '月询盘从 80 提升至 150',
      desc: '重构关键词分组，重点词 TOP 10 排名优化，新增长尾词 40 个。',
      baseline: 80, target: 150, status: 'active', actual: null, note: null,
    },
    {
      customer: 'cdtfzm', member: '李运营', action: '店铺装修', metric: 'exposure',
      title: '店铺首页改版提升曝光',
      desc: '首页首屏改版，Banner 统一品牌视觉，重点产品模块重排。',
      baseline: 95000, target: 120000, status: 'missed', actual: 105000, note: '曝光提升但未达目标，视觉素材需继续优化',
    },
  ];
  for (const w of workSamples) {
    insWork.run(custIds[w.customer], memberId(w.member), w.action, w.title, w.desc, w.metric, w.baseline, w.target,
      fmtDate(15), w.status, w.actual, w.actual ? fmtDate(-2) : null, w.note);
  }

  // ---- 指标持续监控（示例）----
  const insMonitor = db.prepare(`
    INSERT INTO metric_monitors (customer_id, metric_type, target_value, compare, note, status, created_by)
    VALUES (?, ?, ?, 'gte', ?, 'active', ?)
  `);
  insMonitor.run(custIds.cdyzbg, 'p4p_daily_spend', 300, 'P4P 日均消耗持续监控（目标≥300，跌破即告警）', memberId('李运营'));
  insMonitor.run(custIds.cdtfzm, 'exposure', 100000, '月曝光持续监控（目标≥100000）', memberId('张运营'));

  // ---- 业绩目标（预置：渠道营收 / 广告维度 / 育商里程碑 / 大盘 / 续签率）----
  const insGoal = db.prepare(`
    INSERT INTO goal_targets (category, period, name, metric, target_value, unit, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const Y = new Date().getFullYear();
  const GOALS = [
    // 渠道营收（年度 + 季度；Q2=650万 示例完整拆解，其余季度占位可改）
    ['revenue', `${Y}`, `${Y} 年度营收目标`, 'revenue_total', 26000000, '元'],
    ['revenue', `${Y}-Q1`, `Q1 营收目标`, 'revenue_total', 5800000, '元'],
    ['revenue', `${Y}-Q2`, `Q2 营收目标`, 'revenue_total', 6500000, '元'],
    ['revenue', `${Y}-Q3`, `Q3 营收目标`, 'revenue_total', 6800000, '元'],
    ['revenue', `${Y}-Q4`, `Q4 营收目标`, 'revenue_total', 7200000, '元'],
    ['revenue', `${Y}-Q2`, '新签贡献营收', 'revenue_new', 2600000, '元'],
    ['revenue', `${Y}-Q2`, '新签贡献订单数', 'new_orders', 20, '单'],
    ['revenue', `${Y}-Q2`, '老客户贡献（续约）', 'revenue_renewal', 1950000, '元'],
    ['revenue', `${Y}-Q2`, 'AWB 贡献', 'revenue_awb', 975000, '元'],
    ['revenue', `${Y}-Q2`, '广告贡献', 'revenue_ad', 975000, '元'],
    ['revenue', `${Y}-Q3`, 'AWB 贡献', 'revenue_awb', 975000, '元'],
    // 广告维度
    ['ad', '', '新签 2 万 P 消耗客户数', 'ad_p2w_customers', 10, '家'],
    ['ad', '', '广告产品关注（无忧PLUS/超级充、省心版、AI智投、金品推工厂、千寻）', 'ad_products_attention', 6, '个'],
    // 育商 · 新商里程碑（达成率目标）
    ['nursery_new', '', '新商 30天 · 品200', 'nursery_30_product', 90, '%'],
    ['nursery_new', '', '新商 60天 · P3000', 'nursery_60_p3000', 60, '%'],
    ['nursery_new', '', '新商 90天 · 3单', 'nursery_90_orders', 55, '%'],
    ['nursery_new', '', '新商 120天 · 优爆品20(金品50)', 'nursery_120_top', 60, '%'],
    ['nursery_new', '', '新商 180天 · 5000美金', 'nursery_180_gmv', 60, '%'],
    // 育商 · 大盘达标线
    ['nursery_market', '', '大盘 · 产品数', 'market_products', 300, '个'],
    ['nursery_market', '', '大盘 · P4P月消耗(金品6000)', 'market_p_spend', 3000, '元'],
    ['nursery_market', '', '大盘 · 90天3万美金', 'market_gmv_90', 30000, '美金'],
    ['nursery_market', '', '大盘 · 结构化商详', 'market_structured_detail', 10, '个'],
    ['nursery_market', '', '大盘 · AI知识库', 'market_ai_kb', 10, '个'],
    ['nursery_market', '', '大盘 · 市场热卖品', 'market_hot_items', 10, '个'],
    // 续签率
    ['renew_rate', '', '首次年续签率', 'renew_rate_first', 56, '%'],
    ['renew_rate', '', '多年续签率', 'renew_rate_multi', 75, '%'],
  ];
  for (const g of GOALS) {
    insGoal.run(g[0], g[1], g[2], g[3], g[4], g[5]);
  }

  // ---- AWB 付款客户明细（示例：插件采集 AWB"售卖客户明细"TAB）----
  const insAwbPay = db.prepare(`
    INSERT INTO awb_payments (month, customer_name, pay_date, amount)
    VALUES (?, ?, ?, ?)
  `);
  insAwbPay.run('2026-08', '成都宏发汽配', '2026-08-05', 15000);
  insAwbPay.run('2026-08', '重庆众诚工具', '2026-08-12', 15000);
  insAwbPay.run('2026-08', '绵阳盛世电子', '2026-08-18', 15000);

  // ---- 客户产品数据（示例：插件采集 deepinsight 产品数组件页）----
  const insProd = db.prepare(`
    INSERT INTO product_stats (customer_id, month, product_count, top_product_count)
    VALUES (?, ?, ?, ?)
  `);
  insProd.run(custIds.cdyzbg, '2026-08', 268, 55);
  insProd.run(custIds.scdxjx, '2026-08', 215, 45);
  insProd.run(custIds.cdtfzm, '2026-08', 180, 15);
  insProd.run(custIds.myhydz, '2026-08', 240, 55);

  // ---- 生成今日续约快照 ----
  const n = renewalService.snapshot(db);

  // ---- 售卖机会规则扫描（种子完整性：规则已插入，立即生成机会）----
  const scanResult = ruleEngine.scan(db);
  console.log(`售卖机会扫描：命中 ${scanResult.hits}（新增 ${scanResult.created}）`);

  console.log('========================================');
  console.log('渠道中心大脑 · 种子数据初始化完成');
  console.log('========================================');
  console.log(`团队 ${members.length} 人 | 用户 ${users.length} 个 | 客户 ${customers.length} 家`);
  console.log(`月度数据 ${Object.keys(seriesMap).length} 家客户 | 商机 ${opps.length} 个`);
  console.log(`角色 ${ROLES.length} 个（${ROLES.map((r) => r.code).join('/')}）| 权限点 ${PERMISSIONS.length} 个`);
  console.log(`知识库分类 ${categories.length} 个 | 示例文档 ${docs.length} 篇`);
  console.log(`今日续约快照：T3/T6 共 ${n} 条`);
  console.log('登录账号：admin/admin123(管理员) boss/boss123(管理层) ops/ops123(运营) renewal/renewal123(续约) sales/sales123(销售) salesmgr/mgr123(销售主管) hr/hr123(人事)');
}

main();
