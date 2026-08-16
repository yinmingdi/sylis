import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { ApiConfig } from "../../../config/api.config";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "../services/identity.service";

describe("IdentityController session device context", () => {
  it("passes the browser user agent into a new login session", async () => {
    const identity = {
      login: vi.fn().mockResolvedValue({
        token: "session-token",
        csrfToken: "csrf-token",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      }),
    };
    const controller = new IdentityController(
      identity as unknown as IdentityService,
      { cookieSecure: false } as ApiConfig,
    );
    const input = { email: "learner@example.com", password: "password" };
    const request = {
      get: vi.fn().mockReturnValue("Sylis test browser"),
    } as unknown as Request;
    const response = { cookie: vi.fn() } as unknown as Response;

    await controller.login(input, request, response);

    expect(identity.login).toHaveBeenCalledWith(input, "Sylis test browser");
  });
});
