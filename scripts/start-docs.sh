#!/bin/bash

echo "正在启动文档服务..."

# 检查并安装文档依赖
cd docs/overview
if [ ! -d "node_modules" ]; then
  echo "安装文档依赖..."
  pnpm install
fi
cd ../..

# 检查并安装组件库依赖
cd docs/components
if [ ! -d "node_modules" ]; then
  echo "安装组件库依赖..."
  pnpm install
fi
cd ../..

echo "准备启动文档和组件库服务..."

# 使用 concurrently 同时启动文档和组件库服务
npx concurrently -k -n DOCS,COMPONENTS -c yellow,cyan \
  "cd docs/overview && pnpm run docs:dev" \
  "cd docs/components && pnpm run docs:dev"
