import { HttpException, Logger, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ProblemDetailsFilter } from "../src/platform/http/problem-details.filter";

describe("ProblemDetailsFilter", () => {
  it("returns RFC 9457 JSON for an HTTP exception", () => {
    const response = {
      status: vi.fn(),
      type: vi.fn(),
      json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new ProblemDetailsFilter().catch(new HttpException("Forbidden", 403), host);

    expect(response.type).toHaveBeenCalledWith("application/problem+json");
    expect(response.json).toHaveBeenCalledWith({
      type: "https://sylis.app/problems/403",
      title: "FORBIDDEN",
      status: 403,
      detail: "Forbidden",
    });
  });

  it("logs a safe structured error for an unexpected exception", () => {
    const response = {
      status: vi.fn(),
      type: vi.fn(),
      json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
    const request = {
      method: "POST",
      originalUrl: "/internal/v1/agent-streams?ignored=true",
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {
      // The assertion below owns the log payload.
    });

    new ProblemDetailsFilter().catch(
      new Error("AGENT_PROVIDER_ARTIFACT_DOCUMENT_SEMANTICS_INVALID"),
      host,
    );

    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "http_request_failed",
        method: "POST",
        path: "/internal/v1/agent-streams",
        status: 500,
        errorCode: "AGENT_PROVIDER_ARTIFACT_DOCUMENT_SEMANTICS_INVALID",
      }),
    );
    expect(response.json).toHaveBeenCalledWith({
      type: "https://sylis.app/problems/500",
      title: "INTERNAL_SERVER_ERROR",
      status: 500,
      detail: "An unexpected error occurred",
    });
  });
});
