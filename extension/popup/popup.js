/* popup 逻辑：查询当前页面与状态、触发采集上传 */

const $ = (id) => document.getElementById(id);

function setText(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  if (cls) el.className = cls;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refresh() {
  // 状态
  const status = await chrome.runtime.sendMessage({ type: 'CB_GET_STATUS' }).catch(() => null);
  if (status) {
    setText('cfg', status.configured ? '已配置 ✓' : '未配置 ✗', status.configured ? 'ok' : 'err');
    setText('auto', status.autoUpload ? '开' : '关');
    setText('pending', status.pendingCount);
    if (status.last) {
      const last = status.last;
      const text = last.ok
        ? `最近上传：成功 saved=${last.saved}（${last.report}）`
        : `最近上传：失败 ${last.message}`;
      const r = $('result');
      r.style.display = 'block';
      r.textContent = text;
      r.className = 'result ' + (last.ok ? 'ok' : 'err');
    }
  }

  // 当前 tab
  const tab = await currentTab();
  if (!tab || !tab.id) return;
  const allowed = tab.url && /alibaba-inc\.com|alipay\.com/.test(tab.url);
  if (!allowed) {
    setText('page', tab.url ? '非采集页面' : '未知');
    setText('source', '-');
    $('uploadBtn').disabled = true;
    return;
  }
  setText('page', tab.url.replace(/^https?:\/\//, '').slice(0, 40));

  // 请求 content 汇报
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'CB_REQUEST_REPORT' });
    if (resp) {
      setText('source', resp.report || '-');
      const cap = await chrome.tabs.sendMessage(tab.id, { type: 'CB_REQUEST_CAPTURE' });
      setText('count', cap ? cap.count : 0);
      $('uploadBtn').disabled = !cap || !cap.count;
    }
  } catch (e) {
    setText('source', '页面未加载完成，请刷新后重试');
    $('uploadBtn').disabled = true;
  }
}

$('uploadBtn').addEventListener('click', async () => {
  const tab = await currentTab();
  $('uploadBtn').disabled = true;
  try {
    const cap = await chrome.tabs.sendMessage(tab.id, { type: 'CB_REQUEST_CAPTURE' });
    const r = await chrome.runtime.sendMessage({ type: 'CB_UPLOAD_NOW', report: cap && cap.report, tables: cap && cap.tables });
    const box = $('result');
    box.style.display = 'block';
    box.textContent = r && r.ok ? `✅ 上传成功，入库 ${r.saved} 条` : `❌ ${(r && r.message) || '上传失败'}`;
    box.className = 'result ' + (r && r.ok ? 'ok' : 'err');
  } catch (e) {
    const box = $('result');
    box.style.display = 'block';
    box.textContent = '❌ ' + e.message;
    box.className = 'result err';
  }
  $('uploadBtn').disabled = false;
});

$('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('optsLink').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

refresh();
