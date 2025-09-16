 
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable, tap } from 'rxjs';

import { LoggerService } from '../../modules/logger/logger.service';

function omitSensitive(obj: any, keys: string[] = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  keys.forEach((key) => {
    if (clone[key] !== undefined) clone[key] = '[Filtered]';
  });
  return clone;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();
    const { method, url, headers, body, query, params, ip, user } = request;

    // 脱敏 headers/body
    const safeHeaders = omitSensitive(headers, ['authorization', 'cookie']);
    const safeBody = omitSensitive(body, ['password', 'token']);

    // 记录请求日志
    this.logger.log('请求信息', {
      url,
      method,
      headers: safeHeaders,
      body: safeBody,
      query,
      params,
      ip,
      userId: user?.id,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap((data) => {
        const responseTime = Date.now() - now;
        // 记录响应日志
        this.logger.log('响应信息', {
          url,
          method,
          statusCode: context.switchToHttp().getResponse().statusCode,
          responseTime: `${responseTime}ms`,
          userId: user?.id,
          timestamp: new Date().toISOString(),
          // 只记录响应摘要
          response:
            typeof data === 'object' && data !== null ? { code: 0, message: 'success' } : data,
        });
      }),
      map((data) => ({
        code: 0,
        message: 'success',
        data,
      })),
    );
  }
}
