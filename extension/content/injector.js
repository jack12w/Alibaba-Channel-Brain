/**
 * 看板数据采集器（content script，document_start 注入）
 *
 * 采集机制（参考既有 P4P 脚本）：
 * 1. 在页面最早阶段包裹 window.fetch / XMLHttpRequest
 * 2. FBI 看板：拦截 URL 含 "WidgetAction" 的响应，解析 { data: { value: { columns, values } } }
 * 3. DeepInsight：探测 JSON 响应中 columns+values/data 结构（递归查找）
 * 4. 解析为 [{ title, columns, rows }] 表格，发送给 background 统一上传
 */
(function () {
  if (window.__cb_injected) return;
  window.__cb_injected = true;

  const source = (typeof cbDetectSource === 'function') ? cbDetectSource(location.href) : null;
  if (!source) return;

  /** 已捕获表格：Map<url#title, {tables, ts}> */
  const captured = new Map();
  let lastReportTs = 0;

  function getConfig(cb) {
    try {
      chrome.storage.sync.get(['apiBase', 'storeId', 'syncToken', 'autoUpload'], cb);
    } catch (e) {
      cb({});
    }
  }

  function sendCaptured(reportType, tables, force) {
    if (!tables || !tables.length) return;
    const now = Date.now();
    if (!force && now - lastReportTs < 5000) return; // 防抖
    lastReportTs = now;
    try {
      chrome.runtime.sendMessage({
        type: 'CB_CAPTURED',
        report: reportType || source.id,
        capture: source.capture,
        tables,
        url: location.href,
        ts: now,
      }).catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- 表格解析 ----------

  /** FBI WidgetAction：{ data: { value: { columns, values } } } */
  function extractFbiTable(json) {
    try {
      const v = json && json.data && json.data.value;
      if (v && Array.isArray(v.columns) && Array.isArray(v.values)) {
        const cols = v.columns.map((c) => {
          const cells = (c && c.cells) || [];
          let name = '';
          for (let i = cells.length - 1; i >= 0; i--) {
            const cell = cells[i];
            if (!cell) continue;
            const label = (cell.props && cell.props.label) || cell.value || cell.name;
            if (label) { name = label; break; }
          }
          return String(name || '');
        });
        return [{ title: '看板数据', columns: cols, rows: v.values }];
      }
    } catch (e) { /* ignore */ }
    return [];
  }

  /** DeepInsight：递归查找 columns + values/data 结构 */
  function deepFindTables(obj, depth, out) {
    if (!obj || typeof obj !== 'object' || depth > 8 || out.length >= 10) return out;
    if (Array.isArray(obj.columns)) {
      const rows = Array.isArray(obj.values) ? obj.values : Array.isArray(obj.data) ? obj.data : null;
      if (rows) {
        const cols = obj.columns.map((c) =>
          typeof c === 'string' ? c : String((c && (c.name || c.title || c.label || c.columnName)) || ''));
        out.push({ title: '数据表格', columns: cols, rows });
        return out;
      }
    }
    if (Array.isArray(obj)) {
      for (const item of obj) deepFindTables(item, depth + 1, out);
    } else {
      for (const k of Object.keys(obj)) deepFindTables(obj[k], depth + 1, out);
    }
    return out;
  }

  function extractDeepinsight(json) {
    return deepFindTables(json, 0, []);
  }

  function tryParse(text, capture) {
    if (!text || text.length < 500) return [];
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return [];
    }
    if (typeof json === 'string') {
      try { json = JSON.parse(json); } catch (e) { return []; }
    }
    const tables = capture === 'fbi_widget' ? extractFbiTable(json) : extractDeepinsight(json);
    return tables;
  }

  function recordTables(capture, text, url) {
    const tables = tryParse(text, capture);
    if (!tables.length) return;
    const key = url + '#' + (tables[0].title || 't');
    captured.set(key, { tables, ts: Date.now() });
    sendCaptured(source.id, tables, false);
  }

  // ---------- 包裹 fetch ----------

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    const p = origFetch.apply(this, args);
    if (reqUrl && isCapturable(reqUrl)) {
      p.then(async (resp) => {
        try {
          const clone = resp.clone();
          const text = await clone.text();
          recordTables(source.capture, text, reqUrl);
        } catch (e) { /* ignore */ }
      }).catch(() => {});
    }
    return p;
  };

  // ---------- 包裹 XHR ----------

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cb_url = url || '';
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const url = this.__cb_url || '';
    if (url && isCapturable(url)) {
      this.addEventListener('load', function () {
        try {
          recordTables(source.capture, this.responseText || '', url);
        } catch (e) { /* ignore */ }
      });
    }
    return origSend.apply(this, arguments);
  };

  function isCapturable(url) {
    const u = String(url);
    if (source.capture === 'fbi_widget') {
      return u.includes('WidgetAction') || u.includes('widget');
    }
    // deepinsight：JSON 数据接口常见关键词
    return /query|report|data|table|chart/i.test(u) && !/\.(css|js|png|jpg|gif|svg|woff)/i.test(u);
  }

  // ---------- 响应 popup 的"立即上传"请求 ----------

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'CB_REQUEST_CAPTURE') {
        const all = [];
        for (const [, v] of captured) all.push(...v.tables);
        sendResponse({ report: source.id, capture: source.capture, tables: all, count: all.length });
      }
      if (msg && msg.type === 'CB_REQUEST_REPORT') {
        sendResponse({ report: source.id, capture: source.capture, url: location.href });
      }
      return true;
    });
  } catch (e) { /* ignore */ }

  // 页面加载后自动上报一次（若已有捕获）
  window.addEventListener('load', () => {
    setTimeout(() => {
      const all = [];
      for (const [, v] of captured) all.push(...v.tables);
      sendCaptured(source.id, all, true);
    }, 4000);
  });

  console.log('[渠道中心采集器] 已激活：', source.name, '|', source.capture);
})();
