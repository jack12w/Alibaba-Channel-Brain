'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');

const { db, ensureSchema } = require('./db');
const importer = require('./services/importer');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const renewalRoutes = require('./routes/renewals');
const opportunityRoutes = require('./routes/opportunities');
const dashboardRoutes = require('./routes/dashboard');
const knowledgeRoutes = require('./routes/knowledge');
const syncRoutes = require('./routes/sync');
const sellRoutes = require('./routes/sell');
const workRoutes = require('./routes/work');
const monitorRoutes = require('./routes/monitor');
const settingsRoutes = require('./routes/settings');
const goalsRoutes = require('./routes/goals');
const milestoneRoutes = require('./routes/milestones');
const adsRoutes = require('./routes/ads');
const revenueRoutes = require('./routes/revenue');
const campRoutes = require('./routes/camp');
const bindingRoutes = require('./routes/bindings');
const orgRoutes = require('./routes/org');
const importRoutes = require('./routes/import');
const ruleEngine = require('./services/ruleEngine');
const monitorEngine = require('./services/monitorEngine');
const renewalService = require('./services/renewalService');

const PORT = process.env.PORT || 3000;

ensureSchema();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 业务路由
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/renewals', renewalRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/sell', sellRoutes);
app.use('/api/work', workRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/camp', campRoutes);
app.use('/api/bindings', bindingRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/import', importRoutes);

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: '服务器内部错误', detail: err.message });
});

// 每日 09:00 扫描导入目录（真实数据 CSV）
// 目录优先取系统设置页配置，未配置时回退到默认桌面目录
const DEFAULT_IMPORT_DIR = 'C:/Users/TFKJ/Desktop/渠道数据导入';
function getImportDir() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'import_dir'").get();
  return row && row.value ? row.value : DEFAULT_IMPORT_DIR;
}
function runImport() {
  try {
    const dir = getImportDir();
    const r = importer.importDirectory(db, dir);
    console.log(`[import] 目录 ${dir}：扫描 ${r.scanned} 文件，回填公司名 ${r.backfilled} 家`);
    for (const x of r.results) {
      if (x.error) console.warn(`[import] ✗ ${x.file}: ${x.error}`);
    }
  } catch (e) {
    console.error('[import] 扫描失败', e.message);
  }
}
runImport();
cron.schedule('0 9 * * *', runImport);

// 每日 01:00 售卖机会规则扫描
cron.schedule('0 1 * * *', () => {
  try {
    const r = ruleEngine.scan(db);
    console.log(`[cron] 售卖机会扫描：规则 ${r.rules} × 客户 ${r.customers} → 命中 ${r.hits}（新增 ${r.created}）`);
  } catch (e) {
    console.error('[cron] 售卖机会扫描失败', e.message);
  }
});

// 每日 00:20 指标持续监控检查
cron.schedule('20 0 * * *', () => {
  monitorEngine.check(db).then((r) => {
    console.log(`[cron] 指标监控检查：${r.checked} 条监控 → 新告警 ${r.created}（推送 ${r.pushed}）`);
  }).catch((e) => {
    console.error('[cron] 指标监控检查失败', e.message);
  });
});

// 每日 00:10 续约预警快照（README 承诺；goalEngine 依赖此快照计算续约目标达成）
cron.schedule('10 0 * * *', () => {
  try {
    const n = renewalService.snapshot(db);
    console.log(`[cron] 续约预警快照：${n} 条（${renewalService.todayStr()}）`);
  } catch (e) {
    console.error('[cron] 续约预警快照失败', e.message);
  }
});

app.listen(PORT, () => {
  console.log(`[server] 渠道中心大脑 API 已启动：http://localhost:${PORT}`);
});
