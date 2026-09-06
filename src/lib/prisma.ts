import "server-only";

import { PrismaClient } from "@prisma/client";

import { requireDatabaseUrl } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function prisma(): PrismaClient {
  requireDatabaseUrl();
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export async function pingDatabase(): Promise<boolean> {
  try {
    requireDatabaseUrl();
    await prisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
