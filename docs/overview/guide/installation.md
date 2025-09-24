# 安装指南

本文档将指导您完成 Sylis 英语学习平台的安装和配置。

## 环境要求

| 工具               | 版本要求  | 说明                 |
| ------------------ | --------- | -------------------- |
| **Node.js**        | >= 22.0.0 | JavaScript运行时环境 |
| **pnpm**           | >= 8.0.0  | 包管理器             |
| **Docker Desktop** | 最新版    | 数据库服务容器化     |
| **Python**         | >= 3.8    | 语音评测服务         |

### 安装必要工具

#### 1. 安装 Node.js

```bash
# macOS (使用 Homebrew)
brew install node@22

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows (使用 chocolatey)
choco install nodejs --version=22.0.0

# 验证安装
node --version  # 应该显示 v22.x.x
npm --version
```

#### 2. 安装 pnpm

```bash
# 使用 npm 安装
npm install -g pnpm@latest

# 或使用 curl (推荐)
curl -fsSL https://get.pnpm.io/install.sh | sh -

# 验证安装
pnpm --version  # 应该显示 8.x.x 或更高版本
```

#### 3. 安装 Docker Desktop

- **macOS**: 从 [Docker 官网](https://www.docker.com/products/docker-desktop) 下载安装
- **Windows**: 从 [Docker 官网](https://www.docker.com/products/docker-desktop) 下载安装
- **Linux**:
  ```bash
  # Ubuntu
  sudo apt-get update
  sudo apt-get install docker.io docker-compose
  sudo systemctl start docker
  sudo systemctl enable docker
  ```

#### 4. 安装 Python (语音服务)

```bash
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo apt-get install python3 python3-pip python3-venv

# Windows
# 从 python.org 下载 Python 3.11+ 安装包

# 验证安装
python3 --version  # 应该显示 3.8+ 版本
pip3 --version
```

## ⚡ 快速安装

### 1. 克隆项目

```bash
# 使用 HTTPS
git clone https://github.com/your-org/sylis.git
cd sylis

# 或使用 SSH (推荐)
git clone git@github.com:your-org/sylis.git
cd sylis
```

### 2. 安装依赖

```bash
# 安装所有工作区依赖
pnpm install

# 安装 Python 语音服务依赖
pnpm speech:install
```

### 3. 环境配置

```bash
# 复制环境变量模板
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 编辑环境变量 (详见配置指南)
nano apps/api/.env
nano apps/web/.env
```

### 4. 启动服务

```bash
# 一键启动所有服务 (推荐)
pnpm start
```

这个命令会自动：

- 检测并启动 Docker 容器 (PostgreSQL + Redis)
- 执行数据库迁移
- 填充示例数据
- 启动前端、后端和语音服务

## 分步安装

如果您需要更细粒度的控制，可以分步启动各个服务：

### 1. 启动数据库服务

```bash
# 启动 PostgreSQL 和 Redis
cd apps/api
docker-compose up -d

# 验证数据库连接
pnpm prisma:studio  # 打开 Prisma Studio
```

### 2. 数据库迁移和种子数据

```bash
# 执行数据库迁移
pnpm --filter ./apps/api run prisma:dev

# 填充示例数据
pnpm --filter ./apps/api run prisma:seed
```

### 3. 启动后端服务

```bash
# 开发模式启动后端
pnpm dev:api

# 或生产模式
pnpm build:api
pnpm start:api
```

### 4. 启动前端服务

```bash
# 开发模式启动前端
pnpm dev:web

# 或生产模式
pnpm build:web
pnpm preview:web
```

### 5. 启动语音服务

```bash
# 开发模式启动语音服务
pnpm speech:dev

# 或生产模式
pnpm speech:start
```

## 验证安装

安装完成后，您可以通过以下地址验证各个服务：

| 服务              | 地址                          | 说明           |
| ----------------- | ----------------------------- | -------------- |
| 🌐 **前端应用**   | http://localhost:5173         | Vite开发服务器 |
| 🔧 **后端API**    | http://localhost:3000         | NestJS API服务 |
| 📚 **API文档**    | http://localhost:3000/swagger | Swagger UI     |
| 🗄️ **数据库管理** | http://localhost:5555         | Prisma Studio  |
| 🎙️ **语音服务**   | http://localhost:8080         | Python语音评测 |
| 📖 **项目文档**   | http://localhost:5174         | VitePress文档  |

### 健康检查

```bash
# 检查所有服务状态
pnpm health

# 单独检查各服务
curl http://localhost:3000/health     # 后端服务
curl http://localhost:8080/health     # 语音服务
curl http://localhost:5173            # 前端服务
```

## 生产环境安装

### 使用 Docker Compose

```bash
# 构建生产镜像
docker-compose -f docker-compose.prod.yml build

# 启动生产环境
docker-compose -f docker-compose.prod.yml up -d

# 查看服务状态
docker-compose -f docker-compose.prod.yml ps
```

### 手动部署

```bash
# 构建所有应用
pnpm build

# 安装生产依赖
pnpm install --prod

# 启动服务
NODE_ENV=production pnpm start:prod
```

## 开发工具

### VS Code 配置

推荐安装以下 VS Code 扩展：

```json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "prisma.prisma",
    "ms-python.python"
  ]
}
```

### 数据库工具

```bash
# Prisma Studio (推荐)
pnpm --filter ./apps/api run prisma:studio

# 或使用其他数据库工具
# pgAdmin: http://localhost:5050
# DBeaver: 桌面应用
```

### 代码质量工具

```bash
# ESLint 检查
pnpm lint

# Prettier 格式化
pnpm format

# TypeScript 类型检查
pnpm typecheck

# 运行所有检查
pnpm check:all
```

## 常见安装问题

### Node.js 版本问题

```bash
# 如果遇到版本不兼容问题
nvm install 22
nvm use 22

# 或使用 n (macOS/Linux)
sudo npm install -g n
sudo n 22
```

### pnpm 权限问题

```bash
# macOS/Linux
sudo chown -R $(whoami) ~/.pnpm

# Windows (以管理员身份运行)
npm install -g pnpm --force
```

### Docker 相关问题

```bash
# Docker 未启动
# macOS
open /Applications/Docker.app

# Linux
sudo systemctl start docker

# Windows
# 启动 Docker Desktop

# 端口被占用
docker-compose down
lsof -ti:5432 | xargs kill -9  # PostgreSQL
lsof -ti:6379 | xargs kill -9  # Redis
```

### Python 环境问题

```bash
# 创建虚拟环境 (可选)
cd services/speech-service
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip3 install -e .

# 测试安装
python3 -c "import librosa; print('语音服务依赖安装成功')"
```

### 权限问题

```bash
# macOS/Linux 给脚本执行权限
chmod +x scripts/*.sh

# 如果遇到 EACCES 错误
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) ~/.pnpm
```

## 性能优化

### 开发环境优化

```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"

# 启用 pnpm 缓存
pnpm config set store-dir ~/.pnpm-store
pnpm config set cache-dir ~/.pnpm-cache
```

### 构建优化

```bash
# 并行构建
pnpm build --parallel

# 增量构建
pnpm build --incremental
```

## 更新指南

### 更新依赖

```bash
# 检查过时依赖
pnpm outdated

# 更新所有依赖到最新版本
pnpm update --latest

# 更新特定包
pnpm update package-name --latest
```

### 数据库迁移

```bash
# 应用新的迁移
pnpm --filter ./apps/api run prisma:dev

# 重置数据库 (谨慎使用)
pnpm --filter ./apps/api run prisma:reset
```

---

如果您在安装过程中遇到任何问题，请查看 [故障排除指南](./troubleshooting.md) 或联系开发团队。
