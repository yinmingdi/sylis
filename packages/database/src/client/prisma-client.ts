import prismaClientPackage from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

import type { DatabaseConfig } from "../config/database-config";

const { Prisma, PrismaClient } = prismaClientPackage;

export type SylisDatabase = PrismaClientType;
export type SylisTransaction =
  import("@prisma/client").Prisma.TransactionClient;

export function createPrismaClient(config: DatabaseConfig): PrismaClientType {
  return new PrismaClient({
    datasourceUrl: config.url,
    log: config.log,
  });
}

export { Prisma, PrismaClient };
