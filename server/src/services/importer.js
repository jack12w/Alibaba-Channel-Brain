'use strict';

/**
 * CSV 导入器（真实数据）
 * - 定时扫描目录，识别 5 个表类型（商家运营/180天新商/P4P/AWB/成交营）
 * - UTF-8 解码（AWB 公司名脱敏坏字符由回填解决）
 * - 列名精确映射，其余字段进 raw JSON 兜底
 * - customers 按 account_id 幂等 upsert（一个账号=一个客户）
 * - 历史快照按 stat_date + account_id 幂等 upsert
 * - 文件 hash 去重（import_files 表）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------- CSV 解析

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function decode(buf) {
  return new TextDecoder('utf-8', { fatal: false }).decode(buf).replace(/^\uFEFF/, '');
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || s === '-' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- 表定义

// 每项：c=CSV列名(精确) f=目标字段 t=类型(text/num)
const TABLE_DEFS = {
  store: {
    table: 'snap_store',
    key: ['stat_date', 'account_id'],
    columns: [
      { c: '统计日期', f: 'stat_date', t: 'text' },
      { c: 'admin_mbr_id', f: 'account_id', t: 'text' },
      { c: '客户经理', f: 'manager_name', t: 'text' },
      { c: '主管', f: 'supervisor_name', t: 'text' },
      { c: '新区域', f: 'region', t: 'text' },
      { c: '渠道类型', f: 'channel_type', t: 'text' },
      { c: '大区', f: 'region_large', t: 'text' },
      { c: '一级行业EN', f: 'industry_l1', t: 'text' },
      { c: '二级行业EN', f: 'industry_l2', t: 'text' },
      { c: '三级行业EN', f: 'industry_l3', t: 'text' },
      { c: '当前合同的服务开始时间', f: 'contract_start', t: 'text' },
      { c: '当前合同到期日期', f: 'contract_end', t: 'text' },
      { c: '提前续约状态', f: 'renew_early_status', t: 'text' },
      { c: '是否续约', f: 'is_renew', t: 'text' },
      { c: '是否金品', f: 'is_gold', t: 'text' },
      { c: '是否多平台', f: 'is_multi_platform', t: 'text' },
      { c: '是否购买金品未开通', f: 'is_gold_unopened', t: 'text' },
      { c: '服务年数', f: 'service_years', t: 'num' },
      { c: '4_0评定星等级_含直达_', f: 'star_rated', t: 'num' },
      { c: '4_0预测星等级', f: 'star_predicted', t: 'num' },
      { c: '近30天曝光数', f: 'exposure_30d', t: 'num' },
      { c: '近30天点击数', f: 'clicks_30d', t: 'num' },
      { c: '近30天MC有效询盘数', f: 'inquiries_30d', t: 'num' },
      { c: '近30天ATM询盘数', f: 'tm_inquiries_30d', t: 'num' },
      { c: '近30天海外店铺页面的PV', f: 'pv_30d', t: 'num' },
      { c: '近30天店铺页面的海外UV', f: 'uv_30d', t: 'num' },
      { c: '近90天买家数', f: 'buyers_90d', t: 'num' },
      { c: '近90天信保挂账订单金额', f: 'pending_gmv_90d', t: 'num' },
      { c: '近90天信保挂账订单数', f: 'pending_orders_90d', t: 'num' },
      { c: '点击率', f: 'click_rate', t: 'num' },
      { c: '风险健康分数', f: 'risk_score', t: 'num' },
      { c: '近90天信保交易成功订单金额', f: 'settled_gmv_90d', t: 'num' },
      { c: '买家评价分', f: 'buyer_rating', t: 'num' },
      { c: '平均回复时间', f: 'avg_reply_time', t: 'num' },
      { c: '商机数值', f: 'biz_value', t: 'num' },
      { c: '总商机', f: 'total_biz', t: 'num' },
      { c: '国际站网址', f: 'shop_url', t: 'text' },
      { c: '当前合同新续属性', f: 'contract_attr', t: 'text' },
      { c: '是否合伙人', f: 'is_partner', t: 'text' },
      { c: '渠道公司', f: 'channel_company', t: 'text' },
      { c: 'P4P层级', f: 'p4p_level', t: 'text' },
      { c: 'p4p_当天推广状态', f: 'p4p_status', t: 'text' },
      { c: '当前合同的到款金额', f: 'contract_amount', t: 'num' },
      { c: '一年方案金额投入', f: 'plan_amount_1y', t: 'num' },
      { c: '两年方案金额投入', f: 'plan_amount_2y', t: 'num' },
      { c: '商品数', f: 'product_count', t: 'num' },
      { c: 'RTS商品数', f: 'rts_count', t: 'num' },
      { c: '普通商品', f: 'normal_products', t: 'num' },
      { c: '潜力商品', f: 'potential_products', t: 'num' },
      { c: '实力优品', f: 'strength_products', t: 'num' },
      { c: '超级优品', f: 'super_products', t: 'num' },
      { c: 'P4P月财务消耗', f: 'p4p_monthly_spend', t: 'num' },
      { c: 'P4P_日消耗上限', f: 'p4p_daily_limit', t: 'num' },
      { c: 'P4P现金余额', f: 'p4p_cash_balance', t: 'num' },
      { c: 'P4P_最近一次续充金额', f: 'p4p_last_recharge', t: 'num' },
      { c: '信保是否亮灯', f: 'credit_light', t: 'text' },
      { c: '是否淘宝卖家', f: 'is_taobao', t: 'text' },
      { c: '是否天猫卖家', f: 'is_tmall', t: 'text' },
      { c: '是否诚信通卖家', f: 'is_cxt', t: 'text' },
      { c: '是否AE卖家', f: 'is_ae', t: 'text' },
      { c: '工贸类型', f: 'company_type', t: 'text' },
      { c: '近30天网站登陆天数', f: 'login_days_30d', t: 'num' },
      { c: '近30天旺旺登陆天数', f: 'wangwang_days_30d', t: 'num' },
      { c: 'global_id', f: 'global_id', t: 'text' },
      { c: 'comp_id', f: 'comp_id', t: 'text' },
      { c: '生命周期类型', f: 'lifecycle_type', t: 'text' },
      { c: '生命周期', f: 'lifecycle', t: 'text' },
      { c: '金品认证到期时间', f: 'gold_cert_expire', t: 'text' },
      { c: '近30天AB', f: 'ab_30d', t: 'num' },
      { c: '近30天蓝标AB', f: 'ab_blue_30d', t: 'num' },
      { c: '近30天金标AB', f: 'ab_gold_30d', t: 'num' },
      { c: '平台数', f: 'platform_count', t: 'num' },
      { c: '近30天RTS线上实收买家数', f: 'rts_buyers_30d', t: 'num' },
      { c: '近30天RTS线上实收GMV', f: 'rts_gmv_30d', t: 'num' },
      { c: '近30天RTS线上实收订单数', f: 'rts_orders_30d', t: 'num' },
    ],
  },

  milestone: {
    table: 'snap_milestone',
    key: ['stat_date', 'account_id'],
    statDateFixed: true, // 无统计日期列，用导入当天
    columns: [
      { c: '会员ID', f: 'account_id', t: 'text' },
      { c: '是否续签高风险', f: 'is_high_risk', t: 'text' },
      { c: '首次服务开始日期', f: 'first_service_date', t: 'text' },
      { c: '当前服务天数', f: 'service_days', t: 'num' },
      { c: '公司名称', f: 'company_name', t: 'text' },
      { c: '客户分组', f: 'customer_group', t: 'text' },
      { c: '一级行业', f: 'industry_l1', t: 'text' },
      { c: '二级行业', f: 'industry_l2', t: 'text' },
      { c: '三级行业', f: 'industry_l3', t: 'text' },
      { c: '评定星级', f: 'star_rated', t: 'num' },
      { c: '预测星级', f: 'star_predicted', t: 'num' },
      { c: '直达星级', f: 'star_direct', t: 'num' },
      { c: '4.5分品_30天数值', f: 'p30_value', t: 'num' },
      { c: '4.5分品_当前数值', f: 'p30_current', t: 'num' },
      { c: '4.5分品_30天达标状态', f: 'p30_status', t: 'text' },
      { c: '4.5分品_30天达标天数', f: 'p30_days', t: 'num' },
      { c: 'P4P_60天数值', f: 'p60_value', t: 'num' },
      { c: 'P4P_当前数值', f: 'p60_current', t: 'num' },
      { c: 'P4P_60天达标状态', f: 'p60_status', t: 'text' },
      { c: 'P4P_60天达标天数', f: 'p60_days', t: 'num' },
      { c: '订单数_90天数值', f: 'p90_value', t: 'num' },
      { c: '订单数_当前数值', f: 'p90_current', t: 'num' },
      { c: '订单数_90天达标状态', f: 'p90_status', t: 'text' },
      { c: '订单数_90天达标天数', f: 'p90_days', t: 'num' },
      { c: '优爆品_120天数值', f: 'p120_value', t: 'num' },
      { c: '优爆品_当前数值', f: 'p120_current', t: 'num' },
      { c: '优爆品_120天达标状态', f: 'p120_status', t: 'text' },
      { c: '优爆品_120天达标天数', f: 'p120_days', t: 'num' },
      { c: 'GMV_180天数值', f: 'p180_gmv_value', t: 'num' },
      { c: 'GMV_当前数值', f: 'p180_gmv_current', t: 'num' },
      { c: 'GMV_180天达标状态', f: 'p180_gmv_status', t: 'text' },
      { c: '当前GMV是否达5000', f: 'p180_gmv_hit5000', t: 'text' },
      { c: 'GMV_180天达标天数', f: 'p180_gmv_days', t: 'num' },
      { c: '星级_180天数值', f: 'p180_star_value', t: 'num' },
      { c: '星级_当前数值', f: 'p180_star_current', t: 'num' },
      { c: '星级_180天达标状态', f: 'p180_star_status', t: 'text' },
      { c: '星级_180天达标天数', f: 'p180_star_days', t: 'num' },
      { c: '当前星级是否达1星', f: 'p180_star_hit1', t: 'text' },
      { c: '中供大区', f: 'region_large', t: 'text' },
      { c: '中区', f: 'mid_region', t: 'text' },
      { c: '区域', f: 'region', t: 'text' },
      { c: '渠道', f: 'channel', t: 'text' },
      { c: '中供销售', f: 'sales_name', t: 'text' },
      { c: '主管组_渠道商', f: 'supervisor_group', t: 'text' },
      { c: '供应链拍档', f: 'partner_company', t: 'text' },
      { c: '拍档销售', f: 'partner_sales', t: 'text' },
      { c: '拍档客服', f: 'partner_service', t: 'text' },
      { c: '生态主管', f: 'eco_supervisor', t: 'text' },
      { c: '优化师姓名', f: 'optimizer_name', t: 'text' },
    ],
  },

  ad: {
    table: 'snap_ad',
    key: ['stat_date', 'account_id'],
    columns: [
      { c: '统计日期', f: 'stat_date', t: 'text' },
      { c: '统计月', f: 'stat_month', t: 'text' },
      { c: '登录主账号ID', f: 'account_id', t: 'text' },
      { c: '公司ID', f: 'comp_id', t: 'text' },
      { c: '公司名', f: 'company_name', t: 'text' },
      { c: '会员类型', f: 'member_type', t: 'text' },
      { c: '是否服务中', f: 'is_serving', t: 'text' },
      { c: '大区', f: 'region_large', t: 'text' },
      { c: '渠道类型', f: 'channel_type', t: 'text' },
      { c: '合并区域', f: 'merge_region', t: 'text' },
      { c: '主管组名', f: 'supervisor_group', t: 'text' },
      { c: '客户经理姓名', f: 'manager_name', t: 'text' },
      { c: '合伙人公司名', f: 'partner_company', t: 'text' },
      { c: '是否金品Y/N', f: 'is_gold', t: 'text' },
      { c: '优化师姓名', f: 'optimizer_name', t: 'text' },
      { c: '营销等级', f: 'marketing_level', t: 'text' },
      { c: '星等级', f: 'star_level', t: 'text' },
      { c: '当前是否行业领袖Y/N', f: 'is_industry_leader', t: 'text' },
      { c: '主营一级行业', f: 'industry_l1', t: 'text' },
      { c: '主营二级行业', f: 'industry_l2', t: 'text' },
      { c: '主营三级行业', f: 'industry_l3', t: 'text' },
      { c: '客户是否本财年p4p首次充值', f: 'is_first_recharge', t: 'text' },
      { c: 'p4p当日财务消耗，单位元', f: 'p4p_daily_spend', t: 'num' },
      { c: 'p4p当月财务消耗，单位元', f: 'p4p_monthly_spend', t: 'num' },
      { c: 'p4p本季度财务消耗，单位元', f: 'p4p_quarter_spend', t: 'num' },
      { c: 'p4p财年财务消耗，单位元', f: 'p4p_year_spend', t: 'num' },
      { c: 'p4p当日预算，单位元', f: 'p4p_daily_budget', t: 'num' },
      { c: 'p4p当月预算，单位元', f: 'p4p_monthly_budget', t: 'num' },
      { c: '近7天p4p现金消耗,单位元', f: 'cash_spend_7d', t: 'num' },
      { c: '近30天p4p现金消耗,单位元', f: 'cash_spend_30d', t: 'num' },
      { c: '近60天p4p现金消耗', f: 'cash_spend_60d', t: 'num' },
      { c: '近90天p4p现金消耗', f: 'cash_spend_90d', t: 'num' },
      { c: '近365天p4p现金消耗', f: 'cash_spend_365d', t: 'num' },
      { c: '近7日p4p活跃客户1/0', f: 'active_7d', t: 'num' },
      { c: '近30日p4p活跃客户1/0', f: 'active_30d', t: 'num' },
      { c: '近30日p4p严肃活跃客户1/0', f: 'serious_active_30d', t: 'num' },
      { c: '近60日p4p活跃客户1/0', f: 'active_60d', t: 'num' },
      { c: '近90日p4p活跃客户1/0', f: 'active_90d', t: 'num' },
      { c: '近365日p4p活跃客户1/0', f: 'active_365d', t: 'num' },
      { c: '近7日活跃低余额客户1/0', f: 'low_balance_7d', t: 'num' },
      { c: '当日p4p账户余额，元', f: 'account_balance', t: 'num' },
      { c: '当日p4p现金余额，元', f: 'cash_balance', t: 'num' },
      { c: 'p4p近7日日均推广小时', f: 'avg_daily_hours_7d', t: 'num' },
      { c: '当日点爆预算，元', f: 'dot_boom_budget', t: 'num' },
      { c: '推广计划数', f: 'plan_count', t: 'num' },
      { c: '当月cgs品牌营收', f: 'rev_brand_month', t: 'num' },
      { c: '当月cgs顶展营收', f: 'rev_top_month', t: 'num' },
      { c: '当月cgs问鼎营收', f: 'rev_ask_month', t: 'num' },
      { c: '当月cgs回眸营收', f: 'rev_review_month', t: 'num' },
      { c: '当月cgs明星展位营收', f: 'rev_star_month', t: 'num' },
      { c: '是否开p', f: 'is_open_p', t: 'text' },
      { c: '当月新手包支付金额', f: 'newbie_pack_amount', t: 'num' },
      { c: '店铺新品数', f: 'new_product_count', t: 'num' },
      { c: '店铺优爆品数', f: 'top_product_count', t: 'num' },
    ],
  },

  awb: {
    table: 'awb_orders',
    key: ['item_num'],
    columns: [
      { c: 'item_num', f: 'item_num', t: 'text' },
      { c: 'member_id', f: 'account_id', t: 'text' },
      { c: '产品分类', f: 'product_category', t: 'text' },
      { c: '创建日期', f: 'create_date', t: 'text' },
      { c: '是否打包', f: 'is_pack', t: 'text' },
      { c: '是否星级保效打包', f: 'is_star_pack', t: 'text' },
      { c: '保效方案分类', f: 'pack_scheme', t: 'text' },
      { c: '业务状态', f: 'biz_status', t: 'text' },
      { c: '签约金额', f: 'sign_amount', t: 'num' },
      { c: '付款金额', f: 'pay_amount', t: 'num' },
      { c: '付款状态', f: 'pay_status', t: 'text' },
      { c: '付款日期', f: 'pay_date', t: 'text' },
      { c: '周期', f: 'period', t: 'num' },
      { c: '周期单位', f: 'period_unit', t: 'text' },
      { c: '实际服务开始时间', f: 'service_start', t: 'text' },
      { c: '实际服务结束时间', f: 'service_end', t: 'text' },
      { c: '是否CGS服务中', f: 'is_cgs_serving', t: 'text' },
      { c: '是否金品', f: 'is_gold', t: 'text' },
      { c: '新续属性', f: 'new_renew_attr', t: 'text' },
      { c: 'CGS新续属性', f: 'cgs_new_renew_attr', t: 'text' },
      { c: '打包订单会员新续属性', f: 'pack_member_new_attr', t: 'text' },
      { c: '客户经理', f: 'manager_name', t: 'text' },
      { c: '主管组', f: 'supervisor_group', t: 'text' },
      { c: '主管名', f: 'supervisor_name', t: 'text' },
      { c: '归属区域', f: 'region', t: 'text' },
      { c: '中区', f: 'mid_region', t: 'text' },
      { c: '大区', f: 'region_large', t: 'text' },
      { c: '是否开通', f: 'is_open', t: 'text' },
      { c: '签单销售域账号', f: 'sales_account', t: 'text' },
      { c: '归属中供销售', f: 'sales_name', t: 'text' },
      { c: '是否大客户经理签单', f: 'is_ka_sign', t: 'text' },
      { c: '是否CGS期末客户', f: 'is_cgs_end', t: 'text' },
      { c: '打包会员类型', f: 'pack_member_type', t: 'text' },
      { c: '渠道类型', f: 'channel_type', t: 'text' },
    ],
  },

  camp: {
    table: 'snap_camp',
    key: ['stat_date', 'account_id'],
    statDateFixed: true,
    columns: [
      { c: '主账号ID', f: 'account_id', t: 'text' },
      { c: '公司名称', f: 'company_name', t: 'text' },
      { c: '是否金品', f: 'is_gold', t: 'text' },
      { c: '预测星等级', f: 'star_predicted', t: 'num' },
      { c: '品数', f: 'product_count', t: 'num' },
      { c: '优品数', f: 'top_count', t: 'num' },
      { c: '市场热卖定招品数', f: 'hot_bid_count', t: 'num' },
      { c: '本季度增量市场热卖定招品数', f: 'hot_bid_q_inc', t: 'num' },
      { c: '市场热卖潜力定招品数', f: 'hot_potential_count', t: 'num' },
      { c: '商机定招品数', f: 'biz_bid_count', t: 'num' },
      { c: 'AI知识库文件数', f: 'ai_kb_count', t: 'num' },
      { c: '结构化商详品数', f: 'structured_detail_count', t: 'num' },
      { c: '日预算', f: 'daily_budget', t: 'num' },
      { c: '近30天RFQ报价数', f: 'rfq_quotes_30d', t: 'num' },
      { c: '近30天P4P消耗', f: 'p4p_spend_30d', t: 'num' },
      { c: '推荐投广品数', f: 'rec_ad_count', t: 'num' },
      { c: '推荐投广推广品数', f: 'rec_ad_promo_count', t: 'num' },
      { c: '近30天ab', f: 'ab_30d', t: 'num' },
      { c: '近30天L1买家数', f: 'l1_buyers_30d', t: 'num' },
      { c: '近30天L3买家数', f: 'l3_buyers_30d', t: 'num' },
      { c: '近30天买驱订单数', f: 'buy_order_30d', t: 'num' },
      { c: '近30天买驱gmv', f: 'buy_gmv_30d', t: 'num' },
      { c: '近30天实收GMV', f: 'settled_gmv_30d', t: 'num' },
      { c: '近90天买驱订单数', f: 'buy_order_90d', t: 'num' },
      { c: '近90天买驱gmv', f: 'buy_gmv_90d', t: 'num' },
      { c: '近90天实收GMV', f: 'settled_gmv_90d', t: 'num' },
      { c: '中供营收', f: 'revenue_zhonggong', t: 'num' },
      { c: 'OKKI营收', f: 'revenue_okki', t: 'num' },
      { c: '品广营收', f: 'revenue_pinguang', t: 'num' },
      { c: '日均消耗', f: 'avg_daily_spend', t: 'num' },
      { c: '效果广告营收', f: 'revenue_effect_ad', t: 'num' },
      { c: '拍档公司', f: 'partner_company', t: 'text' },
      { c: '拍档销售', f: 'partner_sales', t: 'text' },
      { c: '中区', f: 'mid_region', t: 'text' },
      { c: '区域', f: 'region', t: 'text' },
      { c: '当前_主管组_渠道商', f: 'supervisor_group', t: 'text' },
      { c: '中供销售', f: 'sales_name', t: 'text' },
    ],
  },
};

// 每个表 → customers 主数据的补充字段（用于 account_id 建客户档案）
const CUSTOMER_SYNC = {
  store: ['account_id', 'comp_id', 'global_id', 'manager_name', 'supervisor_name', 'region', 'channel_type', 'region_large', 'industry_l1', 'industry_l2', 'industry_l3', 'is_gold', 'shop_url', 'lifecycle'],
  ad: ['account_id', 'comp_id', 'company_name', 'manager_name', 'region_large', 'channel_type', 'is_gold', 'industry_l1', 'industry_l2', 'industry_l3'],
  milestone: ['account_id', 'company_name', 'region_large', 'region', 'industry_l1', 'industry_l2', 'industry_l3'],
  camp: ['account_id', 'company_name', 'is_gold', 'region'],
  awb: ['account_id', 'manager_name', 'supervisor_name', 'region', 'region_large', 'channel_type', 'is_gold'],
};

// ---------------------------------------------------------------- 工具

function detectType(fileName) {
  if (fileName.includes('180天新商')) return 'milestone';
  if (fileName.includes('P4P')) return 'ad';
  if (fileName.includes('AWB')) return 'awb';
  if (fileName.includes('成交营')) return 'camp';
  if (fileName.includes('商家运营')) return 'store';
  return null;
}

function buildRecord(cols, row, def) {
  const colIndex = {};
  cols.forEach((c, i) => { colIndex[c] = i; });
  const rec = {};
  for (const m of def.columns) {
    const v = colIndex[m.c] !== undefined ? row[colIndex[m.c]] : null;
    rec[m.f] = m.t === 'num' ? toNum(v) : (v === '' || v === undefined ? null : v);
  }
  // 无统计日期的表用导入当天
  if (def.statDateFixed) rec.stat_date = new Date().toISOString().slice(0, 10);
  const raw = {};
  cols.forEach((c, i) => { raw[c] = row[i] === '' ? null : row[i]; });
  rec.raw = JSON.stringify(raw);
  return rec;
}

// customers 幂等 upsert：account_id 唯一；company_name 优先保留先导入的非空值
function upsertCustomer(db, rec, def) {
  const syncFields = CUSTOMER_SYNC[defKey(def)] || [];
  if (!syncFields.length) return;
  const data = {};
  for (const f of syncFields) {
    if (rec[f] !== null && rec[f] !== undefined && rec[f] !== '') data[f] = rec[f];
  }
  if (!data.account_id) return;
  // 合同字段：store 表补充 sign_date/expire_date
  if (rec.contract_start) data.contract_start = rec.contract_start;
  if (rec.contract_end) { data.expire_date = rec.contract_end; data.contract_start = data.contract_start || rec.contract_start; }

  const existing = db.prepare('SELECT id, company_name FROM customers WHERE account_id = ?').get(data.account_id);
  if (existing) {
    const sets = [];
    for (const [k, v] of Object.entries(data)) {
      if (k === 'account_id') continue;
      if (k === 'company_name' && existing.company_name) continue; // 已有完整名则不覆盖
      sets.push(`${k} = @${k}`);
    }
    if (sets.length) db.prepare(`UPDATE customers SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE account_id = @account_id`).run(data);
  } else {
    if (!data.company_name) data.company_name = data.account_id; // 占位，后续从 P4P/新商/成交营回填
    const cols = Object.keys(data);
    if (cols.length) {
      try {
        db.prepare(`INSERT INTO customers (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map((k) => '@' + k).join(', ')}, datetime('now','localtime'), datetime('now','localtime'))`).run(data);
      } catch (e) {
        // account_id 唯一冲突（并发）忽略
      }
    }
  }
}

function defKey(def) {
  return Object.keys(TABLE_DEFS).find((k) => TABLE_DEFS[k].table === def.table);
}

// 单表导入（幂等 upsert）
function importRows(db, def, rows) {
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== ''));
  let saved = 0;
  const upsert = db.transaction((recs) => {
    for (const rec of recs) {
      const cols = Object.keys(rec).filter((k) => rec[k] !== null && rec[k] !== undefined);
      if (!def.key.every((k) => rec[k])) continue; // 缺少主键字段跳过
      const setClause = cols.filter((k) => !def.key.includes(k))
        .map((k) => `${k} = excluded.${k}`).join(', ');
      const sql = `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map((k) => '@' + k).join(', ')})
        ON CONFLICT(${def.key.join(', ')}) DO UPDATE SET ${setClause}`;
      try {
        db.prepare(sql).run(rec);
        saved++;
      } catch (e) {
        // 单行失败不中断整批
        console.warn(`[importer] ${def.table} 行导入失败: ${e.message}`);
      }
    }
  });

  const recs = dataRows.map((r) => buildRecord(header, r, def));
  upsert(recs);

  // 同步 customers 主数据
  for (const rec of recs) upsertCustomer(db, rec, def);

  return { total: dataRows.length, saved };
}

function importFile(db, filePath) {
  const fileName = path.basename(filePath);
  const type = detectType(fileName);
  if (!type) return { skipped: true, reason: `无法识别表类型: ${fileName}` };

  const buf = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const exists = db.prepare('SELECT id FROM import_files WHERE file_hash = ?').get(hash);
  if (exists) return { skipped: true, reason: `文件已导入（hash 重复）` };

  const text = decode(buf);
  const rows = parseCSV(text);
  if (rows.length < 2) return { skipped: true, reason: '文件为空或无数据行' };

  const def = TABLE_DEFS[type];
  const result = importRows(db, def, rows);

  db.prepare('INSERT INTO import_files (file_name, file_hash, table_type, row_count, status, message) VALUES (?, ?, ?, ?, ?, ?)')
    .run(fileName, hash, type, result.saved, result.saved >= 0 ? 'success' : 'error', `总行 ${result.total}，入库 ${result.saved}`);

  // AWB 导入后回填公司名（从 customers）
  if (type === 'awb') backfillAwbCompany(db);

  return { type, ...result };
}

// AWB 公司名回填：account_id → customers.company_name
function backfillAwbCompany(db) {
  const rows = db.prepare('SELECT id, account_id FROM awb_orders WHERE (company_name IS NULL OR company_name LIKE \'%*%\' OR company_name LIKE \'%\uFFFD%\')').all();
  const stmt = db.prepare('UPDATE awb_orders SET company_name = ? WHERE id = ?');
  let n = 0;
  for (const r of rows) {
    const c = db.prepare('SELECT company_name FROM customers WHERE account_id = ? AND company_name IS NOT NULL AND company_name != account_id').get(r.account_id);
    if (c && c.company_name) { stmt.run(c.company_name, r.id); n++; }
  }
  return n;
}

// 全局回填：customers 缺公司名的，从 snap_ad / snap_milestone / snap_camp 补齐
function backfillCustomerCompany(db) {
  const missing = db.prepare("SELECT id, account_id FROM customers WHERE company_name IS NULL OR company_name = '' OR company_name = account_id").all();
  const sources = [
    ['snap_ad', 'company_name'],
    ['snap_milestone', 'company_name'],
    ['snap_camp', 'company_name'],
  ];
  const upd = db.prepare("UPDATE customers SET company_name = ? WHERE id = ?");
  let n = 0;
  for (const c of missing) {
    for (const [table, col] of sources) {
      const r = db.prepare(`SELECT ${col} AS name FROM ${table} WHERE account_id = ? AND ${col} IS NOT NULL AND ${col} != '' ORDER BY stat_date DESC LIMIT 1`).get(c.account_id);
      if (r && r.name) { upd.run(r.name, c.id); n++; break; }
    }
  }
  return n;
}

function importDirectory(db, dir) {
  if (!fs.existsSync(dir)) return { scanned: 0, results: [] };
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  const results = [];
  for (const f of files) {
    try {
      results.push({ file: f, ...importFile(db, path.join(dir, f)) });
    } catch (e) {
      results.push({ file: f, error: e.message });
    }
  }
  const backfilled = backfillCustomerCompany(db);
  return { scanned: files.length, backfilled, results };
}

module.exports = { importFile, importDirectory, detectType, parseCSV, decode, TABLE_DEFS, backfillCustomerCompany };
