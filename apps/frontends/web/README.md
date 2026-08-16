# Sylis Web - 英语学习前端应用

基于 React + TypeScript + Antd Mobile 构建的现代化英语学习移动端应用。

## 🚀 技术栈

- **框架**: React 19 + TypeScript
- **UI 组件**: Antd Mobile 5.x
- **状态管理**: Zustand
- **路由管理**: React Router DOM 7.x
- **样式方案**: Less + CSS Modules
- **图标库**: React Icons
- **构建工具**: Vite
- **代码规范**: ESLint + Prettier

## 📱 主要功能

### 🎯 核心学习模块

- **单词学习** - 系统化词汇学习，支持多种记忆模式
- **单词练习** - 智能复习算法，巩固学习效果
- **阅读训练** - 提升英语阅读理解能力

### 🤖 AI智能学习

- **故事背单词** - 在生动故事中自然记忆单词
- **短文填词** - 在语境中提升理解能力
- **语法解析** - 智能分析英语句子语法结构
- **AI对话** - 与AI自然对话练习口语

### 📚 学习管理

- **词汇本管理** - 个性化词汇收藏与分类
- **学习进度** - 详细的学习数据统计
- **书籍管理** - 丰富的英语学习资源

## 🛠️ 开发环境

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 代码检查
pnpm lint
```

### 开发说明

项目采用 **Monorepo** 架构，该 web 应用是其中的前端模块。

**代码规范**:

- 组件优先使用 Antd Mobile 组件
- 使用 `await` 而非 `.then` 处理异步请求
- 样式使用 Less Module 语法
- 复杂组件按功能拆分 render 函数
- 文件夹命名使用 `kebab-case` 格式

**设计系统**:

- 参考 `src/styles/design-tokens.less` 设计规范
- 支持明暗主题切换
- 响应式设计，适配移动端

## 📂 项目结构

```
src/
├── components/          # 通用组件
├── hooks/              # 自定义 Hooks
├── layout/             # 布局组件
├── modules/            # 业务模块
├── network/            # 网络请求
├── pages/              # 页面组件
├── router/             # 路由配置
├── styles/             # 全局样式
└── sync-engine/        # 数据同步引擎
```

## 🎨 设计特色

- **现代简约** - 参考 Busuu App 的设计理念
- **用户友好** - 直观的交互体验
- **移动优先** - 专为移动端优化
- **主题适配** - 支持明暗主题
- **无障碍** - 遵循可访问性标准

## 📄 许可证

MIT License
