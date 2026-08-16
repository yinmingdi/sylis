import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail =
      exception instanceof HttpException
        ? exception.message
        : "An unexpected error occurred";
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const request = http.getRequest<Request>();
      this.logger.error(
        JSON.stringify({
          event: "http_request_failed",
          method: request.method,
          path: request.originalUrl.split("?", 1)[0],
          status,
          errorCode: safeErrorCode(exception),
        }),
      );
    }
    response
      .status(status)
      .type("application/problem+json")
      .json({
        type: `https://sylis.app/problems/${status}`,
        title: HttpStatus[status] ?? "Error",
        status,
        detail,
      });
  }
}

function safeErrorCode(exception: unknown): string {
  if (
    exception instanceof Error &&
    /^[A-Z][A-Z0-9_]*(?::[A-Z0-9_]+)*$/.test(exception.message)
  ) {
    return exception.message;
  }
  return exception instanceof HttpException
    ? `HTTP_${exception.getStatus()}`
    : "UNEXPECTED_INTERNAL_ERROR";
}
