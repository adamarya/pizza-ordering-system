import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { disconnect } from '../src/db.js';

// S2-31 (PB-12): every response carries strict transport security, content type, frame, and
// content security policy headers, including API errors. The HTTP to HTTPS redirect is done by
// Azure App Service (HTTPS Only) and checked against the deployed site in the CI smoke test.
describe('security headers on every response', () => {
  afterAll(() => disconnect());

  const app = createApp();
  const cases: [string, () => request.Test][] = [
    ['health check', () => request(app).get('/health')],
    ['menu', () => request(app).get('/api/menu')],
    ['unknown API route', () => request(app).get('/api/does-not-exist')],
    ['rejected quote', () => request(app).post('/api/cart/quote').send({})],
  ];

  it.each(cases)('%s', async (_name, send) => {
    const res = await send();
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d{7,}/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
