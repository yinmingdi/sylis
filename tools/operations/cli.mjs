#!/usr/bin/env node
import { randomUUID } from "node:crypto";

import { createAdminApi } from "./lib/admin-api.mjs";
import {
  choice,
  confirm,
  option,
  optionsList,
  parseArguments,
  UsageError,
} from "./lib/arguments.mjs";
import { createEvidenceManifest, writeEvidence } from "./lib/evidence.mjs";
import { rollbackDeployment } from "./lib/railway-api.mjs";
import {
  deploymentEndpoints,
  deploymentEndpointsFromOrigins,
  readDeploymentManifest,
  rehearseDeployment,
} from "./lib/deployment-rehearsal.mjs";

const usage = `Usage: pnpm ops -- <command> [options]

Commands:
  health-rehearsal        --manifest <path> --service-url <service>=<url> [--service-url ...]
  application-rollback    --deployment-id <id> --confirm <id>
  lexicon-release         --action <validate|preview|request|approve|activate> [options]
  lexicon-rollback        Alias of lexicon-release for a previous VALIDATED release
  job-retry               --job-id <id> --reason <text> --confirm <id>
  job-cancel              --job-id <id> --reason <text> --confirm <id>
  user-session-revoke     --user-id <id> --reason <text> --confirm <id>
  source-synchronize      --version-id <id> [--idempotency-key <key>]
  evidence-manifest
`;

const publicInputs = (options) =>
  Object.fromEntries(
    Object.entries(options).filter(
      ([name]) => !name.includes("token") && !name.includes("cookie"),
    ),
  );

const adminCommand = async (path, init) => createAdminApi()(path, init);

async function healthRehearsal(options) {
  const manifestPath =
    option(options, "manifest") || process.env.SYLIS_DEPLOYMENT_MANIFEST;
  if (manifestPath) {
    const manifest = await readDeploymentManifest(manifestPath);
    const configuredEndpoints = deploymentEndpoints(
      optionsList(options, "service-url"),
      process.env.SYLIS_DEPLOYMENT_ENDPOINTS,
    );
    return rehearseDeployment({
      manifest,
      endpoints:
        configuredEndpoints.size > 0
          ? configuredEndpoints
          : deploymentEndpointsFromOrigins(manifest, {
              apiOrigin: process.env.SYLIS_API_URL,
              webOrigin: process.env.SYLIS_WEB_URL,
              adminOrigin: process.env.SYLIS_ADMIN_URL,
            }),
    });
  }
  const urls = [
    ...optionsList(options, "health-url"),
    ...(process.env.SYLIS_HEALTH_URLS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];
  if (urls.length === 0) {
    throw new UsageError(
      "At least one --health-url or SYLIS_HEALTH_URLS value is required",
    );
  }
  return Promise.all(
    [...new Set(urls)].map(async (url) => {
      const startedAt = Date.now();
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.text()).slice(0, 2_000);
      if (!response.ok)
        throw new Error(`${url} returned HTTP ${response.status}`);
      return {
        url,
        status: response.status,
        durationMs: Date.now() - startedAt,
        body,
      };
    }),
  );
}

async function lexiconReleaseCommand(options) {
  const action = choice(options, "action", [
    "validate",
    "preview",
    "request",
    "approve",
    "activate",
  ]);
  if (action === "approve") {
    const approvalId = option(options, "approval-id", { required: true });
    const reason = option(options, "reason", { required: true });
    const actionDigest = option(options, "action-digest", { required: true });
    return adminCommand(
      `/api/admin/v1/lexicon/activation-requests/${approvalId}/decisions`,
      {
        method: "POST",
        body: { decision: "APPROVE", reason, actionDigest },
      },
    );
  }
  const releaseId = option(options, "release-id", { required: true });
  if (action === "validate") {
    return adminCommand(
      `/api/admin/v1/lexicon/releases/${releaseId}/validations`,
      {
        method: "POST",
        idempotencyKey: option(options, "idempotency-key") || randomUUID(),
      },
    );
  }
  const preview = await adminCommand(
    `/api/admin/v1/lexicon/releases/${releaseId}/activation-preview`,
    { method: "GET" },
  );
  const expectedContentHash = option(options, "expected-content-hash");
  if (expectedContentHash && preview?.contentHash !== expectedContentHash) {
    throw new Error(
      `Release content hash mismatch: expected ${expectedContentHash}, received ${preview?.contentHash}`,
    );
  }
  if (action === "preview") {
    return preview;
  }
  const reason = option(options, "reason", { required: true });
  if (action === "request") {
    return adminCommand(
      `/api/admin/v1/lexicon/releases/${releaseId}/activation-requests`,
      {
        method: "POST",
        body: { reason },
      },
    );
  }
  confirm(options, releaseId);
  const approvalId = option(options, "approval-id", { required: true });
  return adminCommand(`/api/admin/v1/lexicon/releases/${releaseId}/activate`, {
    method: "POST",
    body: { approvalId, reason },
  });
}

async function execute(command, options) {
  switch (command) {
    case "health-rehearsal":
      return healthRehearsal(options);
    case "application-rollback": {
      const id = option(options, "deployment-id", { required: true });
      confirm(options, id);
      return rollbackDeployment(id);
    }
    case "lexicon-release":
    case "lexicon-rollback":
      return lexiconReleaseCommand(options);
    case "job-retry":
    case "job-cancel": {
      const id = option(options, "job-id", { required: true });
      const reason = option(options, "reason", { required: true });
      confirm(options, id);
      const action = command === "job-retry" ? "retry" : "cancel";
      return adminCommand(`/api/admin/v1/jobs/${id}/${action}`, {
        method: "POST",
        body: { reason },
      });
    }
    case "user-session-revoke": {
      const userId = option(options, "user-id", { required: true });
      const reason = option(options, "reason", { required: true });
      confirm(options, userId);
      return adminCommand(
        `/api/admin/v1/user-support/users/${userId}/session-revocations`,
        { method: "POST", body: { reason } },
      );
    }
    case "source-synchronize": {
      const versionId = option(options, "version-id", { required: true });
      return adminCommand(
        `/api/admin/v1/source-datasets/versions/${versionId}/synchronizations`,
        {
          method: "POST",
          idempotencyKey: option(options, "idempotency-key") || randomUUID(),
        },
      );
    }
    case "evidence-manifest":
      return createEvidenceManifest();
    default:
      throw new UsageError(`Unknown command: ${command}`);
  }
}

const startedAt = new Date();
try {
  const { command, options } = parseArguments(process.argv.slice(2));
  const result = await execute(command, options);
  if (command === "evidence-manifest") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const finishedAt = new Date();
    const evidence = await writeEvidence(command, {
      status: "SUCCEEDED",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      inputs: publicInputs(options),
      result,
    });
    process.stdout.write(`${JSON.stringify({ result, evidence }, null, 2)}\n`);
  }
} catch (error) {
  const command = process.argv[2] || "unknown";
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;
  const evidence = await writeEvidence(command, {
    status: "FAILED",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    inputs: {},
    error: {
      name: error?.name || "Error",
      message: error?.message || String(error),
      details,
    },
  });
  process.stderr.write(
    `${error?.message || String(error)}\nEvidence: ${evidence.file}\n`,
  );
  if (error instanceof UsageError) process.stderr.write(`\n${usage}`);
  process.exitCode = 1;
}
