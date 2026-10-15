import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { disconnect } from '../src/db.js';

describe('GET /health', () => {
  afterAll(() => disconnect());

  it('reports the build version and database status without configuration values', async () => {
    const res = await request(createApp()).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('database');
    expect(JSON.stringify(res.body)).not.toMatch(/postgresql:\/\//);
  });

  it('returns a JSON 404 for an unknown API route', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
