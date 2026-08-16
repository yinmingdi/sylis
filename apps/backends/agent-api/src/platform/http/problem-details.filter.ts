import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import type { AgentProblemDetails } from "@sylis/agent-contracts";
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
        ? problemDetail(exception)
        : "An unexpected error occurred";
    const problem: AgentProblemDetails = {
      type: `https://sylis.app/problems/${status}`,
      title: HttpStatus[status] ?? "Error",
      status,
      code: problemCode(exception, status),
      detail,
    };
    response.status(status).type("application/problem+json").json(problem);
  }
}

function problemCode(exception: unknown, status: number): string {
  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    const candidate =
      typeof body === "object" && body !== null && "code" in body
        ? (body as { code?: unknown }).code
        : exception.message;
    if (
      typeof candidate === "string" &&
      /^[A-Z][A-Z0-9_:.-]{2,159}$/.test(candidate)
    ) {
      return candidate;
    }
  }
  return `HTTP_${status}`;
}

function problemDetail(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return exception.message;
}
