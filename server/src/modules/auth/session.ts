import type { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

// S2-03: sessions. The browser holds a random token in a cookie; the database holds only its
// SHA-256 hash, so a copy of the database cannot be used to sign in. A session ends after 30
// minutes without activity or 8 hours after sign-in, whichever comes first.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000;

const newSecret = () => randomBytes(32).toString('base64url'); // 256 random bits, URL-safe
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// `now` is a parameter so the tests can move the clock instead of waiting 30 minutes.
export async function createSession(prisma: PrismaClient, userId: string, now = new Date()) {
  const token = newSecret();
  const csrfToken = newSecret();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      csrfToken,
      userId,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: new Date(now.getTime() + IDLE_TIMEOUT_MS),
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_LIFETIME_MS),
    },
  });
  return { token, csrfToken }; // the token goes into the cookie once; it is never stored
}

export async function resolveSession(prisma: PrismaClient, token: string, now = new Date()) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  const expired = now >= session.idleExpiresAt || now >= session.absoluteExpiresAt;
  if (expired || session.user.isDisabled) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  // Activity pushes the idle deadline forward, but never past the absolute limit.
  const idleExpiresAt = new Date(
    Math.min(now.getTime() + IDLE_TIMEOUT_MS, session.absoluteExpiresAt.getTime()),
  );
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now, idleExpiresAt } });

  // Only what the rest of the app needs; never the password hash.
  const { id, username, role } = session.user;
  return { sessionId: session.id, csrfToken: session.csrfToken, user: { id, username, role } };
}

export async function endSession(prisma: PrismaClient, token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}