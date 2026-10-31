import type { OrderStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';
import { hashPassword } from '../src/modules/auth/password.js';

// S2-23: changing an order's status through the real API and database.
const app = createApp();
const prisma = getPrisma();
const PASSWORD = 'Status-Test-Pass-9!';
const STAFF = 'status-test-staff';
const orderIds: string[] = [];
let cookie = '';
let csrfToken = '';

async function makeOrder(status: OrderStatus) {
  const order = await prisma.order.create({
    data: {
      publicRef: randomBytes(16).toString('base64url'),
      idempotencyKey: `status-test-${randomUUID()}`,
      status,
      fulfillment: 'PICKUP',
      customerName: 'Status Test',
      customerPhone: '505-555-0100',
      customerEmail: 'status-test@example.com',
      subtotalCents: 1299,
      discountCents: 0,
      taxCents: 107,
      deliveryFeeCents: 0,
      tipCents: 0,
      totalCents: 1406,
      taxRateBps: 825,
    },
  });
  orderIds.push(order.id);
  return order;
}

function change(orderNumber: number | string, status: unknown, withToken = true) {
  const req = request(app).post(`/api/staff/orders/${orderNumber}/status`).set('Cookie', cookie);
  if (withToken) req.set('X-CSRF-Token', csrfToken);
  return req.send({ status });
}

beforeAll(async () => {
  await prisma.userAccount.deleteMany({ where: { username: STAFF } });
  await prisma.userAccount.create({
    data: { username: STAFF, passwordHash: await hashPassword(PASSWORD), role: 'STAFF' },
  });
  const login = await request(app).post('/api/auth/login').send({ username: STAFF, password: PASSWORD });
  cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  csrfToken = login.body.csrfToken;
});
afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } }); // history rows go with them
  await prisma.userAccount.deleteMany({ where: { username: STAFF } });
  await disconnect();
});

describe('staff status changes (S2-23)', () => {
  it('needs a signed-in session', async () => {
    const order = await makeOrder('RECEIVED');
    const res = await request(app).post(`/api/staff/orders/${order.orderNumber}/status`).send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(401);
  });

  it('needs the CSRF token', async () => {
    const order = await makeOrder('RECEIVED');
    const res = await change(order.orderNumber, 'IN_PROGRESS', false);
    expect(res.status).toBe(403);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('RECEIVED');
  });

  it('moves an order one step at a time to completed and records who did each step', async () => {
    const order = await makeOrder('RECEIVED');
    for (const status of ['IN_PROGRESS', 'READY', 'COMPLETED'] as const) {
      const res = await change(order.orderNumber, status);
      expect(res.status).toBe(200);
      expect(res.body.order).toEqual({ orderNumber: order.orderNumber, status });
    }
    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id }, orderBy: { occurredAt: 'asc' } });
    expect(events.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
      ['RECEIVED', 'IN_PROGRESS', `staff:${STAFF}`],
      ['IN_PROGRESS', 'READY', `staff:${STAFF}`],
      ['READY', 'COMPLETED', `staff:${STAFF}`],
    ]);
  });

  it('refuses a skipped step and changes nothing', async () => {
    const order = await makeOrder('RECEIVED');
    const res = await change(order.orderNumber, 'READY');
    expect(res.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('RECEIVED');
    expect(await prisma.orderStatusEvent.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('refuses going backwards', async () => {
    const order = await makeOrder('READY');
    expect((await change(order.orderNumber, 'IN_PROGRESS')).status).toBe(409);
  });

  it('refuses an order that is not in the kitchen, such as an unpaid one', async () => {
    const order = await makeOrder('PENDING_PAYMENT');
    expect((await change(order.orderNumber, 'IN_PROGRESS')).status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
  });

  it('refuses a status the kitchen cannot set, and bad order numbers', async () => {
    const order = await makeOrder('RECEIVED');
    expect((await change(order.orderNumber, 'CANCELLED')).status).toBe(400);
    expect((await change(order.orderNumber, 'nonsense')).status).toBe(400);
    expect((await change('abc', 'IN_PROGRESS')).status).toBe(400);
    expect((await change(0, 'IN_PROGRESS')).status).toBe(400);
  });

  it('answers 404 for an order that does not exist', async () => {
    expect((await change(2_000_000_000, 'IN_PROGRESS')).status).toBe(404);
  });
});
