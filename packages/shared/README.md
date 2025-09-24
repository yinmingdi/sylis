# @sylis/shared

English learning app 的共享类型定义和配置包，为前后端提供统一的 TypeScript 接口。

## 📦 包含内容

- **DTO 类型定义** - 前后端 API 接口的请求/响应类型
- **共享配置** - ESLint、Prettier、TypeScript 配置
- **类型定义** - 业务相关的 TypeScript 类型

## 🚀 快速开始

### 安装

```bash
# 在 monorepo 根目录
pnpm install
```

### 使用

```typescript
// 导入 DTO 类型
import { LoginReqDto, LoginResDto } from "@sylis/shared/dto";
import { ParseGrammarReqDto } from "@sylis/shared/dto";

// 导入配置
import eslintConfig from "@sylis/shared/configs/eslint.config.js";
```

## 📁 目录结构

```
packages/shared/
├── dto/                    # API 接口类型定义
│   ├── ai/                # AI 相关接口
│   ├── auth/              # 认证相关接口
│   ├── books/             # 图书相关接口
│   ├── learning/          # 学习相关接口
│   └── quiz/              # 测验相关接口
├── configs/               # 共享配置文件
│   ├── eslint.config.js   # ESLint 配置
│   ├── prettier.config.js # Prettier 配置
│   └── tsconfig.config.json # TypeScript 配置
└── types/                 # 业务类型定义
```

## 🔧 主要模块

### DTO 类型

提供前后端 API 接口的类型安全：

- **Auth** - 登录、注册接口类型
- **AI** - 语法分析、考试生成等 AI 功能接口
- **Books** - 图书管理接口
- **Learning** - 学习进度、日计划接口
- **Quiz** - 测验、练习接口

### 配置文件

为整个项目提供统一的开发配置：

- ESLint 代码规范配置
- Prettier 代码格式化配置
- TypeScript 编译配置

## 📋 命名规范

- 请求 DTO: `XxxReqDto`
- 响应 DTO: `XxxResDto`
- 类型文件: `xxx.types.ts`

## 🔨 构建

```bash
# 构建类型定义
pnpm build

# 监听模式构建
WATCH=true pnpm build
```

## 📝 开发

当修改 DTO 类型后，会自动生成对应的类型文件并导出。确保：

1. 遵循命名规范
2. 添加必要的类型注释
3. 更新相关的 `index.ts` 导出文件

---

> 这是 [Sylis English Learning App](../../README.md) 的一部分
