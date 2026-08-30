# 渠道中心数据采集器（Chrome 插件）

采集阿里内部看板数据（FBI / DeepInsight），自动同步至**渠道中心大脑**系统。

## 采集数据源

| # | 报告类型 | 页面 | 说明 |
|---|---|---|---|
| 1 | customer_data | deepinsight.alibaba-inc.com（reportId=D2019080500161401000000832264） | 客户数据（曝光/点击/询盘/GMV/广告消耗） |
| 2 | product_info | deepinsight.alibaba-inc.com componentId=864f5287（产品数组件页） | 产品数 + 优爆品数（实力优品+超级优品）→ 新商 30 天/120 天里程碑自动计算 |
| 3 | p4p_brand_ads | fbi.alibaba-inc.com id=1184441 | P4P 与品牌广告消耗数据；全量服务中客户消耗状态（有/无消耗） |
| 4 | top_diagnosis | fbi.alibaba-inc.com id=1511201 | TOP 诊断：3级类目行业数据 + 单店铺 vs 行业均值 |
| 5 | awb | fbi.alibaba-inc.com id=1936890 | AWB 售卖及渗透数据 + **"售卖客户明细"TAB（付款成功客户+付款日期 → AWB 营收自动统计）** |
| 6 | industry | deepinsight.alipay.com 门户 | 3级类目行业店铺数与效果均值 |

> 提示：AWB 页面切换到"售卖客户明细"TAB 后，该 TAB 的表格会被自动捕获上报（通用拦截机制），无需额外操作。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录 `channel-brain/extension/`
4. 工具栏出现「渠道中心数据采集」图标

## 配置（必做）

点击插件图标 → 「打开选项配置」：

| 配置项 | 说明 |
|---|---|
| 渠道中心地址 | 后端 API 地址（开发：`http://localhost:3000`；生产：服务器地址） |
| 店铺 ID | 渠道中心客户管理中的 store_id（行业类数据可留空） |
| sync_token | 渠道中心管理员在客户管理中生成的采集令牌 |
| 自动上传 | 捕获到数据后自动上传（默认开） |

## 使用

1. 登录对应看板页面（需要公司内网/SSO 登录态）
2. 打开页面后插件自动拦截数据请求并解析表格：
   - FBI 页面：切到目标日期/TAB 触发数据加载，插件自动捕获
   - DeepInsight 页面：打开报告后插件自动探测表格
3. 也可点击工具栏图标 → 「立即采集并上传」手动触发

## 采集机制

- `content/injector.js` 在 `document_start` 包裹页面 `window.fetch` / `XMLHttpRequest`
- FBI：拦截 URL 含 `WidgetAction` 的响应，解析 `{data:{value:{columns,values}}}`
- DeepInsight：递归探测 JSON 中 `columns + values/data` 表格结构
- 数据发送至 background → 防抖合并（8 秒）→ POST 渠道中心 `/api/sync/plugin`（`x-sync-token` 鉴权）
- 后端按报告类型解析入库：客户数据→`store_stats_monthly`、广告→`ad_stats_monthly`、行业→`industry_stats`、AWB→`awb_stats`（汇总）+`awb_payments`（售卖客户明细）、产品数→`product_stats`

## 目录结构

```
extension/
├── manifest.json              # MV3 清单
├── config/sources.js          # 数据源 URL 映射
├── content/injector.js        # 页面采集器（fetch/XHR 拦截 + 表格解析）
├── background/service-worker.js  # 汇总与上传
├── popup/                     # 工具栏弹窗（状态 + 手动上传）
├── options/                   # 配置页（地址/store_id/token）
└── icons/                     # 图标
```

## 常见问题

- **页面显示"未激活"**：确认当前是上述 5 个看板页面之一；FBI 页面需 URL 含对应 `id=xxx`
- **上传失败 403**：sync_token 无效或 store_id 与 token 不匹配，联系管理员重新生成
- **未捕获到表格**：刷新页面等待数据加载完成；部分 DeepInsight 报告需要滚动/切换 TAB 触发请求
- **数据未入库**：检查渠道中心「同步日志」（管理员可见）查看解析详情
