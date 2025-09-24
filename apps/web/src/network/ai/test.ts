import request from '../request';

// 测试连接的请求和响应类型
export interface TestConnectionRequest {
  testMessage?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  status: string;
  responseTime: number;
  error?: string;
  testResponse?: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
}

// 测试AI连接
export const testAIConnection = (params: TestConnectionRequest = {}) => {
  return request<TestConnectionRequest, TestConnectionResponse>({
    method: 'POST',
    url: '/ai/test-connection',
    data: params,
    timeout: 100000,
  });
};

// 快速测试连接（使用默认参数）
export const quickTestConnection = () => {
  return testAIConnection({
    testMessage: '测试OpenAI连接是否正常',
  });
};
