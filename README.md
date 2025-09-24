# Sylis

![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/typescript-5.0+-blue?style=flat-square&logo=typescript)
![React](https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react)
![NestJS](https://img.shields.io/badge/nestjs-11-e0234e?style=flat-square&logo=nestjs)
![Python](https://img.shields.io/badge/python-%3E%3D3.8-3776ab?style=flat-square&logo=python)

[English](./README.en.md) | 简体中文

**Sylis** 是基于现代网络技术和语音识别技术构建的 **AI 驱动英语学习平台**。

[文档](https://yinmingdi.github.io/sylis/) | [快速开始](https://yinmingdi.github.io/sylis/guide/quick-start) | [讨论](https://github.com/your-org/sylis/discussions)

## 核心特性

- **个性化学习** - AI 驱动的智能推荐系统，动态调整学习内容和难度
- **智能语音评测** - 基于 WeNet 的发音评估与改进建议
- **AI 沉浸式对话** - 实时 AI 聊天练习，支持多场景角色扮演
- **动态内容生成** - 根据词汇薄弱点自动生成个性化阅读材料
- **现代化界面** - 基于 Antd Mobile 的精美移动端设计，支持主题切换
- **离线支持** - 渐进式 Web 应用，支持离线学习功能

## 快速开始

```bash
# 克隆项目
git clone https://github.com/your-org/sylis.git
cd sylis

# 安装依赖
pnpm install

# 配置环境变量（详见配置指南）
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 启动所有服务
pnpm start
```

访问 http://localhost:5173 查看应用运行效果。

## 技术栈

- **前端**: React 19, TypeScript, Antd Mobile, Zustand, Vite
- **后端**: NestJS 11, Prisma, PostgreSQL, Redis
- **AI 服务**: OpenAI API, WeNet (语音), Python FastAPI
- **基础设施**: Docker, pnpm Workspaces, VitePress

## 项目文档

查看完整文档，请访问 [yinmingdi.github.io/sylis](https://yinmingdi.github.io/sylis/)。

## 参与贡献

在提交 Pull Request 之前，请先阅读[贡献指南](https://yinmingdi.github.io/sylis/guide/contribution)。

## 开源协议

[ISC](https://opensource.org/licenses/ISC)

版权所有 (c) 2024-至今, Sylis 团队
