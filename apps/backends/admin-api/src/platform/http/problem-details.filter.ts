import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail =
      exception instanceof HttpException
        ? exception.message
        : "An unexpected error occurred";
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
