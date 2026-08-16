import { HttpException, type ArgumentsHost } from "@nestjs/common";
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
});
