'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[\\/:*?"<>|]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

const DEFAULT_CATEGORIES = ['平台规则', '激励政策', '产品资料', '流程制度', '话术模板', '培训资料'];

// ---------- 分类 ----------

// GET /api/knowledge/categories
router.get('/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT kc.*, (SELECT COUNT(*) FROM knowledge_docs d WHERE d.category_id = kc.id AND d.status != 'archived') AS doc_count
    FROM knowledge_categories kc ORDER BY kc.sort, kc.id
  `).all();
  res.json(rows);
});

// POST /api/knowledge/categories — 新增分类（管理权限）
router.post('/categories', requirePermission('knowledge.manage'), (req, res) => {
  const { name, parent_id, sort } = req.body;
  if (!name) return res.status(400).json({ error: '分类名必填' });
  const info = db.prepare('INSERT INTO knowledge_categories (name, parent_id, sort) VALUES (?, ?, ?)')
    .run(name, parent_id || 0, sort || 0);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/knowledge/categories/:id
router.put('/categories/:id', requirePermission('knowledge.manage'), (req, res) => {
  const { name, sort } = req.body;
  if (!name) return res.status(400).json({ error: '分类名必填' });
  db.prepare('UPDATE knowledge_categories SET name = ?, sort = ? WHERE id = ?').run(name, sort || 0, req.params.id);
  res.json({ ok: true });
});

// ---------- 文档 ----------

// GET /api/knowledge/docs?category_id=&keyword=&page=&page_size=
router.get('/docs', (req, res) => {
  const { category_id, keyword, page = 1, page_size = 20 } = req.query;
  const where = ["d.status != 'archived'"];
  const params = {};
  if (category_id) { where.push('d.category_id = @cid'); params.cid = Number(category_id); }
  if (keyword) {
    where.push('(d.title LIKE @kw OR d.summary LIKE @kw OR d.content LIKE @kw)');
    params.kw = `%${keyword}%`;
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM knowledge_docs d ${whereSql}`).get(params).n;
  const limit = Math.min(Number(page_size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const items = db.prepare(`
    SELECT d.id, d.title, d.summary, d.category_id, d.version, d.status, d.file_name, d.file_size,
           d.created_at, d.updated_at, kc.name AS category_name,
           m.name AS updater_name
    FROM knowledge_docs d
    LEFT JOIN knowledge_categories kc ON kc.id = d.category_id
    LEFT JOIN team_members m ON m.id = d.updated_by
    ${whereSql}
    ORDER BY d.updated_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({ total, page: Number(page), page_size: limit, items });
});

// GET /api/knowledge/docs/:id — 详情 + 版本历史
router.get('/docs/:id', (req, res) => {
  const doc = db.prepare(`
    SELECT d.*, kc.name AS category_name, m.name AS creator_name
    FROM knowledge_docs d
    LEFT JOIN knowledge_categories kc ON kc.id = d.category_id
    LEFT JOIN team_members m ON m.id = d.creator_id
    WHERE d.id = ?
  `).get(req.params.id);
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  const versions = db.prepare(`
    SELECT v.*, m.name AS changer_name FROM knowledge_versions v
    LEFT JOIN team_members m ON m.id = v.changed_by
    WHERE v.doc_id = ? ORDER BY v.version DESC
  `).all(doc.id);
  res.json({ ...doc, versions });
});

// POST /api/knowledge/docs — 创建文档（可带附件，multipart/form-data）
router.post('/docs', requirePermission('knowledge.upload'), upload.single('file'), (req, res) => {
  const { title, summary, content, category_id, version_note } = req.body;
  if (!title || !category_id) return res.status(400).json({ error: 'title 和 category_id 必填' });

  const file = req.file;
  const info = db.prepare(`
    INSERT INTO knowledge_docs (category_id, title, summary, content, file_name, file_path, file_size, version, status, creator_id, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'published', ?, ?)
  `).run(
    Number(category_id), title, summary || null, content || null,
    file ? file.originalname : null, file ? path.relative(path.join(__dirname, '..', '..'), file.path) : null,
    file ? file.size : null,
    req.user.member_id || null, req.user.member_id || null
  );
  const docId = info.lastInsertRowid;

  db.prepare(`
    INSERT INTO knowledge_versions (doc_id, version, title, content, file_name, file_path, file_size, changed_by, note)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
  `).run(docId, title, content || null, file ? file.originalname : null,
    file ? path.relative(path.join(__dirname, '..', '..'), file.path) : null, file ? file.size : null,
    req.user.member_id || null, version_note || '初始版本');

  res.status(201).json({ id: docId });
});

// POST /api/knowledge/docs/:id/versions — 上传新版本（可带附件）
router.post('/docs/:id/versions', requirePermission('knowledge.upload'), upload.single('file'), (req, res) => {
  const doc = db.prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: '文档不存在' });

  const { title, content, version_note } = req.body;
  const file = req.file;
  const newVersion = doc.version + 1;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE knowledge_docs SET title = ?, content = ?, file_name = ?, file_path = ?, file_size = ?,
        version = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(title || doc.title, content !== undefined ? content : doc.content,
      file ? file.originalname : doc.file_name,
      file ? path.relative(path.join(__dirname, '..', '..'), file.path) : doc.file_path,
      file ? file.size : doc.file_size,
      newVersion, req.user.member_id || null, now, doc.id);

    db.prepare(`
      INSERT INTO knowledge_versions (doc_id, version, title, content, file_name, file_path, file_size, changed_by, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(doc.id, newVersion, title || doc.title, content !== undefined ? content : doc.content,
      file ? file.originalname : doc.file_name,
      file ? path.relative(path.join(__dirname, '..', '..'), file.path) : doc.file_path,
      file ? file.size : doc.file_size,
      req.user.member_id || null, version_note || `更新至 v${newVersion}`);
  });
  tx();
  res.json({ ok: true, version: newVersion });
});

// POST /api/knowledge/docs/:id/archive — 归档下架（管理权限）
router.post('/docs/:id/archive', requirePermission('knowledge.manage'), (req, res) => {
  const info = db.prepare(`UPDATE knowledge_docs SET status = 'archived' WHERE id = ?`).run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '文档不存在' });
  res.json({ ok: true });
});

// GET /api/knowledge/download/:id — 附件下载
router.get('/download/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(req.params.id);
  if (!doc || !doc.file_path) return res.status(404).json({ error: '附件不存在' });
  const abs = path.join(__dirname, '..', '..', doc.file_path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: '附件文件缺失' });
  res.download(abs, doc.file_name);
});

module.exports = router;
module.exports.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
