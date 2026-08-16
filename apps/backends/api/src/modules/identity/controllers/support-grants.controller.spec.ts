import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { SupportGrantsController } from "./support-grants.controller";

describe("SupportGrantsController contracts", () => {
  it("declares grant revocation as a 204 response", () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        SupportGrantsController.prototype.revoke,
      ),
    ).toBe(204);
  });
});
