import type { OrderStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';
import { hashPassword } from '../src/modules/auth/password.js';

// S2-22: the staff order queue through the real API and database.
const app = createApp();
const prisma = getPrisma();
const PASSWORD = 'Queue-Test-Pass-9!';
const STAFF = 'queue-test-staff';
const orderIds: string[] = [];
let cookie = '';

async function makeOrder(status: OrderStatus, customerName: string, minutesAgo: number) {
  const order = await prisma.order.create({
    data: {
      publicRef: randomBytes(16).toString('base64url'),
      idempotencyKey: `queue-test-${randomUUID()}`,
      status,
      fulfillment: 'PICKUP',
      customerName,
      customerPhone: '505-555-0100',
      customerEmail: 'queue-test@example.com',
      subtotalCents: 1299,
      discountCents: 0,
      taxCents: 107,
      deliveryFeeCents: 0,
      tipCents: 0,
      totalCents: 1406,
      taxRateBps: 825,
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
      lines: {
        create: [
          {
            position: 0,
            menuItemId: randomUUID(),
            itemName: 'Test Pizza',
            sizeLabel: 'Small',
            quantity: 1,
            instructions: 'no onions',
            unitPriceCents: 1299,
            extendedPriceCents: 1299,
          },
        ],
      },
    },
  });
  orderIds.push(order.id);
}

beforeAll(async () => {
  await prisma.userAccount.deleteMany({ where: { username: STAFF } });
  await prisma.userAccount.create({
    data: { username: STAFF, passwordHash: await hashPassword(PASSWORD), role: 'STAFF' },
  });
  const login = await request(app).post('/api/auth/login').send({ username: STAFF, password: PASSWORD });
  cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

  await makeOrder('READY', 'Queue Test C', 1);
  await makeOrder('RECEIVED', 'Queue Test A', 30);
  await makeOrder('IN_PROGRESS', 'Queue Test B', 10);
  await makeOrder('COMPLETED', 'Queue Test Done', 20);
  await makeOrder('CANCELLED', 'Queue Test Cancelled', 20);
  await makeOrder('PENDING_PAYMENT', 'Queue Test Unpaid', 20);
});
afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } }); // lines go with them
  await prisma.userAccount.deleteMany({ where: { username: STAFF } });
  await disconnect();
});

describe('staff order queue (S2-22)', () => {
  it('needs a signed-in session', async () => {
    expect((await request(app).get('/api/staff/orders')).status).toBe(401);
  });

  it('lists open orders in the sequence received and leaves out the rest', async () => {
    const res = await request(app).get('/api/staff/orders').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const ours = res.body.orders.filter((o: { customerName: string }) => o.customerName.startsWith('Queue Test'));
    expect(ours.map((o: { customerName: string }) => o.customerName)).toEqual([
      'Queue Test A',
      'Queue Test B',
      'Queue Test C',
    ]);
    expect(ours[0].lines[0]).toMatchObject({ itemName: 'Test Pizza', sizeLabel: 'Small', instructions: 'no onions' });
  });

  it('does not send the customer phone or email', async () => {
    const res = await request(app).get('/api/staff/orders').set('Cookie', cookie);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('505-555-0100');
    expect(text).not.toContain('queue-test@example.com');
  });
});
