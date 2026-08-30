# ──────────────────────────────────────────────
# 渠道中心大脑 · 前端（React + Vite + antd）
# 多阶段构建：node:20-alpine 构建 dist → nginx:alpine 托管
# ──────────────────────────────────────────────
# ── Stage 1: 构建 ─────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com \
  && npm ci

COPY index.html vite.config.js ./
COPY src ./src

RUN npm run build

# ── Stage 2: Nginx 托管 ───────────────────────
FROM nginx:alpine

# 替换默认 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
