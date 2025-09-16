# Sylis Web App

## 环境配置

在运行项目之前，需要配置AI服务的环境变量。请在`apps/web`目录下创建`.env`文件：

```bash
# AI服务配置 (必需)
VITE_APP_AI_KEY=your_openai_api_key_here
VITE_APP_AI_URL=https://api.openai.com/v1
VITE_APP_AI_MODEL=gpt-3.5-turbo
```

### 配置说明

- `VITE_APP_AI_KEY`: OpenAI API密钥（必填）
- `VITE_APP_AI_URL`: API接口地址（可选，默认OpenAI官方接口）
- `VITE_APP_AI_MODEL`: 使用的AI模型（可选，默认gpt-3.5-turbo）

### 其他兼容服务

本项目支持任何兼容OpenAI API格式的服务，例如：

```bash
# 使用DeepSeek
VITE_APP_AI_URL=https://api.deepseek.com/v1
VITE_APP_AI_MODEL=deepseek-chat

# 使用其他服务
VITE_APP_AI_URL=https://your-custom-api.com/v1
VITE_APP_AI_MODEL=your-model-name
```

## 功能特性

### AI Chat Agent 页面

- ✅ 完整的聊天界面，支持用户与AI助手对话
- ✅ 流式响应显示，实时展示AI回复过程
- ✅ 聊天历史记录管理，支持多会话切换
- ✅ 自动保存对话到本地存储
- ✅ 移动端适配，使用antd-mobile组件
- ✅ 错误处理和网络状态监控
- ✅ 语音输入支持
- ✅ 消息复制、重新生成等交互功能

### 核心组件

1. **Chat页面** (`/pages/agent/`)
   - 主聊天界面
   - 会话管理
   - 消息处理

2. **聊天历史Hook** (`/hooks/useChatHistory.ts`)
   - 会话存储和管理
   - 本地持久化
   - 会话切换逻辑

3. **AI网络服务** (`/network/ai/`)
   - OpenAI API集成
   - 流式响应处理
   - 错误处理

## 启动项目

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

访问 `http://localhost:5173/agent` 体验AI聊天功能。
