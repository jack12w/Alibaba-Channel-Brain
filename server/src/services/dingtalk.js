'use strict';

/**
 * 钉钉机器人推送服务
 * - 支持加签（HMAC-SHA256）：webhook 填 https://oapi.dingtalk.com/robot/send?access_token=xxx，secret 单独填
 * - markdown 消息 + 可选 at 手机号
 * - 推送失败抛出异常（调用方捕获，不阻塞主流程）
 */

const crypto = require('crypto');

function sign(secret, timestamp) {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
  return encodeURIComponent(hmac);
}

/**
 * 发送 markdown 消息
 * @param {object} opts { webhook, secret, title, text, atMobiles }
 */
async function sendMarkdown({ webhook, secret, title, text, atMobiles }) {
  if (!webhook) throw new Error('未配置钉钉 webhook');
  const timestamp = Date.now();
  let url = webhook;
  if (secret) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}timestamp=${timestamp}&sign=${sign(secret, timestamp)}`;
  }

  const body = {
    msgtype: 'markdown',
    markdown: { title, text },
    at: { atMobiles: atMobiles || [], isAtAll: false },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeout: 10000,
  });
  const data = await res.json().catch(() => ({}));
  if (data.errcode !== 0) {
    throw new Error(`钉钉返回错误 errcode=${data.errcode} errmsg=${data.errmsg || ''}`);
  }
  return data;
}

/** 从 app_settings 读取钉钉配置 */
function getConfig(db) {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  let atMobiles = [];
  try { atMobiles = map.dingtalk_at_mobiles ? JSON.parse(map.dingtalk_at_mobiles) : []; } catch (e) { atMobiles = []; }
  return {
    webhook: map.dingtalk_webhook || '',
    secret: map.dingtalk_secret || '',
    enabled: map.dingtalk_enabled === 'true',
    atMobiles,
  };
}

module.exports = { sendMarkdown, getConfig, sign };
