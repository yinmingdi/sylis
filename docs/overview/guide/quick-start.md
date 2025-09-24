# 快速开始

欢迎使用 Sylis 智能英语学习平台！本指南将帮助您在几分钟内启动和运行项目。

## 前置要求

在开始之前，请确保您的系统已安装以下软件：

| 工具               | 版本要求  | 用途                 |
| ------------------ | --------- | -------------------- |
| **Node.js**        | >= 22.0.0 | JavaScript运行时环境 |
| **pnpm**           | >= 8.0.0  | 包管理器             |
| **Docker Desktop** | 最新版    | 数据库服务容器化     |
| **Python**         | >= 3.8    | 语音评测服务         |

> **提示**: 如果您需要详细的安装指南，请查看 [安装文档](./installation.md)。

## ⚡ 一键安装

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

# 配置必要的环境变量
# 注意：模板文件只提供了变量名称，需要填入您自己的配置值
# 请根据 configuration.md 文档配置数据库、Redis、AI API 等服务
```

### 4. 启动所有服务

```bash
# 一键启动 (推荐)
pnpm start
```

这个命令会自动完成：

- ✅ 启动 Docker 容器 (PostgreSQL + Redis)
- ✅ 执行数据库迁移
- ✅ 填充示例数据
- ✅ 启动前端、后端和语音服务

## 访问应用

启动成功后，您可以通过以下地址访问各个服务：

| 服务              | 地址                          | 说明         |
| ----------------- | ----------------------------- | ------------ |
| 🌐 **前端应用**   | http://localhost:5173         | 主应用界面   |
| 🔧 **后端API**    | http://localhost:3000         | API 服务     |
| 📚 **API文档**    | http://localhost:3000/swagger | 接口文档     |
| 🗄️ **数据库管理** | http://localhost:5555         | 数据库管理   |
| 🎙️ **语音服务**   | http://localhost:8080         | 语音评测服务 |
| 📖 **项目文档**   | http://localhost:5174         | 项目文档     |

## 分步启动 (可选)

如果您需要更细粒度的控制：

```bash
# 仅启动前端
pnpm dev:web

# 仅启动后端
pnpm dev:api

# 仅启动语音服务
pnpm speech:dev

# 启动文档服务
pnpm docs

# 检查所有服务状态
pnpm health
```

## 下一步

恭喜！现在您已经成功启动了 Sylis 项目。以下是一些建议的后续步骤：

### 开始开发

1. **熟悉项目结构** - 浏览 `apps/web/src` 和 `apps/api/src` 目录
2. **查看示例数据** - 访问 http://localhost:5555 查看数据库内容
3. **尝试 API** - 访问 http://localhost:3000/swagger 查看接口文档
4. **探索前端** - 在浏览器中打开 http://localhost:5173

### 深入了解

| 主题            | 文档链接                       | 说明               |
| --------------- | ------------------------------ | ------------------ |
| 🏗️ **系统架构** | [架构文档](./architecture.md)  | 了解技术架构和设计 |
| ⚙️ **环境配置** | [配置文档](./configuration.md) | 详细配置指南       |
| 🛠️ **开发规范** | [开发标准](./standards.md)     | 代码规范和最佳实践 |
| 🤝 **贡献指南** | [贡献文档](./contribution.md)  | 如何参与项目开发   |

### 常用命令

```bash
# 代码质量检查
pnpm lint          # ESLint 检查
pnpm format        # Prettier 格式化
pnpm typecheck     # TypeScript 类型检查

# 数据库操作
pnpm db:studio     # 打开数据库管理界面
pnpm db:seed       # 重新填充示例数据

# 测试
pnpm test          # 运行所有测试
pnpm test:coverage # 测试覆盖率报告

# 构建
pnpm build         # 构建生产版本
```

## 遇到问题？

如果在启动过程中遇到任何问题，请查看我们的故障排除指南：

### 常见问题快速解决

```bash
# Docker 未启动
open /Applications/Docker.app  # macOS
sudo systemctl start docker   # Linux

# 端口被占用
pnpm clean:ports              # 清理所有项目端口

# 依赖问题
pnpm clean && pnpm install    # 清理并重新安装

# 数据库连接问题
pnpm db:reset                 # 重置数据库
```

### 获取帮助

- 📖**详细故障排除**: [故障排除指南](./troubleshooting.md)
- 🐛**报告问题**: [GitHub Issues](https://github.com/your-org/sylis/issues)
- 💬**社区讨论**: [GitHub Discussions](https://github.com/your-org/sylis/discussions)

---

## 欢迎加入 Sylis！

现在您已经准备好开始开发了！如果您有任何问题或建议，欢迎通过 GitHub Issues 或 Discussions 与我们交流。
