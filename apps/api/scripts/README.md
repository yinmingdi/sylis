# DTO 生成脚本 (重构版)

这是一个重构后的、模块化的 DTO 生成工具，用于自动生成共享 TypeScript 接口。

## 📁 新架构目录结构

```
scripts/
├── cli.ts                    # 主CLI入口
├── core/                     # 核心功能模块
│   ├── generator.ts         # 核心DTO生成器
│   ├── dependency-analyzer.ts # 依赖分析器 (简化版)
│   ├── file-manager.ts      # 文件管理器
│   └── watcher.ts           # 文件监听器
├── config/                   # 🆕 配置管理
│   ├── index.ts            # 配置管理类
│   └── patterns.ts         # 模式定义
├── utils/                    # 🆕 工具库
│   ├── index.ts            # 统一导出
│   ├── file-system.ts      # 文件系统工具
│   ├── logger.ts           # 日志工具
│   └── type-helper.ts      # 类型处理工具
└── types/                    # 🆕 类型定义
    └── index.ts            # 共享类型定义
```

## 🚀 使用方法

### CLI命令

```bash
# 生成所有 DTO (包含依赖分析)
pnpm dto:generate
# 或
npx tsx scripts/cli.ts generate

# 监听 DTO 变化
pnpm dto:watch
# 或
npx tsx scripts/cli.ts watch

# 清理生成的文件
pnpm dto:clean
# 或
npx tsx scripts/cli.ts clean

# 查看帮助
pnpm dto:help
# 或
npx tsx scripts/cli.ts help
```

### 高级选项

```bash
# 详细日志
pnpm dto:generate -- --verbose

# 跳过依赖分析 (更快)
pnpm dto:generate -- --no-deps

# 生成前清理旧文件
pnpm dto:generate -- --clean

# 只清理特定模块
pnpm dto:clean -- --module auth
```

## 📋 功能特性

### ✅ 核心功能

- **智能DTO生成**: 从 NestJS DTO 类自动生成 TypeScript 接口
- **依赖分析**: 自动识别和处理类型依赖 (简化版，更稳定)
- **文件管理**: 自动创建模块级和根级 index.ts 文件
- **实时监听**: 监听文件变化，自动重新生成

### ✅ 架构优势

- **模块化设计**: 核心功能分离，职责清晰
- **类型安全**: 完整的 TypeScript 类型支持
- **可扩展性**: 插件式架构，易于扩展
- **向后兼容**: 保持与旧版本的兼容性

### ✅ 开发体验

- **统一日志**: 美观的日志输出和进度显示
- **错误处理**: 友好的错误提示和恢复机制
- **配置灵活**: 支持多种配置选项
- **性能优化**: 增量生成，避免不必要的重复工作

## 🔧 配置

### 新配置类 (推荐)

```typescript
// config/index.ts
export class ScriptConfig {
  public readonly backendDtoDir: string; // 后端 DTO 目录
  public readonly sharedDtoDir: string; // 共享 DTO 输出目录
  public readonly tsConfigPath: string; // TypeScript 配置

  // 自动计算路径，无需手动配置
  constructor() {
    this.scriptsDir = __dirname;
    this.backendDtoDir = join(this.scriptsDir, '../src/modules');
    this.sharedDtoDir = join(
      this.scriptsDir,
      '../../../../packages/shared/dto',
    );
    this.tsConfigPath = join(this.scriptsDir, '../tsconfig.json');
  }

  // 提供便捷方法
  getModuleOutputDir(moduleName: string): string;
  getTypeOutputDir(moduleName: string): string;
  validate(): boolean;
}
```

### 模式配置

```typescript
// config/patterns.ts
export const patterns = {
  modulePath: /modules\/(.*?)\/dto\/(.*?\.dto\.ts)$/,
  exportType: /export type \{ ([^}]+) \} from/g,
  // ... 更多匹配模式
};
```

## 📝 开发指南

### 扩展新功能

```typescript
// 1. 创建新的核心模块
// core/my-feature.ts
export class MyFeature {
  constructor(private config: ScriptConfig) {}

  async process(): Promise<void> {
    // 实现功能
  }
}

// 2. 在生成器中集成
// core/generator.ts
import { MyFeature } from './my-feature';

// 3. 添加CLI选项
// cli.ts
case '--my-option':
  options.myOption = true;
  break;
```

### 测试脚本

```bash
# 测试生成功能
npx tsx scripts/cli.ts generate --verbose

# 测试监听功能
npx tsx scripts/cli.ts watch --verbose

# 测试清理功能
npx tsx scripts/cli.ts clean --verbose
```

## 🎯 重构详解

### 🔴 重构前的问题

- **单文件复杂**: 600+ 行的依赖解析器，难以维护
- **功能耦合**: 增强版和基础版DTO生成器代码重复
- **错误处理**: 各模块错误处理方式不统一
- **配置分散**: 配置文件独立，缺乏验证机制
- **类型缺失**: 缺乏完整的类型定义

### 🟢 重构后的优势

- **✅ 清晰架构**: core/utils/config/types 职责分明
- **✅ 简化依赖**: 依赖解析器从600行简化到300行
- **✅ 统一日志**: 美观的日志系统和进度显示
- **✅ 类型安全**: 完整的TypeScript类型支持
- **✅ 错误恢复**: 友好的错误处理和恢复机制
- **✅ 向后兼容**: 保持旧API的兼容性
- **✅ 可测试性**: 模块化设计便于单元测试

### 🔄 脚本使用

```bash
# package.json 脚本 (推荐)
pnpm dto:generate  # 生成DTO
pnpm dto:watch     # 监听模式
pnpm dto:clean     # 清理文件
pnpm dto:help      # 查看帮助

# 直接调用
npx tsx scripts/cli.ts generate --verbose
```

## 🚀 性能优化

- **增量生成**: 只处理变更的文件
- **智能缓存**: 避免重复分析相同依赖
- **并行处理**: 支持多文件并行生成 (Future)
- **内存优化**: 及时清理ts-morph项目实例
