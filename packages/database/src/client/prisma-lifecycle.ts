import type { PrismaClient } from "@prisma/client";

export interface PrismaLifecycle {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export const createPrismaLifecycle = (
  client: PrismaClient,
): PrismaLifecycle => ({
  connect: () => client.$connect(),
  disconnect: () => client.$disconnect(),
});
