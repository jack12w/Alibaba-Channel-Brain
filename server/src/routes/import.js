'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');
const importer = require('../services/importer');

const router = express.Router();
router.use(requireAuth);

// multer/busboy 对非 latin1 文件名用 latin1 解码，中文需转回 utf8
function fixName(name) {
  if (/[\u4e00-\u9fff]/.test(name)) return name;
  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  return /[\u4e00-\u9fff]/.test(fixed) ? fixed : name;
}

// 保留原始文件名（含中文），detectType 依赖文件名子串识别表类型
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${fixName(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// POST /api/import/upload — 上传 CSV 并即时导入（复用 importFile 的 hash 去重 + 幂等 upsert）
router.post('/upload', requirePermission('system.manage'), upload.array('files', 50), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: '未接收到文件' });

  const results = [];
  for (const f of files) {
    try {
      const r = importer.importFile(db, f.path);
      results.push({ file: fixName(f.originalname), ...r });
    } catch (e) {
      results.push({ file: fixName(f.originalname), error: e.message });
    } finally {
      try { fs.unlinkSync(f.path); } catch (_) { /* 临时文件清理失败可忽略 */ }
    }
  }
  res.json({ ok: true, results });
});

module.exports = router;
