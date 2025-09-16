export interface ApiResponse<T = any> {
  data: T;
  message: string;
  code: number;
}
