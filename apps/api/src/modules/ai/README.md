# AI模块网络连接测试

## 概述

AI模块现在包含了网络连接测试功能，方便开发者调试OpenAI的连接情况。

## 后端接口

### POST /api/ai/test-connection

测试OpenAI连接状态的接口。

**请求参数:**

```typescript
{
  testMessage?: string; // 可选，自定义测试消息
}
```

**响应数据:**

```typescript
{
  success: boolean;        // 是否连接成功
  status: string;          // 连接状态 ('connected' | 'failed')
  responseTime: number;    // 响应时间(毫秒)
  error?: string;          // 错误信息(如果失败)
  testResponse?: string;   // AI的响应内容(如果成功)
  model: string;           // 使用的模型名称
  baseUrl: string;         // API基础地址
  hasApiKey: boolean;      // 是否配置了API密钥
}
```

## 前端使用

### 导入测试函数

```typescript
import { quickTestConnection, testAIConnection } from '../../network/ai/test';
```

### 快速测试

```typescript
// 使用默认测试消息
const result = await quickTestConnection();
console.log('测试结果:', result);
```

### 自定义测试

```typescript
// 使用自定义测试消息
const result = await testAIConnection({
  testMessage: '你好，这是一个测试消息',
});
console.log('测试结果:', result);
```

## 测试页面

访问 `/ai-test` 页面可以通过图形界面进行测试：

1. **快速测试**: 使用默认消息测试连接
2. **自定义测试**: 发送自定义消息测试AI响应
3. **结果展示**: 显示详细的连接信息和响应结果

## 环境变量配置

确保在 `.env` 文件中配置了以下环境变量：

```bash
# 后端配置
AI_KEY=your_openai_api_key
AI_URL=https://api.openai.com/v1  # 或其他兼容的API地址
AI_MODEL=gpt-3.5-turbo             # 或其他模型

# 前端配置
VITE_APP_AI_KEY=your_openai_api_key
VITE_APP_AI_URL=https://api.openai.com/v1
VITE_APP_AI_MODEL=gpt-3.5-turbo
```

## 调试建议

1. **检查API密钥**: 确认 `hasApiKey` 为 `true`
2. **检查网络连接**: 查看 `responseTime` 和 `error` 信息
3. **验证API地址**: 确认 `baseUrl` 配置正确
4. **测试模型**: 确认 `model` 参数支持
5. **查看日志**: 后端会输出详细的连接日志

## 常见问题

### 连接超时

- 检查网络连接
- 确认API地址可访问
- 考虑增加请求超时时间

### 认证失败

- 验证API密钥是否正确
- 检查API密钥是否有效
- 确认账户余额充足

### 模型不支持

- 确认模型名称正确
- 检查账户是否有该模型的访问权限
- 尝试使用其他支持的模型

## 技术实现

- **后端**: NestJS + OpenAI SDK
- **前端**: React + antd-mobile + TypeScript
- **网络请求**: axios + 类型安全封装
- **错误处理**: 完整的错误捕获和用户友好提示
