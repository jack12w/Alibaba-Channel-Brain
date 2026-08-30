# ──────────────────────────────────────────────
# 渠道中心大脑 · 后端 API 服务
# 基础镜像参考技能平台（agent-skill-platform）实践：node:20-alpine
# better-sqlite3 为原生模块，Alpine 需 python3/make/g++ 编译
# ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# 原生模块编译依赖（better-sqlite3 需 musl 重新编译）
RUN apk add --no-cache python3 make g++

# 先拷贝依赖清单，利用 Docker 层缓存（源码改动不重复装依赖）
COPY package.json package-lock.json ./

# 用 npmmirror 加速（国内环境）
RUN npm config set registry https://registry.npmmirror.com \
  && npm ci --omit=dev

# 拷贝源码与入口脚本
COPY src ./src
COPY docker-entrypoint.sh ./

# 确保数据目录存在（挂载卷前先建好，避免权限问题）
RUN mkdir -p /app/data && chown -R node:node /app/data

# 暴露端口（与 index.js 默认一致）
EXPOSE 3000

# 时区统一为北京时间（cron 定时任务按本地时区跑）
ENV TZ=Asia/Shanghai \
    NODE_ENV=production

# 数据目录挂载点（DB_PATH 与 uploads 均在此）
VOLUME ["/app/data"]

RUN chmod +x /app/docker-entrypoint.sh

USER node

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
