import { createPrismaClient } from "@sylis/database";

import { preflightArtifact } from "./artifact/preflight";
import { createImportPlan } from "./plan/import-plan";

enum PublisherCommand {
  ARTIFACT_VALIDATE = "artifact:validate",
  RELEASE_PLAN = "release:plan",
}

interface CliArguments {
  command: PublisherCommand;
  artifactPath: string;
  artifactHash: string;
}

async function main(): Promise<void> {
  const input = parseArguments(process.argv.slice(2));
  process.stderr.write("artifact stage=preflight status=running\n");
  const preflight = await preflightArtifact(
    input.artifactPath,
    input.artifactHash,
  );
  process.stderr.write(
    `artifact stage=preflight status=succeeded entities=${Object.values(preflight.counts).reduce((sum, count) => sum + count, 0)}\n`,
  );
  if (input.command === PublisherCommand.ARTIFACT_VALIDATE) {
    process.stdout.write(`${JSON.stringify(preflight, null, 2)}\n`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  const database = createPrismaClient({ url: databaseUrl, log: ["error"] });
  await database.$connect();
  try {
    const plan = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
      return createImportPlan(transaction, input.artifactPath, preflight);
    });
    if (
      !plan.database.schemaReady ||
      !plan.database.invariantsReady ||
      !plan.database.publisherPrivilegesReady
    ) {
      throw new Error("LEXICON_RELEASE_PLAN_DATABASE_INCOMPATIBLE");
    }
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } finally {
    await database.$disconnect();
  }
}

function parseArguments(arguments_: string[]): CliArguments {
  const command = arguments_[0];
  if (!Object.values(PublisherCommand).includes(command as PublisherCommand)) {
    throw new Error("PUBLISHER_COMMAND_INVALID");
  }
  const values = new Map<string, string>();
  for (let index = 1; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error("PUBLISHER_ARGUMENT_INVALID");
    }
    values.set(name.slice(2), value);
  }
  const artifactPath = values.get("artifact")?.trim();
  const artifactHash = values.get("sha256")?.trim();
  if (!artifactPath) throw new Error("PUBLISHER_ARTIFACT_REQUIRED");
  if (!artifactHash || !/^sha256:[a-f0-9]{64}$/.test(artifactHash)) {
    throw new Error("PUBLISHER_ARTIFACT_HASH_INVALID");
  }
  return {
    command: command as PublisherCommand,
    artifactPath,
    artifactHash,
  };
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
