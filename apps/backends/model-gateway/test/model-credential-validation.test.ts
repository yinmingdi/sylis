import { describe, expect, it } from "vitest";

import {
  ModelCredentialValidationKind,
  modelCredentialValidationRequest,
} from "../src/modules/credentials/model-credential-validation";

describe("model credential validation requests", () => {
  it.each(Object.values(ModelCredentialValidationKind))(
    "allocates enough output budget for %s strict tool calls",
    (kind) => {
      const request = modelCredentialValidationRequest(kind, "candidate-id");

      expect(request.candidateKey).toBe("candidate-id");
      expect(request.schema).toEqual({
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { type: "boolean", const: true } },
      });
      expect(request.input).toEqual({ ok: true });
      expect(request.maxTokens).toBe(128);
    },
  );
});
