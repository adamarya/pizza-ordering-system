import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';

// Error responses (S2-31 follow-up from the review of #14, PB-12): a rejected request body gets a
// 4xx with a plain message, an unexpected failure gets a generic 500, and neither response carries
// the error's detail. Security headers are on these responses too.
const app = createApp();

afterEach(() => vi.restoreAllMocks());
afterAll(() => disconnect());

describe('error responses', () => {
  it('answers malformed JSON with 400, not 500', async () => {
    const res = await request(app).post('/api/cart/quote').set('Content-Type', 'application/json').send('{"lines": [');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'The request could not be read. Please try again.' });
  });

  it('answers a body over the 100 kB limit with 413', async () => {
    const res = await request(app)
      .post('/api/cart/quote')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(120_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'The request is too large.' });
  });

  it('answers an unexpected failure with a generic 500 that reveals nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // keep the expected log out of the test output
    vi.spyOn(getPrisma().storeSettings, 'findFirst').mockRejectedValueOnce(
      new Error('connection to postgresql://pizza:secret@db.internal failed'),
    );
    const res = await request(app).get('/api/menu');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong. Please try again.' });
    expect(res.text).not.toMatch(/postgresql|secret|db\.internal|at /);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(console.error).toHaveBeenCalled(); // the detail goes to the server log instead
  });
});
