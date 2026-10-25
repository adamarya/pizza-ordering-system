// First-manager command (S2-03). Run once, on purpose: MANAGER_USERNAME and MANAGER_PASSWORD come
// from the environment, never from code or the seed, because this repository is public.
// It prints the username only, never the password.
import { PrismaClient } from '@prisma/client';
import { createFirstManager } from '../src/modules/auth/firstManager.js';

const prisma = new PrismaClient();
try {
  const result = await createFirstManager(prisma, {
    username: process.env.MANAGER_USERNAME,
    password: process.env.MANAGER_PASSWORD,
  });
  if (result.kind === 'created') {
    console.log(`Manager account created for "${result.username}".`);
  } else if (result.kind === 'manager-exists') {
    console.error('A manager account already exists. Nothing was changed.');
    process.exitCode = 1;
  } else {
    console.error(result.reason);
    process.exitCode = 1;
  }
} catch {
  console.error('Could not create the manager account.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}