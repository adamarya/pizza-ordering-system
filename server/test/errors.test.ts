import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp, errorLogText } from '../src/app.js';
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

  it('keeps customer details from a failed database call out of the server log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The shape of a Prisma validation error: the first line names the call, and the lines after it
    // repeat the call's arguments, which here hold a customer's contact details.
    const err = new Error(
      'Invalid `prisma.order.create()` invocation in\n/app/server/dist/orders.repository.js:40:7\n\n' +
        '  data: {\n    customerName: "Jane Example",\n    phone: "5055550123",\n    deliveryAddress: "12 Main St"\n  }',
    );
    err.name = 'PrismaClientValidationError';
    vi.spyOn(getPrisma().storeSettings, 'findFirst').mockRejectedValueOnce(err);
    const res = await request(app).get('/api/menu');
    expect(res.status).toBe(500);
    const text = logged.mock.calls.flat().map(String).join('\n');
    expect(text).toContain('PrismaClientValidationError: Invalid `prisma.order.create()` invocation in');
    expect(text).not.toMatch(/Jane|5055550123|Main St/);
  });
});

describe('errorLogText', () => {
  it('keeps the type, code, first line, and stack frames', () => {
    const err = Object.assign(new Error('Unique constraint failed\nfields: (`email`) value "a@b.example"'), { code: 'P2002' });
    const text = errorLogText(err);
    expect(text.split('\n')[0]).toBe('Error P2002: Unique constraint failed');
    expect(text).toMatch(/\n\s+at /);
    expect(text).not.toContain('a@b.example');
  });

  it('describes a thrown value that is not an Error without printing it', () => {
    expect(errorLogText({ phone: '5055550123' })).toBe('Unexpected error of type object');
  });
});
