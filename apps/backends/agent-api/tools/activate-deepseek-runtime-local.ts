import { createPrismaClient, databaseConfigFromEnv } from "@sylis/database";

import { activateLocalDeepSeekRuntime } from "../src/modules/agent/local-deepseek-runtime";

async function main(): Promise<void> {
  const database = createPrismaClient(databaseConfigFromEnv());
  try {
    await database.$connect();
    const activation = await activateLocalDeepSeekRuntime(database);
    process.stdout.write(`${JSON.stringify({ activation })}\n`);
  } finally {
    await database.$disconnect();
  }
}

void main();
