/**
 * 渠道中心数据采集器 — background service worker
 * 职责：接收 content 捕获的表格数据 → 防抖合并 → 上传渠道中心 /api/sync/plugin
 */

const DEFAULT_CONFIG = {
  apiBase: 'http://localhost:3000',
  storeId: '',
  syncToken: '',
  autoUpload: true,
};

const PENDING_KEY = 'cb_pending'; // { report, tables[], ts }
const LAST_RESULT_KEY = 'cb_last_result';

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (cfg) => resolve(cfg || DEFAULT_CONFIG));
  });
}

function saveLastResult(r) {
  chrome.storage.local.set({ [LAST_RESULT_KEY]: { ...r, ts: Date.now() } });
}

async function uploadNow(report, tables) {
  const cfg = await getConfig();
  if (!cfg.apiBase || !cfg.syncToken) {
    saveLastResult({ ok: false, message: '未配置渠道中心地址或 sync_token，请打开插件选项页配置' });
    return { ok: false, message: '未配置 apiBase/syncToken' };
  }
  if (!tables || !tables.length) {
    saveLastResult({ ok: false, message: '没有待上传的数据（请先打开看板页面加载数据）' });
    return { ok: false, message: '无数据' };
  }

  const payload = {
    store_id: cfg.storeId || undefined,
    source: report === 'customer_data' || report === 'industry' ? 'deepinsight' : 'fbi',
    report,
    date: new Date().toISOString().slice(0, 10),
    tables,
  };

  try {
    const resp = await fetch(`${cfg.apiBase.replace(/\/$/, '')}/api/sync/plugin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sync-token': cfg.syncToken,
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      saveLastResult({ ok: false, report, message: data.error || `HTTP ${resp.status}` });
      return { ok: false, message: data.error || `HTTP ${resp.status}` };
    }
    saveLastResult({ ok: true, report, saved: data.saved, logs: data.logs });
    return { ok: true, saved: data.saved };
  } catch (e) {
    saveLastResult({ ok: false, report, message: e.message });
    return { ok: false, message: e.message };
  }
}

/** 按 report 分组累积待上传数据，防抖 8s 后上传 */
let uploadTimer = null;
async function queueUpload(report, tables) {
  const cfg = await getConfig();
  if (!cfg.autoUpload) return;

  const { [PENDING_KEY]: pending } = await chrome.storage.local.get(PENDING_KEY);
  const p = pending && pending.report === report ? pending : { report, tables: [], ts: Date.now() };
  // 合并（按 title 去重）
  const seen = new Set(p.tables.map((t) => t.title));
  for (const t of tables) {
    if (!seen.has(t.title)) { p.tables.push(t); seen.add(t.title); }
  }
  p.ts = Date.now();
  await chrome.storage.local.set({ [PENDING_KEY]: p });

  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(async () => {
    const { [PENDING_KEY]: cur } = await chrome.storage.local.get(PENDING_KEY);
    if (!cur) return;
    await chrome.storage.local.remove(PENDING_KEY);
    await uploadNow(cur.report, cur.tables);
  }, 8000);
}

// ---------- 消息处理 ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg) return sendResponse({ ok: false });
    switch (msg.type) {
      case 'CB_CAPTURED': {
        await queueUpload(msg.report, msg.tables);
        return sendResponse({ ok: true });
      }
      case 'CB_UPLOAD_NOW': {
        const { [PENDING_KEY]: pending } = await chrome.storage.local.get(PENDING_KEY);
        if (pending) {
          await chrome.storage.local.remove(PENDING_KEY);
          const r = await uploadNow(pending.report, pending.tables);
          return sendResponse(r);
        }
        const r = await uploadNow(msg.report || null, msg.tables || []);
        return sendResponse(r);
      }
      case 'CB_GET_STATUS': {
        const cfg = await getConfig();
        const { [LAST_RESULT_KEY]: last } = await chrome.storage.local.get(LAST_RESULT_KEY);
        const { [PENDING_KEY]: pending } = await chrome.storage.local.get(PENDING_KEY);
        return sendResponse({
          configured: !!(cfg.apiBase && cfg.syncToken),
          apiBase: cfg.apiBase,
          storeId: cfg.storeId,
          autoUpload: cfg.autoUpload,
          pendingCount: pending ? pending.tables.length : 0,
          last: last || null,
        });
      }
      default:
        return sendResponse({ ok: false });
    }
  })();
  return true; // 异步响应
});

// 安装时初始化默认配置
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULT_CONFIG, (cfg) => {
    if (!cfg.apiBase || !cfg.syncToken) {
      chrome.storage.sync.set(DEFAULT_CONFIG);
    }
  });
});
