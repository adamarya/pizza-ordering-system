import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireRole } from '../src/modules/auth/requireRole.js';

// S2-05: the role guard on its own, with a stand-in for the signed-in account.
function appWith(role: string | undefined, ...allowed: Parameters<typeof requireRole>) {
  const app = express();
  app.use((_req, res, next) => {
    if (role) res.locals.auth = { user: { role } };
    next();
  });
  app.get('/x', requireRole(...allowed), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireRole', () => {
  it('lets an allowed role through', async () => {
    expect((await request(appWith('MANAGER', 'MANAGER')).get('/x')).status).toBe(200);
    expect((await request(appWith('STAFF', 'STAFF', 'MANAGER')).get('/x')).status).toBe(200);
  });

  it('refuses a role that is not allowed with 403', async () => {
    expect((await request(appWith('STAFF', 'MANAGER')).get('/x')).status).toBe(403);
  });

  it('refuses when no one is signed in, instead of crashing', async () => {
    expect((await request(appWith(undefined, 'MANAGER')).get('/x')).status).toBe(403);
  });
});