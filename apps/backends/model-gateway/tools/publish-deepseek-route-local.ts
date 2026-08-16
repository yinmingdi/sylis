import { createPrismaClient, databaseConfigFromEnv } from "@sylis/database";

import { publishLocalDeepSeekRoute } from "../src/providers/deepseek/publish-deepseek-route";

async function main(): Promise<void> {
  const database = createPrismaClient(databaseConfigFromEnv());
  try {
    await database.$connect();
    const route = await publishLocalDeepSeekRoute(database);
    process.stdout.write(`${JSON.stringify({ route })}\n`);
  } finally {
    await database.$disconnect();
  }
}

void main();
