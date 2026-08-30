'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'channel-brain-dev-secret-change-in-production';
const TOKEN_TTL = '12h';

function signToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      username: user.username,
      role: user.role,
      role_code: user.role_code,
      member_id: user.member_id,
      data_scope: user.data_scope,
      real_name: user.real_name,
      team_id: user.team_id,
      permissions: user.permissions || [],
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/**
 * 权限点校验中间件：requirePermission('knowledge.upload')
 */
function requirePermission(code) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    const perms = req.user.permissions || [];
    if (perms.includes('system.manage') || perms.includes(code)) return next();
    return res.status(403).json({ error: '无权限执行此操作' });
  };
}

/**
 * 兼容旧调用：requireRole('admin', 'manager')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: '无权限执行此操作' });
  };
}

/**
 * 数据范围过滤（行级隔离）
 * 用法：const scope = scopeFilter('c.', req.user); where.push(scope.sql)
 * all → 无过滤；team → 本团队成员负责的记录；self → 本人负责的记录
 */
function scopeFilter(alias, user) {
  const a = alias || '';
  const scope = user && user.data_scope ? user.data_scope : 'all';
  const mid = user && user.member_id ? user.member_id : null;
  if (scope === 'all') return { sql: '', params: {} };
  if (scope === 'team') {
    if (!mid) return { sql: '1 = 0', params: {} };
    return {
      sql: `${a}owner_id IN (SELECT id FROM team_members WHERE team = (SELECT team FROM team_members WHERE id = @__mid))`,
      params: { __mid: mid },
    };
  }
  // self
  if (!mid) return { sql: '1 = 0', params: {} };
  return { sql: `${a}owner_id = @__mid`, params: { __mid: mid } };
}

/**
 * 真实数据行级隔离（基于 user_customer_binding ↔ 客户经理姓名）
 * all → 无过滤；self/team → 仅本账号绑定的客户经理名下客户
 */
function dataScope(alias, user, db, field) {
  const a = alias || '';
  const scope = user && user.data_scope ? user.data_scope : 'all';
  if (scope === 'all') return { sql: '', params: {} };
  // 隔离字段：中台运营用 operator_name，其余（客户经理/新签主管）用 manager_name
  const f = field || (user.role_code === 'mid_operator' ? 'operator_name' : 'manager_name');
  const realName = user.real_name;
  if (!realName) return { sql: '1 = 0', params: {} };

  if (scope === 'self') {
    return { sql: `${a}${f} = @__self`, params: { __self: realName } };
  }

  if (scope === 'team') {
    if (!db || !user.team_id) return { sql: '1 = 0', params: {} };
    // 团队内所有「客户经理」姓名
    const members = db.prepare(`
      SELECT u.real_name FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.team_id = ? AND r.code = 'account_manager' AND u.real_name IS NOT NULL AND u.real_name != ''
    `).all(user.team_id);
    const names = members.map((m) => m.real_name);
    if (!names.length) return { sql: '1 = 0', params: {} };
    const params = {};
    const ph = names.map((n, i) => { params[`__mn${i}`] = n; return `@__mn${i}`; }).join(',');
    return { sql: `${a}${f} IN (${ph})`, params };
  }

  return { sql: '1 = 0', params: {} };
}

module.exports = { signToken, hashPassword, verifyPassword, requireAuth, requireRole, requirePermission, scopeFilter, dataScope, JWT_SECRET };
