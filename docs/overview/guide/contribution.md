# 贡献指南

欢迎参与 Sylis 英语学习平台的开发！我们非常感谢社区的每一份贡献。

## 贡献方式

### 贡献类型

- 🐛 **Bug修复** - 修复现有问题
- ✨ **新功能** - 添加新特性
- 📚 **文档** - 改进文档
- 🎨 **UI/UX** - 界面和用户体验优化
- ⚡ **性能** - 性能优化
- 🧪 **测试** - 添加或改进测试
- 🔧 **工具** - 开发工具改进
- 🌐 **国际化** - 多语言支持

### 参与方式

1. **报告问题** - 发现 bug 或提出建议
2. **讨论功能** - 参与功能设计讨论
3. **提交代码** - 修复问题或实现新功能
4. **改进文档** - 完善项目文档
5. **测试体验** - 测试新功能并提供反馈

## 快速开始

### 1. Fork 项目

```bash
# 1. 在 GitHub 上 Fork 项目
# 2. 克隆你的 Fork
git clone https://github.com/your-username/sylis.git
cd sylis

# 3. 添加上游仓库
git remote add upstream https://github.com/original-org/sylis.git
```

### 2. 设置开发环境

```bash
# 安装依赖
pnpm install

# 启动开发环境
pnpm dev

# 运行测试确保环境正常
pnpm test
```

### 3. 创建功能分支

```bash
# 从 develop 分支创建新分支
git checkout develop
git pull upstream develop
git checkout -b feature/your-feature-name
```

## 开发规范

### 代码规范

#### TypeScript 规范

```typescript
// ✅ 好的示例
interface UserProfile {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
}

const createUser = async (userData: CreateUserDto): Promise<User> => {
  // 实现逻辑
};

// ❌ 避免的写法
const user: any = {}; // 避免使用 any
function createuser(data) {} // 缺少类型定义
```

#### React 组件规范

```tsx
// ✅ 推荐的组件结构
import React from "react";
import { Button } from "antd-mobile";
import styles from "./UserCard.module.less";

interface UserCardProps {
  user: User;
  onEdit: (id: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  return (
    <div className={styles.container}>
      <h3>{user.username}</h3>
      <Button onClick={() => onEdit(user.id)}>编辑</Button>
    </div>
  );
};
```

#### 样式规范

```less
// 使用 Less Modules
.container {
  padding: 16px;
  background: var(--background-color);

  .title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .button {
    width: 100%;
    margin-top: 12px;
  }
}

// 使用设计系统的 tokens
.card {
  background: var(--surface-color);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-small);
}
```

### 命名规范

#### 文件命名

```
components/
├── user-profile/           # kebab-case 文件夹
│   ├── UserProfile.tsx     # PascalCase 组件
│   ├── UserProfile.module.less
│   ├── UserProfile.test.tsx
│   └── index.ts
│
pages/
├── vocabulary-learning/    # kebab-case 页面文件夹
│   ├── VocabularyLearning.tsx
│   └── VocabularyLearning.module.less
│
utils/
├── api-client.ts          # kebab-case 工具文件
├── date-formatter.ts
└── validation-rules.ts
```

#### 变量命名

```typescript
// 常量 - UPPER_SNAKE_CASE
const API_BASE_URL = "https://api.sylis.app";
const MAX_RETRY_COUNT = 3;

// 变量和函数 - camelCase
const userName = "john_doe";
const isLoading = false;
const fetchUserData = async () => {};

// 组件 - PascalCase
const UserProfile = () => {};
const VocabularyCard = () => {};

// 接口和类型 - PascalCase
interface UserProfile {}
type ApiResponse<T> = {};
```

### Git 提交规范

#### 提交信息格式

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

#### 提交类型

```bash
feat: 新功能
fix: Bug 修复
docs: 文档更新
style: 代码格式调整（不影响功能）
refactor: 重构代码
perf: 性能优化
test: 测试相关
build: 构建系统或依赖变更
ci: CI 配置文件和脚本变更
chore: 其他不修改 src 或 test 文件的变更
revert: 回滚之前的提交
```

#### 提交示例

```bash
# 新功能
feat(auth): add user registration with email verification

# Bug 修复
fix(vocabulary): resolve pronunciation scoring calculation

# 文档更新
docs(api): update authentication endpoints documentation

# 重构
refactor(components): extract common button component

# 测试
test(learning): add unit tests for vocabulary practice

# 性能优化
perf(speech): optimize audio processing pipeline
```

## 工作流程

### 开发流程

```bash
# 1. 同步最新代码
git checkout develop
git pull upstream develop

# 2. 创建功能分支
git checkout -b feature/new-feature

# 3. 开发和测试
# ... 编写代码 ...
pnpm lint        # 代码检查
pnpm test        # 运行测试
pnpm typecheck   # 类型检查

# 4. 提交更改
git add .
git commit -m "feat: add new feature"

# 5. 推送分支
git push origin feature/new-feature

# 6. 创建 Pull Request
```

### Pull Request 规范

#### PR 标题格式

```
<type>: <简短描述>

例如：
feat: add vocabulary spaced repetition algorithm
fix: resolve audio recording issues on iOS
docs: update installation guide for Windows
```

#### PR 描述模板

```markdown
## 📝 变更描述

简要描述这个 PR 的变更内容

## 🎯 相关 Issue

Closes #123
Related to #456

## 测试

- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试完成
- [ ] 浏览器兼容性测试

## 📋 检查清单

- [ ] 代码遵循项目规范
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] PR 标题遵循约定式提交规范
- [ ] 没有引入破坏性变更

## 截图/演示

如果有 UI 变更，请添加截图或演示视频

## 备注

其他需要说明的内容
```

### 代码审查

#### 审查要点

1. **功能正确性** - 代码是否实现了预期功能
2. **代码质量** - 是否遵循项目规范和最佳实践
3. **性能考虑** - 是否有性能问题或优化空间
4. **安全性** - 是否存在安全隐患
5. **测试覆盖** - 是否有充分的测试覆盖
6. **文档完整** - 是否需要更新文档

#### 审查反馈

```markdown
# 积极反馈示例

这个实现很优雅，性能优化做得很好！

# 建设性建议

考虑使用 useMemo 来优化这个计算密集的操作

# 具体建议

建议将这个函数提取到 utils 目录，提高复用性

# 询问澄清

这里的异常处理逻辑是否考虑了网络超时的情况？
```

## 测试指南

### 测试策略

```typescript
// 单元测试示例
describe('VocabularyService', () => {
  it('should calculate correct difficulty score', () => {
    const vocabulary = { attempts: 5, correct: 3 };
    const score = calculateDifficulty(vocabulary);
    expect(score).toBe(0.6);
  });
});

// 组件测试示例
describe('VocabularyCard', () => {
  it('should display vocabulary word and definition', () => {
    render(<VocabularyCard word="hello" definition="问候" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('问候')).toBeInTheDocument();
  });
});

// 集成测试示例
describe('Learning API', () => {
  it('should return personalized vocabulary list', async () => {
    const response = await request(app)
      .get('/api/learning/vocabulary')
      .expect(200);

    expect(response.body).toHaveProperty('words');
    expect(response.body.words).toHaveLength(10);
  });
});
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test VocabularyCard.test.tsx

# 运行测试并查看覆盖率
pnpm test:coverage

# 监听模式运行测试
pnpm test:watch
```

## 文档规范

### API 文档

````typescript
/**
 * 获取用户的个性化词汇列表
 * @param userId 用户ID
 * @param level 难度级别 (1-5)
 * @param limit 返回数量限制
 * @returns 个性化词汇列表
 * @example
 * ```typescript
 * const vocabularies = await getPersonalizedVocabulary('user123', 3, 20);
 * ```
 */
export async function getPersonalizedVocabulary(
  userId: string,
  level: number,
  limit: number = 10,
): Promise<Vocabulary[]> {
  // 实现逻辑
}
````

### 组件文档

````tsx
/**
 * 词汇学习卡片组件
 *
 * @example
 * ```tsx
 * <VocabularyCard
 *   vocabulary={{ word: 'hello', definition: '问候' }}
 *   onAnswer={(correct) => console.log(correct)}
 *   showHint={true}
 * />
 * ```
 */
interface VocabularyCardProps {
  /** 词汇数据 */
  vocabulary: Vocabulary;
  /** 答案回调函数 */
  onAnswer: (correct: boolean) => void;
  /** 是否显示提示 */
  showHint?: boolean;
}
````

## 问题报告

### Bug 报告模板

```markdown
## Bug 描述

清晰简洁地描述遇到的问题

## 🔄 重现步骤

1. 进入词汇练习页面
2. 选择"听力练习"模式
3. 点击录音按钮
4. 看到错误信息

## 期望行为

描述你期望发生的情况

## 环境信息

- 设备: iPhone 13 Pro
- 浏览器: Safari 16.0
- 操作系统: iOS 16.0
- 应用版本: v1.2.0

## 截图

如果适用，添加截图帮助解释问题

## 附加信息

其他可能有用的信息
```

### 功能请求模板

```markdown
## 功能描述

清晰简洁地描述你希望添加的功能

## 动机

解释为什么需要这个功能，它解决了什么问题

## 详细设计

详细描述功能的实现方式和用户体验

## 替代方案

考虑过的其他解决方案

## 附加信息

其他相关信息或参考资料
```

## 贡献者指南

### 成为贡献者

1. **提交第一个 PR** - 修复文档错误、代码格式问题等
2. **参与讨论** - 在 Issues 和 Discussions 中积极参与
3. **持续贡献** - 定期提交有价值的贡献
4. **帮助他人** - 协助其他贡献者解决问题

### 贡献者权益

- 在 README 中展示贡献者头像
- 获得项目贡献者标识
- 参与项目重要决策讨论
- 优先获得新功能体验机会

### 维护者职责

- 及时回复 Issues 和 PR
- 进行代码审查并提供建设性反馈
- 维护项目质量和发展方向
- 协调社区活动和版本发布

## 致谢

感谢所有为 Sylis 项目做出贡献的开发者！

### 贡献统计

- 🔥 代码贡献者: [GitHub Contributors](https://github.com/your-org/sylis/graphs/contributors)
- 🐛 Bug 猎手: 报告关键问题的用户
- 📚 文档贡献者: 完善项目文档的用户
- 💡 功能建议者: 提出有价值建议的用户

### 联系方式

- 📧 邮箱: contribute@sylis.app
- 💬 讨论: [GitHub Discussions](https://github.com/your-org/sylis/discussions)
- 🐛 问题: [GitHub Issues](https://github.com/your-org/sylis/issues)

---

再次感谢您对 Sylis 项目的贡献！每一个贡献都让这个项目变得更好。
