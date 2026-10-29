import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnect, getPrisma } from '../src/db.js';
import { createFirstManager } from '../src/modules/auth/firstManager.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, verifyPassword } from '../src/modules/auth/password.js';

// S2-03: the first-manager command. These tests clear all accounts in the test database first.
const prisma = getPrisma();
const GOOD = 'Correct-Horse-9!';

beforeEach(async () => {
  await prisma.userAccount.deleteMany();
});
afterAll(() => disconnect());

describe('first manager (S2-03)', () => {
  it('creates a manager whose password is stored only as a hash that verifies', async () => {
    const result = await createFirstManager(prisma, { username: 'owner', password: GOOD });
    expect(result).toEqual({ kind: 'created', username: 'owner' });
    const row = await prisma.userAccount.findUniqueOrThrow({ where: { username: 'owner' } });
    expect(row.role).toBe('MANAGER');
    expect(row.passwordHash).not.toContain(GOOD);
    expect(await verifyPassword(row.passwordHash, GOOD)).toBe(true);
  });

  it('refuses to run again once a manager exists', async () => {
    await createFirstManager(prisma, { username: 'owner', password: GOOD });
    const second = await createFirstManager(prisma, { username: 'second-owner', password: GOOD });
    expect(second).toEqual({ kind: 'manager-exists' });
    expect(await prisma.userAccount.count()).toBe(1);
  });

  it('rejects a missing username and a password that is too short or too long, writing nothing', async () => {
    const results = await Promise.all([
      createFirstManager(prisma, { password: GOOD }),
      createFirstManager(prisma, { username: 'owner', password: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) }),
      createFirstManager(prisma, { username: 'owner', password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1) }),
      createFirstManager(prisma, { username: 'owner' }),
    ]);
    for (const r of results) expect(r.kind).toBe('invalid');
    expect(await prisma.userAccount.count()).toBe(0);
  });

  it('refuses a username that another account already uses', async () => {
    await prisma.userAccount.create({ data: { username: 'taken', passwordHash: 'not-a-real-hash', role: 'STAFF' } });
    const result = await createFirstManager(prisma, { username: 'taken', password: GOOD });
    expect(result).toEqual({ kind: 'invalid', reason: 'That username is already taken.' });
  });
});