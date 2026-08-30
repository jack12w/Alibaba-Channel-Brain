'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'channel-brain.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql);
  console.log('[db] schema initialized');
}

// 幂等初始化：所有建表语句均为 IF NOT EXISTS，可安全重复执行
function ensureSchema() {
  initSchema();
  migrate();
}

// 轻量迁移：为已存在的旧表补充新增列（IF NOT EXISTS 不会修改已有表）
function migrate() {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('role_id')) {
    db.exec('ALTER TABLE users ADD COLUMN role_id INTEGER');
    console.log('[db] migrated: users.role_id');
  }
  const custCols = db.prepare('PRAGMA table_info(customers)').all().map((c) => c.name);
  if (!custCols.includes('sync_token')) {
    db.exec('ALTER TABLE customers ADD COLUMN sync_token TEXT');
    console.log('[db] migrated: customers.sync_token');
  }
  const alertCols = db.prepare('PRAGMA table_info(metric_alerts)').all().map((c) => c.name);
  if (!alertCols.includes('alert_type')) {
    db.exec('ALTER TABLE metric_alerts ADD COLUMN alert_type TEXT DEFAULT \'breach\'');
    db.exec('ALTER TABLE metric_alerts ADD COLUMN prev_value REAL');
    console.log('[db] migrated: metric_alerts.alert_type/prev_value');
  }
  const pkgCols = db.prepare('PRAGMA table_info(customers)').all().map((c) => c.name);
  if (!pkgCols.includes('p_package_amount')) {
    db.exec('ALTER TABLE customers ADD COLUMN p_package_amount REAL');
    console.log('[db] migrated: customers.p_package_amount');
  }
  const statCols = db.prepare('PRAGMA table_info(store_stats_monthly)').all().map((c) => c.name);
  if (!statCols.includes('pending_gmv')) {
    db.exec('ALTER TABLE store_stats_monthly ADD COLUMN pending_gmv REAL');
    console.log('[db] migrated: store_stats_monthly.pending_gmv');
  }

  // v2：customers 补真实数据字段（一个账号=一个客户）
  const c2Cols = db.prepare('PRAGMA table_info(customers)').all().map((c) => c.name);
  const custV2Cols = {
    account_id: 'TEXT', comp_id: 'TEXT', global_id: 'TEXT',
    manager_name: 'TEXT', supervisor_name: 'TEXT', region: 'TEXT',
    channel_type: 'TEXT', region_large: 'TEXT',
    industry_l1: 'TEXT', industry_l2: 'TEXT', industry_l3: 'TEXT',
    is_gold: 'TEXT', shop_url: 'TEXT', lifecycle: 'TEXT', contract_start: 'TEXT',
  };
  for (const [col, type] of Object.entries(custV2Cols)) {
    if (!c2Cols.includes(col)) {
      db.exec(`ALTER TABLE customers ADD COLUMN ${col} ${type}`);
      console.log(`[db] migrated: customers.${col}`);
    }
  }
  // account_id 唯一索引（一个账号=一个客户），须在列添加后创建
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_account ON customers(account_id)');

  // v3：组织成员（users 加真实姓名/团队；customers 加中台运营）
  const uCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const userV3 = { real_name: 'TEXT', team_id: 'INTEGER' };
  for (const [col, type] of Object.entries(userV3)) {
    if (!uCols.includes(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
      console.log(`[db] migrated: users.${col}`);
    }
  }
  const c3Cols = db.prepare('PRAGMA table_info(customers)').all().map((c) => c.name);
  if (!c3Cols.includes('operator_name')) {
    db.exec('ALTER TABLE customers ADD COLUMN operator_name TEXT');
    console.log('[db] migrated: customers.operator_name');
  }
}

module.exports = { db, DB_PATH, ensureSchema, initSchema };
