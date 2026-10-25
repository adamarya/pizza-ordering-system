import { Prisma, type PrismaClient } from '@prisma/client';
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password.js';

// S2-03: the logic behind `npm run create-manager`. It exists so a brand-new site has someone who
// can sign in. It is for first-time setup only, so it refuses once any manager exists.
export type CreateManagerResult =
  | { kind: 'created'; username: string }
  | { kind: 'manager-exists' }
  | { kind: 'invalid'; reason: string };

const invalid = (reason: string): CreateManagerResult => ({ kind: 'invalid', reason });

export async function createFirstManager(
  prisma: PrismaClient,
  input: { username?: string; password?: string },
): Promise<CreateManagerResult> {
  const username = input.username?.trim();
  const password = input.password;
  if (!username || username.length > 100) return invalid('MANAGER_USERNAME must be 1 to 100 characters.');
  if (!password || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return invalid(`MANAGER_PASSWORD must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
  }

  if ((await prisma.userAccount.count({ where: { role: 'MANAGER' } })) > 0) return { kind: 'manager-exists' };

  try {
    await prisma.userAccount.create({
      data: { username, passwordHash: await hashPassword(password), role: 'MANAGER' },
    });
  } catch (err) {
    // The username column is unique, so a name already used by any account is refused.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return invalid('That username is already taken.');
    }
    throw err;
  }
  return { kind: 'created', username };
}