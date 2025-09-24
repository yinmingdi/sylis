#!/bin/bash

echo "正在启动所有服务..."

# 使用 concurrently 并行启动开发服务和文档服务
npx concurrently -k -n DEV,DOCS -c cyan,yellow \
  "./scripts/start-dev.sh" \
  "./scripts/start-docs.sh"
