import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnect, getPrisma } from '../src/db.js';
import {
    ABSOLUTE_LIFETIME_MS,
    createSession,
    endSession,
    hashToken,
    IDLE_TIMEOUT_MS,
    resolveSession,
} from '../src/modules/auth/session.js';

// S2-03: session behavior against a real database. The clock is passed in, so no test waits.
const prisma = getPrisma();
const MIN = 60 * 1000;
const T0 = new Date('2026-11-02T12:00:00Z');
let userId = '';

beforeAll(async () => {
  const user = await prisma.userAccount.create({
    data: { username: 'session-test-user', passwordHash: 'not-a-real-hash', role: 'STAFF' },
  });
  userId = user.id;
});
afterAll(async () => {
  await prisma.userAccount.deleteMany({ where: { id: userId } }); // its sessions go with it
  await disconnect();
});

describe('sessions (S2-03)', () => {
  it('stores only a hash of the token, never the token', async () => {
    const { token } = await createSession(prisma, userId, T0);
    const row = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(row).not.toBeNull();
    expect(row!.tokenHash).not.toBe(token);
    expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull();
  });

  it('resolves a valid token to the account without exposing the password hash', async () => {
    const { token } = await createSession(prisma, userId, T0);
    const found = await resolveSession(prisma, token, new Date(T0.getTime() + MIN));
    expect(found?.user).toEqual({ id: userId, username: 'session-test-user', role: 'STAFF' });
    expect(found?.user).not.toHaveProperty('passwordHash');
  });

  it('rejects an unknown token', async () => {
    expect(await resolveSession(prisma, 'made-up-token', T0)).toBeNull();
  });

  it('ends the session after 30 minutes without activity', async () => {
    const { token } = await createSession(prisma, userId, T0);
    expect(await resolveSession(prisma, token, new Date(T0.getTime() + IDLE_TIMEOUT_MS + MIN))).toBeNull();
    expect(await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })).toBeNull();
  });

  it('keeps a session alive while it is used, by moving the idle deadline forward', async () => {
    const { token } = await createSession(prisma, userId, T0);
    expect(await resolveSession(prisma, token, new Date(T0.getTime() + 20 * MIN))).not.toBeNull();
    // 45 minutes after sign-in is past the first deadline, but only 25 minutes after the last use.
    expect(await resolveSession(prisma, token, new Date(T0.getTime() + 45 * MIN))).not.toBeNull();
  });

  it('ends the session 8 hours after sign-in even if it is used constantly', async () => {
    const { token } = await createSession(prisma, userId, T0);
    for (let m = 25; m <= 475; m += 25) {
      expect(await resolveSession(prisma, token, new Date(T0.getTime() + m * MIN))).not.toBeNull();
    }
    const row = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(row!.idleExpiresAt.getTime()).toBe(T0.getTime() + ABSOLUTE_LIFETIME_MS); // capped
    expect(await resolveSession(prisma, token, new Date(T0.getTime() + 481 * MIN))).toBeNull();
  });

  it('stops working immediately after sign-out', async () => {
    const { token } = await createSession(prisma, userId, T0);
    await endSession(prisma, token);
    expect(await resolveSession(prisma, token, new Date(T0.getTime() + MIN))).toBeNull();
  });

  it('refuses a session whose account has been disabled', async () => {
    const { token } = await createSession(prisma, userId, T0);
    await prisma.userAccount.update({ where: { id: userId }, data: { isDisabled: true } });
    expect(await resolveSession(prisma, token, new Date(T0.getTime() + MIN))).toBeNull();
    await prisma.userAccount.update({ where: { id: userId }, data: { isDisabled: false } });
  });
});