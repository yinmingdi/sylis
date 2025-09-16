<div align="center">

# 🎓 Sylis

**智能英语学习平台 | AI-Powered English Learning Platform**

<div align="center" style="white-space: nowrap;">
  <img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC" style="display: inline-block; margin: 2px;">
  <img src="https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg" alt="Node.js" style="display: inline-block; margin: 2px;">
  <img src="https://img.shields.io/badge/TypeScript-5.8+-blue.svg" alt="TypeScript" style="display: inline-block; margin: 2px;">
  <img src="https://img.shields.io/badge/React-19+-61DAFB.svg" alt="React" style="display: inline-block; margin: 2px;">
  <img src="https://img.shields.io/badge/NestJS-11+-E0234E.svg" alt="NestJS" style="display: inline-block; margin: 2px;">
  <img src="https://img.shields.io/badge/Prisma-6.9.0-2D3748.svg" alt="Prisma" style="display: inline-block; margin: 2px;">
  <img src="https://img.shields.io/badge/Docker-Enabled-2496ED.svg" alt="Docker" style="display: inline-block; margin: 2px;">
</div>

_融合AI技术、语音评测与个性化学习路径的新一代英语学习平台_

[🚀 快速开始](#-快速开始) • [📖 文档](#-文档) • [🛠️ 开发指南](#️-开发指南) • [🤝 贡献](#-贡献)

</div>

## ✨ 核心特性

<table>
<tbody>
<tr>
<td width="50%">

### 🎯 AI个性化学习

- 智能推荐系统，基于学习数据动态调整内容
- 根据薄弱环节自动生成定制化阅读材料
- 支持多种学习模式和难度级别

### 🗣️ 智能语音评测

- 基于Kaldi的GOP(Goodness of Pronunciation)分析
- 实时发音评估与精准改进建议
- 支持单词、句子和段落级别的语音练习

### 🤖 AI沉浸式对话

- 多场景角色扮演对话练习
- 实时AI聊天，自然语言交互
- 支持上下文理解和个性化回复

</td>
<td width="50%">

### 📚 智能内容生成

- 基于词汇薄弱点动态生成阅读内容
- 完形填空题自动生成
- 多样化题型与练习模式

### 📱 现代化移动端UI

- 基于Antd Mobile的精美界面设计
- 支持浅色/深色主题切换
- 响应式设计，完美适配各种设备

### 🔄 离线优先架构

- 支持离线学习功能
- 数据同步引擎，确保学习进度不丢失
- 渐进式Web应用(PWA)支持

</td>
</tr>
</tbody>
</table>

## 🏗️ 技术架构

Sylis采用现代化的**Monorepo架构**，实现前后端同构开发：

```mermaid
graph TB
    subgraph "前端应用 (React)"
        A[React 19] --> B[Antd Mobile]
        A --> C[Zustand]
        A --> D[React Router]
        A --> E[TypeScript]
    end

    subgraph "后端服务 (NestJS)"
        F[NestJS 11] --> G[Prisma ORM]
        F --> H[PostgreSQL]
        F --> I[Redis Cache]
        F --> J[JWT Auth]
    end

    subgraph "AI服务"
        K[语音服务] --> L[Kaldi GOP]
        M[OpenAI API] --> N[ChatGPT]
    end

    subgraph "共享层"
        O[Shared DTOs]
        P[Utils Library]
        Q[Type Definitions]
    end

    A --> F
    F --> K
    F --> M
    A --> O
    F --> O
```

### 📁 项目结构

```
sylis/
├── 📱 apps/
│   ├── web/                    # React前端应用
│   │   ├── src/
│   │   │   ├── components/     # 可复用组件
│   │   │   ├── pages/          # 页面组件
│   │   │   ├── hooks/          # 自定义Hooks
│   │   │   ├── router/         # 路由配置
│   │   │   └── sync-engine/    # 离线同步引擎
│   │   └── package.json
│   └── api/                    # NestJS后端API
│       ├── src/
│       │   ├── modules/        # 业务模块
│       │   ├── decorators/     # 装饰器
│       │   ├── interceptor/    # 拦截器
│       │   └── utils/          # 工具函数
│       ├── prisma/             # 数据库Schema
│       └── scripts/            # 自动化脚本
├── 📦 packages/
│   ├── shared/                 # 共享DTO和类型
│   └── utils/                  # 通用工具库
├── 🎙️ services/
│   └── speech-service/         # Python语音评测服务
├── 📖 docs/                    # 项目文档
│   ├── overview/               # API文档
│   └── components/             # 组件文档
└── 🛠️ scripts/                 # 开发脚本
```

## 🚀 快速开始

### 📋 环境要求

| 工具               | 版本要求  | 说明                 |
| ------------------ | --------- | -------------------- |
| **Node.js**        | >= 22.0.0 | JavaScript运行时环境 |
| **pnpm**           | >= 8.0.0  | 包管理器             |
| **Docker Desktop** | 最新版    | 数据库服务容器化     |
| **Python**         | >= 3.8    | 语音服务（可选）     |

### ⚡ 一键启动

```bash
# 1. 克隆项目
git clone https://github.com/your-org/sylis.git
cd sylis

# 2. 安装依赖
pnpm install

# 3. 配置环境变量(参考下方环境配置章节)
touch apps/api/.env
touch apps/web/.env

# 4. 启动所有服务（自动启动Docker、数据库迁移、填充数据）
pnpm start
```

> 💡 **首次运行提示**：启动脚本会自动检测并启动Docker、执行数据库迁移、填充示例数据，然后启动所有服务

### 🔧 分步启动

```bash
# 启动开发环境
pnpm dev

# 启动文档服务
pnpm docs

# 仅启动前端
pnpm dev:web

# 仅启动后端
pnpm dev:api
```

### 🌐 服务地址

| 服务              | 地址                          | 说明           |
| ----------------- | ----------------------------- | -------------- |
| 🌐 **前端应用**   | http://localhost:5173         | Vite开发服务器 |
| 🔧 **后端API**    | http://localhost:3000         | NestJS API服务 |
| 📚 **API文档**    | http://localhost:3000/swagger | Swagger UI     |
| 🗄️ **数据库管理** | http://localhost:5555         | Prisma Studio  |
| 📖 **项目文档**   | http://localhost:5174         | VitePress文档  |

> 💡 **开发模式**：前端可通过Vite代理(`/api`)或直接配置`VITE_APP_API_URL`访问后端服务

## 🛠️ 开发指南

### ⚙️ 环境配置

#### 后端环境变量 (`apps/api/.env`)

```bash
# 应用配置
APP_NAME="Sylis"
PORT=3000

# 数据库配置
DATABASE_URL="postgresql://postgres:12345678@localhost:5432/sylis"

# Redis配置
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""

# JWT认证配置
JWT_SECRET="jwtxw6"
JWT_EXPIRES_IN="30d"

# 邮件服务配置
MAILER_HOST="smtp.gmail.com"
MAILER_PORT=587
MAILER_USER="your-email@gmail.com"
MAILER_PASS="your-app-password"
```

#### 前端环境变量 (`apps/web/.env`)

```bash
# API服务配置
VITE_APP_API_URL="http://localhost:3000"

# AI服务配置
VITE_APP_AI_KEY="sk-xxxxxxxxxxxxxxxxxx"
VITE_APP_AI_URL="https://api.openai.com/v1"
VITE_APP_AI_MODEL="gpt-3.5-turbo"
```

#### AI服务兼容性

支持任何兼容OpenAI API格式的服务：

```bash
# DeepSeek
VITE_APP_AI_URL="https://api.deepseek.com/v1"
VITE_APP_AI_MODEL="deepseek-chat"

# Moonshot
VITE_APP_AI_URL="https://api.moonshot.cn/v1"
VITE_APP_AI_MODEL="moonshot-v1-8k"

# 本地ollama
VITE_APP_AI_URL="http://localhost:11434/v1"
VITE_APP_AI_MODEL="llama2"
```

### 🗄️ 数据库操作

```bash
# 数据库迁移
pnpm --filter ./apps/api run prisma:dev

# 填充示例数据
pnpm --filter ./apps/api run prisma:seed

# 打开数据库管理界面
pnpm --filter ./apps/api run prisma:studio

# 生成Prisma客户端
pnpm db:generate
```

### 📝 DTO管理

项目使用自动化工具管理DTO：

```bash
# 生成DTO文件
pnpm --filter ./apps/api run dto:generate

# 监听模式自动生成
pnpm --filter ./apps/api run dto:watch
```

### 🧪 测试

```bash
# 运行所有测试
pnpm test

# 端到端测试
pnpm test:e2e

# 测试覆盖率
pnpm --filter ./apps/api run test:cov
```

### 🔍 代码质量

```bash
# ESLint检查
pnpm lint

# 修复ESLint问题
pnpm lint:fix

# Prettier格式化
pnpm format

# 类型检查
pnpm typecheck
```

### 📦 构建

```bash
# 构建所有应用
pnpm build

# 单独构建
pnpm build:web    # 前端
pnpm build:api    # 后端
pnpm build:docs   # 文档
```

## 🚨 故障排除

<details>
<summary>🐳 Docker相关问题</summary>

```bash
# Docker未启动
# macOS
brew install --cask docker
open /Applications/Docker.app

# 端口被占用
docker-compose down
lsof -ti:5432 | xargs kill -9  # PostgreSQL
lsof -ti:6379 | xargs kill -9  # Redis
```

</details>

<details>
<summary>🗄️ 数据库问题</summary>

```bash
# 重置数据库
cd apps/api
docker-compose down -v      # 删除数据卷
docker-compose up -d        # 重新启动
pnpm prisma:dev            # 重新迁移
pnpm prisma:seed           # 重新填充数据
```

</details>

<details>
<summary>📦 依赖问题</summary>

```bash
# 清理并重新安装
pnpm clean                 # 清理所有node_modules
pnpm clean:cache          # 清理缓存
pnpm install              # 重新安装
```

</details>

<details>
<summary>🔧 开发服务器问题</summary>

```bash
# 清理开发缓存
rm -rf apps/web/.vite
rm -rf apps/api/dist

# 重启开发服务器
pnpm dev
```

</details>

## 📖 项目文档

| 文档类型        | 描述                   | 链接                             |
| --------------- | ---------------------- | -------------------------------- |
| 📋 **环境配置** | 详细的环境变量配置指南 | [查看文档](ENV_SETUP.md)         |
| 🏗️ **系统架构** | 技术架构与设计方案     | [查看文档](docs/overview/)       |
| 🚀 **API文档**  | RESTful API接口说明    | [查看文档](docs/overview/apis/)  |
| 🎨 **组件文档** | 前端组件使用指南       | [查看文档](docs/components/)     |
| 📝 **开发规范** | 代码规范与最佳实践     | [查看文档](docs/overview/guide/) |

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 如何贡献

1. **Fork** 本项目
2. **创建** 功能分支 (`git checkout -b feature/amazing-feature`)
3. **提交** 更改 (`pnpm commit`) - 使用规范化提交信息
4. **推送** 到分支 (`git push origin feature/amazing-feature`)
5. **创建** Pull Request

### 贡献类型

- 🐛 **Bug修复** - 修复现有问题
- ✨ **新功能** - 添加新特性
- 📚 **文档** - 改进文档
- 🎨 **UI/UX** - 界面和用户体验优化
- ⚡ **性能** - 性能优化
- 🧪 **测试** - 添加或改进测试
- 🔧 **工具** - 开发工具改进

### 开发规范

- 使用 TypeScript 编写代码
- 遵循 ESLint 和 Prettier 配置
- 编写有意义的提交信息
- 为新功能添加测试
- 更新相关文档

## 🔮 技术栈详情

### 前端技术栈

- **框架**: React 19.1 + TypeScript 5.8
- **状态管理**: Zustand 5.0
- **路由**: React Router v7.6
- **UI组件**: Antd Mobile 5.40
- **图标**: React Icons 5.5
- **构建工具**: Vite 6.3
- **样式**: Less 4.3 Modules
- **HTTP客户端**: Axios 1.10
- **AI集成**: OpenAI SDK 5.16

### 后端技术栈

- **框架**: NestJS 11 + TypeScript 5.7
- **数据库**: PostgreSQL 16 + Prisma ORM 6.9
- **缓存**: Redis 7.2 (ioredis 5.6)
- **认证**: JWT + Passport
- **文档**: Swagger/OpenAPI 11.2
- **邮件**: Nodemailer 7.0 + Handlebars
- **日志**: Winston 3.17

### 开发工具

- **包管理**: pnpm Workspace
- **代码质量**: ESLint + Prettier
- **提交规范**: Commitizen + Commitlint
- **容器化**: Docker + Docker Compose
- **文档**: VitePress + Storybook

## 📄 许可证

本项目采用 [ISC License](LICENSE) 开源协议。

## 💡 关于项目

**Sylis** /ˈsɪl-ɪs/ - 名字源于"syllable"（音节），象征着语音和语言学习的核心。

我们致力于打造新一代AI驱动的英语学习平台，让每个人都能享受个性化、智能化的语言学习体验。通过结合先进的语音识别技术、AI对话系统和个性化学习算法，为用户提供最有效的英语学习解决方案。

---

<div align="center">

**🌟 如果这个项目对你有帮助，请给我们一个Star！**

Made with ❤️ by Sylis Team

</div>
