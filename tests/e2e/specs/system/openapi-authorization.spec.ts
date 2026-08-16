import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  E2eApiAudience,
  E2eApiAuthenticationMode,
  TestTag,
  e2eTags,
  e2ePorts,
} from "../../runtime";

interface CoveredOperation {
  audience: E2eApiAudience;
  method: string;
  path: string;
  operationId: string;
  authentication: E2eApiAuthenticationMode;
}

enum ExpectedOperationCount {
  PROTECTED = 186,
}

const inventory = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../contracts/openapi-operations.json"),
    "utf8",
  ),
) as { operations: CoveredOperation[] };

test(
  "API-CONTRACT-001-SYSTEM every protected OpenAPI operation rejects an unauthenticated caller",
  {
    tag: e2eTags(TestTag.SYSTEM, TestTag.SECURITY),
  },
  async ({ request }) => {
    test.setTimeout(120_000);
    const protectedOperations = inventory.operations.filter(
      (operation) =>
        operation.authentication !== E2eApiAuthenticationMode.PUBLIC,
    );

    for (const batch of batches(protectedOperations, 12)) {
      await Promise.all(
        batch.map((operation) => assertUnauthorized(request, operation)),
      );
    }
    expect(protectedOperations).toHaveLength(ExpectedOperationCount.PROTECTED);
  },
);

async function assertUnauthorized(
  request: APIRequestContext,
  operation: CoveredOperation,
): Promise<void> {
  const response = await request.fetch(operationUrl(operation), {
    method: operation.method,
    failOnStatusCode: false,
  });
  expect(
    [401, 403],
    `${operation.audience} ${operation.method} ${operation.path} (${operation.operationId}) returned ${response.status()}`,
  ).toContain(response.status());
}

function operationUrl(operation: CoveredOperation): string {
  const ports = e2ePorts();
  const port = {
    [E2eApiAudience.USER]: ports.api,
    [E2eApiAudience.ADMIN]: ports.adminApi,
    [E2eApiAudience.AGENT]: ports.agentApi,
  }[operation.audience];
  const path = operation.path.replaceAll(
    /\{[^}]+\}/g,
    "00000000-0000-4000-8000-000000000000",
  );
  return `http://127.0.0.1:${port}${path}`;
}

function batches<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
