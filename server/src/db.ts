import { PrismaClient } from '@prisma/client';

// One shared client for the process, created on first use. Prisma uses parameterized queries for
// every call. The client is generated from prisma/schema.prisma by `npm run db:generate`, which
// needs at least one model, so until the Sprint 1 models land (S1-04) the health check reports
// the database as not initialized instead of crashing the server.
let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export async function disconnect() {
  await client?.$disconnect();
}
