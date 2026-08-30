/* 选项页逻辑：读写 chrome.storage.sync */

const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(['apiBase', 'storeId', 'syncToken', 'autoUpload'], (cfg) => {
  $('apiBase').value = cfg.apiBase || 'http://localhost:3000';
  $('storeId').value = cfg.storeId || '';
  $('syncToken').value = cfg.syncToken || '';
  $('autoUpload').checked = cfg.autoUpload !== false;
});

$('save').addEventListener('click', () => {
  const cfg = {
    apiBase: $('apiBase').value.trim().replace(/\/+$/, ''),
    storeId: $('storeId').value.trim(),
    syncToken: $('syncToken').value.trim(),
    autoUpload: $('autoUpload').checked,
  };
  if (!cfg.apiBase) {
    $('msg').textContent = '⚠️ 渠道中心地址必填';
    $('msg').style.color = '#cf1322';
    return;
  }
  chrome.storage.sync.set(cfg, () => {
    $('msg').textContent = '✅ 配置已保存';
    $('msg').style.color = '#52c41a';
    setTimeout(() => { $('msg').textContent = ''; }, 2500);
  });
});
