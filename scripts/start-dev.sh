#!/bin/bash

echo "正在启动开发服务..."

# 检查 Docker Desktop 是否启动，如果未启动则尝试启动
if ! docker info > /dev/null 2>&1; then
  echo "Docker 未启动，正在尝试启动 Docker Desktop..."
  open -a Docker
  # 等待 Docker 启动完成
  while ! docker info > /dev/null 2>&1; do
    echo "等待 Docker 启动中..."
    sleep 2
  done
  echo "Docker 已启动。"
fi

# 启动 docker-compose
cd apps/api

docker-compose up -d
cd ../..

echo "数据库服务已启动..."

# 用 concurrently 启动开发服务
npx concurrently -k -n API,DTO,WEB -c green,blue,magenta \
  "pnpm --filter ./apps/api run dev" \
  "pnpm --filter ./apps/api run dto:watch" \
  "pnpm --filter ./apps/web run dev"
