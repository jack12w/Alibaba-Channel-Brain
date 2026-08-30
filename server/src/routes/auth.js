'use strict';

const express = require('express');
const { db } = require('../db');
const { signToken, verifyPassword, requireAuth } = require('../auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND enabled = 1').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const member = user.member_id
    ? db.prepare('SELECT name, role, team FROM team_members WHERE id = ?').get(user.member_id)
    : null;

  const roleRow = user.role_id
    ? db.prepare('SELECT * FROM roles WHERE id = ?').get(user.role_id)
    : null;
  const permissions = roleRow
    ? db.prepare(`
        SELECT p.code FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.role_id = ? ORDER BY p.id
      `).all(roleRow.id).map((r) => r.code)
    : [];
  const dataScope = roleRow ? roleRow.data_scope : 'all';

  res.json({
    token: signToken({ ...user, role_code: roleRow ? roleRow.code : user.role, data_scope: dataScope, permissions }),
    user: {
      id: user.id, username: user.username, role: user.role,
      role_code: roleRow ? roleRow.code : user.role,
      role_name: roleRow ? roleRow.name : user.role,
      data_scope: dataScope,
      real_name: user.real_name,
      team_id: user.team_id,
      permissions,
      member_id: user.member_id, member,
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, member_id FROM users WHERE id = ?').get(req.user.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const member = user.member_id
    ? db.prepare('SELECT id, name, role, team FROM team_members WHERE id = ?').get(user.member_id)
    : null;
  res.json({ ...user, member });
});

module.exports = router;
