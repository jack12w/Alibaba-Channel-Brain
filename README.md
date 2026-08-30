# 渠道中心大脑系统

成都阿里巴巴国际站渠道商经营管理系统。服务四大场景：运营中台育商（a）、重资产 T3/T6 续约与售卖（b）、新签客户跟进（c）、后端人事行政（d）。

## 技术栈

- 后端：Node.js + Express + SQLite（better-sqlite3）
- 前端：React + Vite + Ant Design
- 部署：Docker Compose（api + Nginx 托管前端）

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

## Docker 部署

一键构建并启动前后端（前端 Nginx 托管 + 反代 `/api`，SQLite 数据卷持久化）：

```bash
# 1. 构建并启动
docker compose up -d --build

# 2. 查看日志（首次启动会自动 seed 初始化数据）
docker compose logs -f api

# 3. 访问（前端在 8080，后端 API 在 3000 仅本机）
#    前端：http://localhost:8080
#    后端：http://localhost:3000/api/health
```

常用命令：

```bash
docker compose ps          # 查看容器状态
docker compose down        # 停止并移除容器（数据卷 db_data 保留，不丢数据）
docker compose down -v     # 停止并删除数据卷（⚠️ 会清空数据库，慎用）
docker compose logs -f web # 查看前端日志
```

说明：

- **数据持久化**：SQLite 数据库与上传文件（`data/uploads`）挂载在命名卷 `db_data`，容器重建/升级不丢失。
- **首次初始化**：entrypoint 仅在数据库文件不存在时执行 `npm run seed`（建表 + 种子数据），已存在的库不会重复清库。
- **端口**：前端 `8080:80`、后端 `127.0.0.1:3000:3000`（仅本机，由 Nginx 反代对外）。
- **时区**：容器统一 `TZ=Asia/Shanghai`，定时任务按北京时间运行。
- **JWT 密钥**：首次启动自动播种强随机密钥并持久化到数据库，无需手动配置。

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

## 目录

```
channel-brain/
├── docker-compose.yml   # Docker 编排
├── server/              # 后端 API（Express + SQLite）
└── web/                 # 前端（React + Ant Design）
```
