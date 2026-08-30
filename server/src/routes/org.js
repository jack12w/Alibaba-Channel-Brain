'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth, requirePermission, hashPassword } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// ============ 团队 ============

router.get('/teams', requirePermission('system.manage'), (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.enabled = 1) AS member_count
    FROM teams t ORDER BY t.id
  `).all();
  res.json(rows);
});

router.post('/teams', requirePermission('system.manage'), (req, res) => {
  const { name, leader_name } = req.body;
  if (!name) return res.status(400).json({ error: '团队名必填' });
  try {
    const info = db.prepare('INSERT INTO teams (name, leader_name) VALUES (?, ?)').run(name, leader_name || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: '团队名已存在' });
  }
});

router.put('/teams/:id', requirePermission('system.manage'), (req, res) => {
  const { name, leader_name } = req.body;
  db.prepare('UPDATE teams SET name = COALESCE(?, name), leader_name = COALESCE(?, leader_name) WHERE id = ?')
    .run(name || null, leader_name || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/teams/:id', requirePermission('system.manage'), (req, res) => {
  db.prepare('UPDATE users SET team_id = NULL WHERE team_id = ?').run(req.params.id);
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ 角色（下拉用） ============

router.get('/roles', requirePermission('system.manage'), (req, res) => {
  const rows = db.prepare('SELECT id, code, name, data_scope FROM roles ORDER BY id').all();
  res.json(rows);
});

// ============ 成员 ============

router.get('/members', requirePermission('system.manage'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.real_name, u.enabled, u.created_at,
      r.code AS role_code, r.name AS role_name, r.data_scope,
      t.id AS team_id, t.name AS team_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN teams t ON t.id = u.team_id
    ORDER BY u.id
  `).all();
  res.json(rows);
});

router.post('/members', requirePermission('system.manage'), (req, res) => {
  const { username, real_name, password, role_code, team_id } = req.body;
  if (!username || !real_name || !role_code) return res.status(400).json({ error: '用户名/姓名/角色必填' });
  const role = db.prepare('SELECT id FROM roles WHERE code = ?').get(role_code);
  if (!role) return res.status(400).json({ error: '角色不存在' });
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, role, role_id, real_name, team_id, enabled)
      VALUES (?, ?, 'staff', ?, ?, ?, 1)
    `).run(username, hashPassword(password || '123456'), role.id, real_name, team_id || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: '登录账号已存在' });
  }
});

router.put('/members/:id', requirePermission('system.manage'), (req, res) => {
  const { username, real_name, password, role_code, team_id, enabled } = req.body;
  const role = role_code ? db.prepare('SELECT id FROM roles WHERE code = ?').get(role_code) : null;
  const sets = [];
  const vals = { id: req.params.id };
  if (username) { sets.push('username = @username'); vals.username = username; }
  if (real_name) { sets.push('real_name = @real_name'); vals.real_name = real_name; }
  if (role) { sets.push('role_id = @role_id'); vals.role_id = role.id; }
  if (team_id !== undefined) { sets.push('team_id = @team_id'); vals.team_id = team_id || null; }
  if (password) { sets.push('password_hash = @password_hash'); vals.password_hash = hashPassword(password); }
  if (enabled !== undefined) { sets.push('enabled = @enabled'); vals.enabled = enabled ? 1 : 0; }
  if (!sets.length) return res.status(400).json({ error: '无更新字段' });
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = @id`).run(vals);
  res.json({ ok: true });
});

// 删除成员 = 禁用（保留历史）
router.delete('/members/:id', requirePermission('system.manage'), (req, res) => {
  db.prepare('UPDATE users SET enabled = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
