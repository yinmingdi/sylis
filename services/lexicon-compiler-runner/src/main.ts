import { createPrismaClient } from "@sylis/database";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { compilerRunnerConfigFromEnv } from "./config/runner-config";
import { LexiconBuildHandler } from "./handlers/lexicon-build-handler";
import { CompilerOrchestrator } from "./runtime/compiler-orchestrator";
import { CompilerJobRuntime } from "./runtime/job-runtime";

function healthServer(isReady: () => boolean): Server {
  return createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/live") {
      response.writeHead(200);
      response.end(
        JSON.stringify({ status: "ok", service: "lexicon-compiler-runner" }),
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

export async function main(): Promise<void> {
  const config = compilerRunnerConfigFromEnv();
  const database = createPrismaClient({
    url: config.databaseUrl,
    log: ["error"],
  });
  const runtime = new CompilerJobRuntime(
    database,
    config.instanceId,
    config.leaseDurationMs,
    config.checkpointKey,
  );
  const handler = new LexiconBuildHandler(database, runtime, config);
  const orchestrator = new CompilerOrchestrator(runtime, handler);
  let draining = false;
  let ready = false;
  const server = healthServer(() => ready && !draining);
  const beginDrain = () => {
    draining = true;
    ready = false;
  };
  process.once("SIGTERM", beginDrain);
  process.once("SIGINT", beginDrain);
  try {
    await database.$connect();
    await listen(server, config.port);
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
    await database.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "lexicon-compiler-runner.fatal",
        errorCode: error instanceof Error ? error.message : "UNKNOWN",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
