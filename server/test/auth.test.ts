import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { hashToken } from '../src/modules/auth/session.js';

// S2-03: sign in, who-am-I, and sign out through the real API and database.
const app = createApp();
const prisma = getPrisma();
const PASSWORD = 'Correct-Horse-9!';
const NAMES = ['login-test-manager', 'login-test-disabled'];

const cookieOf = (res: request.Response) => {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
  return { raw, token: /^session=([^;]*)/.exec(raw)?.[1] ?? '' };
};

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.userAccount.deleteMany({ where: { username: { in: NAMES } } });
  await prisma.userAccount.create({ data: { username: NAMES[0], passwordHash, role: 'MANAGER' } });
  await prisma.userAccount.create({ data: { username: NAMES[1], passwordHash, role: 'STAFF', isDisabled: true } });
});
afterAll(async () => {
  await prisma.userAccount.deleteMany({ where: { username: { in: NAMES } } }); // sessions go with them
  await disconnect();
});

const signIn = () => request(app).post('/api/auth/login').send({ username: NAMES[0], password: PASSWORD });

describe('sign in (S2-03)', () => {
  it('signs in and sets a cookie that is HttpOnly and SameSite=Strict', async () => {
    const res = await signIn();
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: NAMES[0], role: 'MANAGER' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(typeof res.body.csrfToken).toBe('string');
    const { raw } = cookieOf(res);
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain('Path=/');
  });

  it('keeps only a hash of the cookie token in the database', async () => {
    const { token } = cookieOf(await signIn());
    expect(token.length).toBeGreaterThan(20);
    expect(await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })).not.toBeNull();
    expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull();
  });

  it('gives the same answer for a wrong password, an unknown user, and a disabled account', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ username: NAMES[0], password: 'wrong-password-1' });
    const unknown = await request(app).post('/api/auth/login').send({ username: 'nobody-here', password: PASSWORD });
    const disabled = await request(app).post('/api/auth/login').send({ username: NAMES[1], password: PASSWORD });
    for (const res of [wrong, unknown, disabled]) expect(res.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(disabled.body).toEqual(wrong.body);
    expect(cookieOf(wrong).raw).toBe('');
  });

  it('rejects a request without a username and password', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('who am I and sign out (S2-03)', () => {
  it('answers 401 without a cookie and with the account when signed in', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const { token } = cookieOf(await signIn());
    const me = await request(app).get('/api/auth/me').set('Cookie', `session=${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(NAMES[0]);
  });

  it('needs the CSRF token to sign out, then the cookie stops working', async () => {
    const login = await signIn();
    const { token } = cookieOf(login);
    const cookie = `session=${token}`;

    const noCsrf = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(noCsrf.status).toBe(403);

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie).set('X-CSRF-Token', login.body.csrfToken);
    expect(out.status).toBe(204);
    expect(cookieOf(out).raw).toContain('Max-Age=0');

    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});