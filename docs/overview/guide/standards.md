# Sylis 开发规范

## 目录

- [项目架构](#项目架构)
- [前端开发规范](#前端开发规范)
- [后端开发规范](#后端开发规范)
- [项目级规范](#项目级规范)
- [代码质量](#代码质量)
- [Git 工作流](#git-工作流)

## 项目架构

### Monorepo 结构

```
sylis/
├── 📱 apps/                    # 应用层
│   ├── web/                   # React 前端应用
│   └── api/                   # NestJS 后端 API
├── 📦 packages/               # 共享包
│   ├── shared/                # 共享类型与 DTO
│   └── utils/                 # 通用工具函数
├── 🎙️ services/              # 微服务
│   └── speech-service/        # WeNet 语音识别服务
├── 📖 docs/                   # 项目文档
└── 🛠️ scripts/               # 自动化脚本
```

### 技术栈

- **前端**: React 19 + TypeScript + Antd Mobile + Zustand + React Router
- **后端**: NestJS + Prisma + PostgreSQL + Redis + TypeScript
- **语音服务**: Python 3 + WeNet
- **构建工具**: Vite + pnpm + ESLint + Prettier

## 前端开发规范

### 组件开发

#### 文件命名

- 组件文件夹：`kebab-case` 格式（如 `word-helper`）
- 组件文件：`PascalCase.tsx`
- 样式文件：`index.module.less`

```typescript
// ✅ 正确
components / word - helper / index.ts;
WordHelper.tsx;
index.module.less;

// ❌ 错误
components / wordHelper / wordHelper.tsx;
styles.less;
```

#### 组件结构

```typescript
// 1. 导入顺序
import { useEffect, useState } from "react";
import { Button } from "antd-mobile";

import { useWordHelper } from "./hooks/word-helper";
import styles from './index.module.less';

// 2. 类型定义
export interface ComponentProps {
  title: string;
  onClose?: () => void;
}

// 3. 组件实现
export const Component: React.FC<ComponentProps> = ({ title, onClose }) => {
  // 状态和逻辑
  const [isVisible, setIsVisible] = useState(false);

  // 渲染函数拆分
  const renderHeader = () => (
    <div className={styles.header}>
      <h2>{title}</h2>
    </div>
  );

  return (
    <div className={styles.container}>
      {renderHeader()}
      {/* 其他内容 */}
    </div>
  );
};
```

#### 样式规范

- 使用 Less Module 语法
- 遵循设计系统变量
- 避免内联样式

```less
// ✅ 正确
.container {
  padding: var(--spacing-4);
  background: var(--color-bg-primary);
  border-radius: var(--radius-base);

  .header {
    margin-bottom: var(--spacing-2);
  }
}

// ❌ 错误
.container {
  padding: 16px;
  background: #ffffff;
}
```

### API 请求规范

```typescript
// ✅ 使用 async/await
const fetchUserData = async (userId: string) => {
  try {
    const response = await userApi.getUser(userId);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw error;
  }
};

// ❌ 禁止只使用 .then
const fetchUserData = (userId: string) => {
  return userApi.getUser(userId).then((response) => response.data);
};
```

### 状态管理

使用 Zustand 进行状态管理：

```typescript
// store/user.ts
import { create } from "zustand";

interface UserState {
  user: User | null;
  setUser: (user: User) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));
```

## 后端开发规范

### 模块结构

```
modules/
  auth/
    ├── auth.controller.ts      # 控制器
    ├── auth.service.ts         # 服务层
    ├── auth.repository.ts      # 数据访问层
    ├── auth.module.ts          # 模块定义
    ├── dto/                    # DTO 定义
    │   ├── login.dto.ts
    │   └── register.dto.ts
    └── entities/               # 实体定义
        └── user.entity.ts
```

### DTO 命名规范

```typescript
// ✅ 正确
export class LoginReqDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class LoginResDto {
  @IsString()
  token: string;
}

// ❌ 错误
export class LoginRequest {
  email: string;
  password: string;
}
```

### 控制器规范

```typescript
@ApiTags("认证")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  @ApiOperation({ summary: "用户登录" })
  @ApiResponse({ status: 200, description: "登录成功" })
  @ApiResponse({ status: 401, description: "用户名或密码错误" })
  async login(@Body() dto: LoginReqDto) {
    return this.authService.login(dto);
  }
}
```

### 数据库规范

#### Prisma Schema 文件拆分

```prisma
// schema/users.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}
```

#### 迁移管理

```bash
# 开发环境
pnpm prisma:dev

# 生产环境
pnpm prisma:deploy
```

## 项目级规范

### 文件组织

#### 前端页面结构

```
pages/
  reading/
    ├── index.tsx              # 页面组件
    ├── index.module.less      # 页面样式
    ├── index.ts               # 导出文件
    └── hooks/                 # 页面专用 hooks
        └── use-reading.ts
```

#### 共享包结构

```
packages/
  shared/
    ├── dto/                   # 共享 DTO
    │   ├── auth/
    │   └── books/
    ├── types/                 # 共享类型
    └── configs/               # 共享配置
```

### 导入规范

```typescript
// 1. Node.js 内置模块
import { readFileSync } from "fs";

// 2. 第三方库
import { Controller, Post } from "@nestjs/common";
import { useState } from "react";

// 3. 内部模块（绝对路径）
import { AuthService } from "@/modules/auth/auth.service";

// 4. 相对路径
import { UserEntity } from "./entities/user.entity";
import styles from "./index.module.less";
```

### 环境变量

```bash
# .env.example
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/sylis"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-secret-key"

# 邮件服务
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-password"
```

## 代码质量

### TypeScript 规范

```typescript
// ✅ 使用明确的类型
interface User {
  id: string;
  email: string;
  createdAt: Date;
}

// ✅ 使用泛型
const fetchData = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  return response.json();
};

// ❌ 避免 any
const data: any = await fetchData("/api/users");
```

### 错误处理

```typescript
// ✅ 前端错误处理
const handleApiCall = async () => {
  try {
    const result = await api.getData();
    setData(result);
  } catch (error) {
    console.error("API call failed:", error);
    showErrorToast("获取数据失败");
  }
};

// ✅ 后端错误处理
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();

    response.status(status).json({
      statusCode: status,
      message: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 性能优化

#### 前端优化

```typescript
// ✅ 使用 React.memo
export const ExpensiveComponent = React.memo(({ data }) => {
  return <div>{data.name}</div>;
});

// ✅ 使用 useMemo
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// ✅ 使用 useCallback
const handleClick = useCallback((id: string) => {
  onItemClick(id);
}, [onItemClick]);
```

#### 后端优化

```typescript
// ✅ 使用 Prisma 查询优化
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    // 只选择需要的字段
  },
  where: {
    isActive: true,
  },
  take: 10, // 分页
});
```

## 🔄 Git 工作流

### 提交规范

使用 Conventional Commits：

```bash
# 功能
git commit -m "feat: 添加用户登录功能"

# 修复
git commit -m "fix: 修复登录验证逻辑"

# 文档
git commit -m "docs: 更新 API 文档"

# 样式
git commit -m "style: 调整按钮样式"

# 重构
git commit -m "refactor: 重构用户服务"

# 测试
git commit -m "test: 添加用户模块测试"

# 构建
git commit -m "build: 更新构建配置"
```

### 分支策略

```bash
# 主分支
main                    # 生产环境
develop                 # 开发环境

# 功能分支
feature/user-login      # 新功能
feature/payment-system

# 修复分支
hotfix/critical-bug     # 紧急修复
bugfix/login-error      # 普通修复

# 发布分支
release/v1.2.0          # 版本发布
```

### 代码审查

1. **自检清单**
   - [ ] 代码符合项目规范
   - [ ] 添加了必要的测试
   - [ ] 更新了相关文档
   - [ ] 通过了所有检查

2. **审查要点**
   - 代码逻辑正确性
   - 性能影响评估
   - 安全性考虑
   - 可维护性

## 开发流程

### 新功能开发

1. **创建分支**

   ```bash
   git checkout -b feature/new-feature
   ```

2. **开发实现**
   - 编写代码
   - 添加测试
   - 更新文档

3. **提交代码**

   ```bash
   git add .
   git commit -m "feat: 实现新功能"
   git push origin feature/new-feature
   ```

4. **创建 PR**
   - 填写 PR 描述
   - 添加审查者
   - 等待审查通过

### 发布流程

1. **版本准备**

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b release/v1.2.0
   ```

2. **版本发布**

   ```bash
   # 更新版本号
   npm version patch

   # 合并到主分支
   git checkout main
   git merge release/v1.2.0
   git tag v1.2.0
   git push origin main --tags
   ```

## 相关资源

- [React 官方文档](https://react.dev/)
- [NestJS 官方文档](https://nestjs.com/)
- [Prisma 官方文档](https://www.prisma.io/docs)
- [Antd Mobile 组件库](https://mobile.ant.design/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)

---

> **提示**: 本规范会根据项目发展持续更新，请定期查看最新版本。
