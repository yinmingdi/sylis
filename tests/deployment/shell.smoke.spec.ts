import { expect, test, type Request, type Response } from "@playwright/test";

import { DeploymentProjectKind, TestTag, deploymentTags } from "./runtime";

enum CriticalResourceKind {
  DOCUMENT = "document",
  SCRIPT = "script",
  STYLESHEET = "stylesheet",
}

const CRITICAL_RESOURCE_KINDS = new Set<string>(
  Object.values(CriticalResourceKind),
);

test(
  "DELIVERY-002-SYNTHETIC the deployed browser shell and static assets load",
  {
    tag: deploymentTags(TestTag.DEPLOYMENT, TestTag.BROWSER),
  },
  async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on("requestfailed", (request) =>
      recordRequestFailure(request, failures),
    );
    page.on("response", (response) =>
      recordResponseFailure(response, failures),
    );

    await page.goto("/login", { waitUntil: "networkidle" });
    const heading =
      testInfo.project.name === DeploymentProjectKind.ADMIN_SHELL
        ? "Sylis Admin"
        : "Sylis";
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(failures).toEqual([]);

    const identityResponse = await page.request.get("/version.json");
    expect(identityResponse.ok()).toBeTruthy();
    const identity = (await identityResponse.json()) as Record<string, unknown>;
    const expectedService =
      testInfo.project.name === DeploymentProjectKind.ADMIN_SHELL
        ? "admin"
        : "web";
    expect(identity).toMatchObject({
      status: "ready",
      service: expectedService,
    });
    const expectedVersion = process.env.SYLIS_EXPECTED_VERSION?.trim();
    const expectedCommitSha = process.env.SYLIS_EXPECTED_COMMIT_SHA?.trim();
    if (expectedVersion) expect(identity.version).toBe(expectedVersion);
    if (expectedCommitSha) expect(identity.commitSha).toBe(expectedCommitSha);
  },
);

function recordRequestFailure(request: Request, failures: string[]): void {
  if (!CRITICAL_RESOURCE_KINDS.has(request.resourceType())) return;
  failures.push(
    `${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? "REQUEST_FAILED"}`,
  );
}

function recordResponseFailure(response: Response, failures: string[]): void {
  const request = response.request();
  if (!CRITICAL_RESOURCE_KINDS.has(request.resourceType())) return;
  if (response.status() >= 400) {
    failures.push(
      `${request.resourceType()} ${response.url()} ${response.status()}`,
    );
  }
}
