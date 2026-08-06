import { randomUUID } from "node:crypto";

import { createPrismaClient } from "../client/prisma-client";

export function createTestDatabase(url = process.env.TEST_DATABASE_URL) {
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  return {
    id: randomUUID(),
    client: createPrismaClient({ url, log: ["error"] }),
  };
}
