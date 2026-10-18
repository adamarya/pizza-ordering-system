import { PrismaClient } from '@prisma/client';

// One shared client for the process, created on first use. Prisma uses parameterized queries for
// every call, so no query is ever assembled from user-supplied text (PB-12).
let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export async function disconnect() {
  await client?.$disconnect();
}
