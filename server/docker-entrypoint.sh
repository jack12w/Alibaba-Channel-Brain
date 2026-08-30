#!/bin/sh
set -e

# 数据库文件路径（与 db.js 一致：优先 DB_PATH，否则 /app/data/channel-brain.db）
DB_FILE="${DB_PATH:-/app/data/channel-brain.db}"

# 仅当数据库文件不存在时执行 seed（首次启动初始化 schema + 种子数据）
# 已有数据库则跳过，避免 seed 的破坏性清表导致数据丢失。
if [ ! -f "$DB_FILE" ]; then
  echo "[entrypoint] 数据库不存在，初始化 schema + 种子数据 ..."
  node src/seed.js
else
  echo "[entrypoint] 数据库已存在，跳过 seed。"
fi

# 执行 CMD 传入的启动命令
exec "$@"
