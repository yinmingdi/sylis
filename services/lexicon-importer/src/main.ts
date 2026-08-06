import { createPrismaClient, type SylisDatabase } from "@sylis/database";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { activateRelease } from "./activate/activate-release";
import { preflightArtifact } from "./artifact/preflight";
import {
  importerConfigFromEnv,
  type ImporterConfig,
} from "./config/importer-config";
import { createImportPlan } from "./plan/import-plan";
import { ImporterOrchestrator } from "./runtime/importer-orchestrator";
import { ImporterJobRuntime } from "./runtime/job-runtime";

interface Arguments {
  command: string;
  option(name: string): string | undefined;
  requiredOption(name: string): string;
}

export function parseArguments(argv: string[]): Arguments {
  const command = argv[0] ?? "run";
  const option = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    command,
    option,
    requiredOption(name) {
      const value = option(name);
      if (!value) throw new Error(`Missing ${name}`);
      return value;
    },
  };
}

async function withDatabase<T>(
  databaseUrl: string,
  operation: (database: SylisDatabase) => Promise<T>,
): Promise<T> {
  const database = createPrismaClient({ url: databaseUrl, log: ["error"] });
  await database.$connect();
  try {
    return await operation(database);
  } finally {
    await database.$disconnect();
  }
}

function healthServer(isReady: () => boolean): Server {
  return createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/live") {
      response.writeHead(200);
      response.end(
        JSON.stringify({ status: "ok", service: "lexicon-importer" }),
      );
      return;
    }
    if (request.url === "/ready") {
      response.writeHead(isReady() ? 200 : 503);
      response.end(
        JSON.stringify({ status: isReady() ? "ready" : "unavailable" }),
      );
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ status: "not-found" }));
  });
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

async function runService(
  database: SylisDatabase,
  config: ImporterConfig,
): Promise<void> {
  let ready = false;
  let draining = false;
  const server = healthServer(() => ready && !draining);
  const beginDrain = () => {
    draining = true;
    ready = false;
  };
  process.once("SIGTERM", beginDrain);
  process.once("SIGINT", beginDrain);
  try {
    await listen(server, config.port);
    const runtime = new ImporterJobRuntime(
      database,
      config.instanceId,
      config.leaseDurationMs,
      config.checkpointKey,
    );
    const orchestrator = new ImporterOrchestrator(database, runtime, config);
    ready = true;
    while (!draining) {
      const claimed = await orchestrator.runOnce();
      if (!claimed) await delay(config.pollIntervalMs);
    }
  } finally {
    ready = false;
    process.off("SIGTERM", beginDrain);
    process.off("SIGINT", beginDrain);
    await close(server);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArguments(argv);
  if (args.command === "validate-artifact") {
    const result = await preflightArtifact(
      args.requiredOption("--input"),
      args.option("--hash"),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (args.command === "dry-run") {
    const input = args.requiredOption("--input");
    const result = await preflightArtifact(input, args.option("--hash"));
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for dry-run");
    await withDatabase(databaseUrl, async (database) => {
      const plan = await createImportPlan(database, input, result);
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    });
    return;
  }

  const config = importerConfigFromEnv();
  await withDatabase(config.databaseUrl, async (database) => {
    if (args.command === "activate" || args.command === "rollback") {
      await activateRelease(database, {
        lexiconId: args.requiredOption("--lexicon-id"),
        releaseId: args.requiredOption("--release-id"),
        approvalId: args.requiredOption("--approval-id"),
        actorUserId: args.requiredOption("--actor-user-id"),
        expectedCurrentReleaseId:
          args.option("--expected-current-release-id") ?? null,
        reason: args.requiredOption("--reason"),
        operation: args.command === "rollback" ? "ROLLBACK" : "ACTIVATE",
      });
      return;
    }
    if (args.command === "run") {
      await runService(database, config);
      return;
    }
    throw new Error(`Unknown command ${args.command}`);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "lexicon-importer.fatal",
        errorCode: error instanceof Error ? error.message : "UNKNOWN",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
