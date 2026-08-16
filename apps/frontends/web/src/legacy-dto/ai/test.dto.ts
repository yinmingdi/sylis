// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface TestConnectionReqDto {
  testMessage?: string;
}

export interface TestConnectionResDto {
  success: boolean;
  status: string;
  responseTime: number;
  error?: string;
  testResponse?: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
}
