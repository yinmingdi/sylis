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

const usage = `Usage: pnpm ops -- <command> [options]

Commands:
  health-rehearsal        --health-url <url> [--health-url <url>]
  application-rollback    --deployment-id <id> --confirm <id>
  lexicon-release         --action <validate|preview|request|approve|activate> [options]
  lexicon-rollback        Alias of lexicon-release for a previous VALIDATED release
  job-resume              --job-id <id> --reason <text> --confirm <id>
  admin-session-revoke    --user-id <id> --session-id <id> --reason <text> --confirm <id>
  source-withdraw         --post-id <id> --reason <text> --confirm <id>
  ai-kill-switch          --state <disabled|enabled> --reason <text> --confirm <state>
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

async function lexiconRollback(options) {
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
    return adminCommand(`/api/admin/v1/approvals/${approvalId}/decisions`, {
      method: "POST",
      body: { decision: "APPROVE", reason },
    });
  }
  const releaseId = option(options, "release-id", { required: true });
  if (action === "validate") {
    return adminCommand(
      `/api/admin/v1/lexicon-releases/${releaseId}/validation-jobs`,
      {
        method: "POST",
        idempotencyKey: option(options, "idempotency-key") || randomUUID(),
      },
    );
  }
  const preview = await adminCommand(
    `/api/admin/v1/lexicon-releases/${releaseId}/activation-previews`,
    { method: "POST" },
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
      `/api/admin/v1/lexicon-releases/${releaseId}/activation-requests`,
      {
        method: "POST",
        body: { reason },
      },
    );
  }
  confirm(options, releaseId);
  const approvalId = option(options, "approval-id", { required: true });
  return adminCommand(
    `/api/admin/v1/lexicon-releases/${releaseId}/activate?approvalId=${encodeURIComponent(approvalId)}`,
    { method: "POST", body: { reason } },
  );
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
      return lexiconRollback(options);
    case "job-resume": {
      const id = option(options, "job-id", { required: true });
      const reason = option(options, "reason", { required: true });
      confirm(options, id);
      return adminCommand(`/api/admin/v1/jobs/${id}/resume`, {
        method: "POST",
        body: { reason },
        idempotencyKey: randomUUID(),
      });
    }
    case "admin-session-revoke": {
      const userId = option(options, "user-id", { required: true });
      const sessionId = option(options, "session-id", { required: true });
      const reason = option(options, "reason", { required: true });
      confirm(options, sessionId);
      return adminCommand(
        `/api/admin/v1/users/${userId}/admin-sessions/${sessionId}/revoke`,
        { method: "POST", body: { reason } },
      );
    }
    case "source-withdraw": {
      const postId = option(options, "post-id", { required: true });
      const reason = option(options, "reason", { required: true });
      confirm(options, postId);
      return adminCommand(
        `/api/admin/v1/sources/reddit/${encodeURIComponent(postId)}/withdraw`,
        { method: "POST", body: { reason } },
      );
    }
    case "ai-kill-switch": {
      const state = choice(options, "state", ["disabled", "enabled"]);
      const reason = option(options, "reason", { required: true });
      confirm(options, state);
      return adminCommand("/api/admin/v1/runtime-ai-control", {
        method: "POST",
        body: { enabled: state === "enabled", reason },
      });
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
