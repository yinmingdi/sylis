# DTO 生成脚本

这个目录包含了用于自动生成共享 DTO 的脚本工具。

## 📁 目录结构

```
scripts/
├── README.md              # 本文档
├── index.ts               # 统一入口脚本
├── config/
│   └── index.ts           # 配置文件
├── utils/
│   ├── index.ts           # 工具函数统一导出
│   ├── file-utils.ts      # 文件操作工具
│   ├── dto-generator.ts   # DTO 生成器
│   └── dto-cleaner.ts     # DTO 清理器
└── watcher.ts             # 文件监听器
```

## 🚀 使用方法

### 生成所有 DTO

```bash
# 使用统一入口
npx tsx scripts/index.ts generate

# 或者添加到 package.json 中
npm run dto:generate
```

### 监听 DTO 变化

```bash
# 使用统一入口
npx tsx scripts/index.ts watch

# 或者添加到 package.json 中
npm run dto:watch
```

### 查看帮助

```bash
npx tsx scripts/index.ts
```

## 📋 功能特性

### ✅ 自动生成

- 从 NestJS DTO 类自动生成 TypeScript 接口
- 保持原始文件名格式
- 自动创建模块级和根级 index.ts 文件

### ✅ 文件监听

- 实时监听 DTO 文件变化
- 自动重新生成相关文件
- 优雅退出处理

### ✅ 模块化设计

- 清晰的职责分离
- 易于测试和维护
- 可扩展的架构

## 🔧 配置

配置文件位于 `config/index.ts`：

```typescript
export const config = {
  backendDtoDir: join(__dirname, "../../src/modules"), // 后端 DTO 目录
  sharedDtoDir: join(__dirname, "../../../../packages/shared/dto"), // 共享 DTO 输出目录
  tsConfigPath: join(__dirname, "../../tsconfig.json"), // TypeScript 配置文件路径
};
```

## 📝 开发指南

### 添加新的工具函数

1. 在 `utils/` 目录下创建新文件
2. 在 `utils/index.ts` 中导出
3. 在需要的地方导入使用

### 修改配置

1. 编辑 `config/index.ts`
2. 重启相关脚本

### 测试脚本

```bash
# 测试生成功能
npx tsx scripts/index.ts generate

# 测试监听功能（需要手动中断）
npx tsx scripts/index.ts watch
```

## 🎯 重构改进

### 重构前的问题

- 所有代码都在一个文件中，难以维护
- 函数职责不清晰
- 缺乏错误处理
- 配置硬编码

### 重构后的优势

- ✅ 模块化设计，职责清晰
- ✅ 统一的错误处理
- ✅ 可配置的路径
- ✅ 更好的类型安全
- ✅ 易于测试和扩展
- ✅ 清晰的文档和使用说明
