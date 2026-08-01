# Sylis API

基于 NestJS 的英语学习平台后端服务，提供 AI 驱动的智能英语学习功能。

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 启动数据库
docker-compose up -d

# 运行数据库迁移与种子数据
pnpm prisma:migrate
pnpm prisma:seed

# 启动开发服务器
pnpm dev
```

访问 http://localhost:3000/api 查看 Swagger API 文档

## 📋 主要功能

| 模块         | 功能                             |
| ------------ | -------------------------------- |
| **认证系统** | 用户注册、登录、JWT 认证         |
| **AI 学习**  | 语法分析、阅读理解生成、智能出题 |
| **学习管理** | 每日计划、进度跟踪、学习统计     |
| **词汇系统** | 词汇书管理、学习记录             |
| **测验系统** | 选择题生成、智能评分             |

## 🛠 技术栈

- **框架**: NestJS 11 + TypeScript
- **数据库**: PostgreSQL + Prisma ORM
- **缓存**: Redis
- **AI**: OpenAI API 集成
- **认证**: JWT + Passport
- **文档**: Swagger/OpenAPI

## 📁 项目结构

```
src/
├── modules/           # 业务模块
│   ├── auth/         # 用户认证
│   ├── ai/           # AI 服务
│   ├── learning/     # 学习管理
│   ├── books/        # 词汇书
│   ├── quiz/         # 测验系统
│   └── user/         # 用户管理
├── prisma/           # 数据库配置
└── utils/            # 工具函数
```

## 🔧 常用命令

```bash
# 开发
pnpm dev              # 启动开发服务器
pnpm dev:debug        # 调试模式启动

# 数据库
pnpm prisma:studio    # 打开数据库管理界面
pnpm prisma:generate  # 生成 Prisma 客户端

# 代码生成
pnpm dto:generate     # 生成 DTO 文件
pnpm swagger:generate # 生成 Swagger 文档

# 测试
pnpm test             # 运行单元测试
pnpm test:e2e         # 运行端到端测试
```

## 🔗 相关服务

- **前端应用**: http://localhost:5173
- **数据库**: PostgreSQL (Docker)
- **缓存**: Redis (Docker)
