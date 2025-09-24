import axios, { type AxiosRequestConfig } from 'axios';

import type { ApiResponse } from './types';
import { useUserStore } from '../../modules/user/store';

export const _request = axios.create({
  baseURL: '/api',
  timeout: 5000,
});

// 请求拦截器，自动加 token
_request.interceptors.request.use((config) => {
  const token = useUserStore.getState().token;
  if (token) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器，只做错误处理
_request.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
);

// 类型安全的请求封装
export const request = <TParams = any, TData = any>(
  config: AxiosRequestConfig & { data?: TParams },
) => {
  const { method = 'GET' } = config;
  if (method === 'get' || method === 'GET') {
    config.params = config.data;
  }
  return _request.request<ApiResponse<TData>>(config).then((res) => res.data);
};

export type { ApiResponse };
export default request;
