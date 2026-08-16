import { spawn } from "node:child_process";

import { createPrismaClient } from "../client/prisma-client";
import { DatabaseSchemaVersion } from "../database-schema";
import { seedDeploymentSyntheticData } from "./seed-deployment-synthetic";
import { seedReferenceData } from "./seed-reference-data";

export enum DatabaseInstallationStep {
  PUSH_SCHEMA = "PUSH_SCHEMA",
  APPLY_INVARIANTS = "APPLY_INVARIANTS",
  SEED_REFERENCE_DATA = "SEED_REFERENCE_DATA",
}

const INSTALLATION_STEPS = [
  DatabaseInstallationStep.PUSH_SCHEMA,
  DatabaseInstallationStep.APPLY_INVARIANTS,
  DatabaseInstallationStep.SEED_REFERENCE_DATA,
] as const;

export function databaseInstallationArguments(
  step: DatabaseInstallationStep,
): string[] {
  switch (step) {
    case DatabaseInstallationStep.PUSH_SCHEMA:
      return [
        "db",
        "push",
        "--force-reset",
        "--skip-generate",
        "--schema",
        "./prisma/schema",
      ];
    case DatabaseInstallationStep.APPLY_INVARIANTS:
      return [
        "db",
        "execute",
        "--file",
        "./prisma/invariants.sql",
        "--schema",
        "./prisma/schema",
      ];
    case DatabaseInstallationStep.SEED_REFERENCE_DATA:
      return [];
  }
  throw new Error(`DATABASE_INSTALL_STEP_UNSUPPORTED:${step}`);
}

async function runPrisma(arguments_: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("./node_modules/.bin/prisma", arguments_, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`DATABASE_INSTALL_SIGNAL:${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`DATABASE_INSTALL_EXIT:${code ?? "UNKNOWN"}`));
        return;
      }
      resolve();
    });
  });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL_REQUIRED");
  }

  for (const step of INSTALLATION_STEPS) {
    process.stdout.write(
      `database install version=${DatabaseSchemaVersion.V0_0_1} step=${step}\n`,
    );
    if (step === DatabaseInstallationStep.SEED_REFERENCE_DATA) {
      const database = createPrismaClient({
        url: process.env.DATABASE_URL,
        log: ["error"],
      });
      try {
        await seedReferenceData(database);
        const synthetic = await seedDeploymentSyntheticData(database);
        if (synthetic) {
          process.stdout.write(
            `database install version=${DatabaseSchemaVersion.V0_0_1} syntheticData=seeded lexiconReleaseId=${synthetic.lexiconReleaseId}\n`,
          );
        }
      } finally {
        await database.$disconnect();
      }
    } else {
      await runPrisma(databaseInstallationArguments(step));
    }
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
