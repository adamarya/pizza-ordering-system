import { Router, type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { getPrisma } from '../../db.js';
import { verifyPassword } from './password.js';
import { ABSOLUTE_LIFETIME_MS, createSession, endSession, resolveSession } from './session.js';

// S2-03: sign in, sign out, and who-am-I. Rate limiting, lockout, and the timing of unknown-user
// answers are S2-04; role checks on staff endpoints are S2-05.
export const authRouter = Router();
export const COOKIE_NAME = 'session';

// HttpOnly: page scripts cannot read it. SameSite=Strict: other sites cannot make the browser send
// it. Secure: HTTPS only, switched on in production (local development runs on plain http).
function cookie(value: string, maxAgeSeconds: number) {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Strict${secure}`;
}

// Express does not read cookies on its own; the token is URL-safe text, so no decoding is needed.
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Resolves the cookie to a signed-in account for the routes after it. S2-05 builds requireRole on this.
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readCookie(req.headers.cookie, COOKIE_NAME);
    const auth = token ? await resolveSession(getPrisma(), token) : null;
    if (!token || !auth) {
      if (token) res.append('Set-Cookie', cookie('', 0)); // drop a cookie that no longer works
      return res.status(401).json({ error: 'Please sign in.' });
    }
    res.locals.auth = auth;
    res.locals.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(128),
});

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a username and password.' });
    const { username, password } = parsed.data;

    const prisma = getPrisma();
    const user = await prisma.userAccount.findUnique({ where: { username } });
    // One message for every failure, so the answer never says which usernames exist.
    if (!user || user.isDisabled || !(await verifyPassword(user.passwordHash, password))) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    // A brand-new token on every sign-in; an old one is never reused.
    const { token, csrfToken } = await createSession(prisma, user.id);
    res.set('Cache-Control', 'no-store');
    res.append('Set-Cookie', cookie(token, Math.floor(ABSOLUTE_LIFETIME_MS / 1000)));
    return res.json({ user: { id: user.id, username: user.username, role: user.role }, csrfToken });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/me', requireSession, (_req, res) => {
  const { user, csrfToken } = res.locals.auth;
  res.set('Cache-Control', 'no-store');
  res.json({ user, csrfToken });
});

authRouter.post('/auth/logout', requireSession, async (req, res, next) => {
  try {
    // The page must send back the CSRF token it was given, which another site cannot know.
    const sent = req.get('X-CSRF-Token');
    if (!sent || !sameSecret(sent, res.locals.auth.csrfToken)) {
      return res.status(403).json({ error: 'The request could not be verified.' });
    }
    await endSession(getPrisma(), res.locals.sessionToken);
    res.append('Set-Cookie', cookie('', 0));
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});