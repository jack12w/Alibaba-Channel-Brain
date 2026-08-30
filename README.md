# 渠道中心大脑系统

成都阿里巴巴国际站渠道商经营管理系统。服务四大场景：运营中台育商（a）、重资产 T3/T6 续约与售卖（b）、新签客户跟进（c）、后端人事行政（d）。

## 技术栈

- 后端：Node.js + Express + SQLite（better-sqlite3）
- 前端：React + Vite + Ant Design
- 部署：Linux + Nginx + PM2（规划中）

## 环境要求

- **Node.js 20 LTS**（项目按 Node 20 构建，已通过 `.nvmrc` 锁定；`better-sqlite3` 为原生模块，跨 Node 大版本（如 20↔22）需重新编译）。
- 首次安装或切换 Node 版本后，若后端启动报 `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION` 不匹配，执行：
  ```bash
  cd server && npm rebuild better-sqlite3
  ```
- `npm run seed` 为**破坏性操作**：会清空全部业务表（customers / users / roles / opportunities / renewal_snapshots 等）后重灌种子数据。仅用于全新初始化；若数据库已有数据需强制重灌，必须显式 `SEED_FORCE=1 npm run seed`。

## 快速开始

```bash
# 1. 安装后端依赖并初始化数据
cd server
npm install
npm run seed        # 初始化 schema + 种子数据（幂等）

# 2. 启动后端（http://localhost:3000）
npm start

# 3. 新终端：安装前端依赖并启动（http://localhost:5173）
cd ../web
npm install
npm run dev
```

## 测试账号（种子数据）

| 账号 | 密码 | 角色 |
|---|---|---|
| admin | admin123 | 管理员 |
| ops | ops123 | 运营 |
| renewal | renewal123 | 续约顾问 |
| sales | sales123 | 新签销售 |
| hr | hr123 | 人事 |

## 关键口径

- **T3**：到期日在未来 3 个月内（含）的可续约客户
- **T6**：到期日在未来 6 个月内（含）的可续约客户（T3 ⊆ T6）

续约预警每日 00:10 自动生成快照，也可在续约面板手动触发。

## 文档

- [架构设计文档](docs/architecture.md)

## 目录

```
channel-brain/
├── docs/          # 设计文档
├── server/        # 后端 API（Express + SQLite）
├── web/           # 前端（React + Ant Design）
├── extension/     # 浏览器插件（Chrome MV3，规划中）
└── deploy/        # 部署脚本（规划中）
```
