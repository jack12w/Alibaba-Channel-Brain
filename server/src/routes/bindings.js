'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/bindings — 所有绑定（含用户信息）
router.get('/', requirePermission('system.manage'), (req, res) => {
  const rows = db.prepare(`
    SELECT b.id, b.user_id, u.username, u.role, b.manager_name, b.created_at
    FROM user_customer_binding b LEFT JOIN users u ON u.id = b.user_id
    ORDER BY u.username, b.manager_name
  `).all();
  res.json(rows);
});

// GET /api/bindings/meta/users — 用户下拉
router.get('/meta/users', requirePermission('system.manage'), (req, res) => {
  const rows = db.prepare('SELECT id, username, role FROM users WHERE enabled = 1 ORDER BY id').all();
  res.json(rows);
});

// GET /api/bindings/meta/managers — 客户经理下拉
router.get('/meta/managers', requirePermission('system.manage'), (req, res) => {
  const rows = db.prepare(`
    SELECT manager_name, COUNT(*) AS n FROM customers
    WHERE manager_name IS NOT NULL AND manager_name != ''
    GROUP BY manager_name ORDER BY n DESC
  `).all();
  res.json(rows);
});

// POST /api/bindings — 添加绑定（user_id + manager_name）
router.post('/', requirePermission('system.manage'), (req, res) => {
  const { user_id, manager_name } = req.body;
  if (!user_id || !manager_name) return res.status(400).json({ error: 'user_id 和 manager_name 必填' });
  try {
    const info = db.prepare('INSERT INTO user_customer_binding (user_id, manager_name) VALUES (?, ?)').run(user_id, manager_name);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: '绑定已存在' });
  }
});

// DELETE /api/bindings/:id — 删除绑定
router.delete('/:id', requirePermission('system.manage'), (req, res) => {
  db.prepare('DELETE FROM user_customer_binding WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
