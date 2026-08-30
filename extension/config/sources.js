/**
 * 数据源配置：URL 匹配 → 报告类型
 * content script 与 background 共用（以全局变量形式注入）
 */
var CB_SOURCES = [
  {
    id: 'product_info',
    name: '产品数/优爆品数',
    urlHost: 'deepinsight.alibaba-inc.com',
    urlContains: 'componentId=864f5287',
    capture: 'deepinsight',
  },
  {
    id: 'pending_gmv',
    name: '90信保挂账金额',
    urlHost: 'deepinsight.alibaba-inc.com',
    urlContains: 'componentId=b542bc43',
    capture: 'deepinsight',
  },
  {
    id: 'customer_data',
    name: '客户数据',
    urlHost: 'deepinsight.alibaba-inc.com',
    urlContains: 'D2019080500161401000000832264',
    capture: 'deepinsight',
  },
  {
    id: 'p4p_brand_ads',
    name: 'P4P与品牌广告',
    urlHost: 'fbi.alibaba-inc.com',
    urlContains: 'id=1184441',
    capture: 'fbi_widget',
  },
  {
    id: 'top_diagnosis',
    name: 'TOP诊断（行业）',
    urlHost: 'fbi.alibaba-inc.com',
    urlContains: 'id=1511201',
    capture: 'fbi_widget',
  },
  {
    id: 'awb',
    name: 'AWB售卖数据',
    urlHost: 'fbi.alibaba-inc.com',
    urlContains: 'id=1936890',
    capture: 'fbi_widget',
  },
  {
    id: 'industry',
    name: '3级类目行业',
    urlHost: 'deepinsight.alipay.com',
    urlContains: '',
    capture: 'deepinsight',
  },
];

/** 根据 URL 识别当前页面属于哪个数据源（返回 source 对象或 null） */
function cbDetectSource(url) {
  try {
    const u = new URL(url);
    for (const s of CB_SOURCES) {
      const hostOk = u.hostname.includes(s.urlHost);
      const idOk = !s.urlContains || u.href.includes(s.urlContains);
      if (hostOk && idOk) return s;
    }
    // 兜底：FBI 任意 dashboard 页面也按 fbi_widget 采集（report 由页面决定，可手动指定）
    if (u.hostname.includes('fbi.alibaba-inc.com')) {
      return { id: 'fbi_unknown', name: 'FBI看板', urlHost: u.hostname, urlContains: '', capture: 'fbi_widget' };
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}
