import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';

// GET /api/orders/status/:reference for the confirmation screen (S2-18) and status page (S2-20).
const app = createApp();
const prisma = getPrisma();
const newRef = () => randomBytes(16).toString('base64url');

async function makeOrder(opts: { status?: 'PENDING_PAYMENT' | 'RECEIVED' | 'PAYMENT_FAILED'; paid?: boolean } = {}) {
  const publicRef = newRef();
  await prisma.order.create({
    data: {
      publicRef,
      idempotencyKey: `status-test-${randomUUID()}`,
      status: opts.status ?? 'PENDING_PAYMENT',
      fulfillment: 'DELIVERY',
      requestedTime: new Date('2030-06-15T18:00:00-06:00'),
      customerName: 'Private Person',
      customerPhone: '505-555-0199',
      customerEmail: 'private@example.com',
      deliveryAddress: '1 Secret Lane, Denver, CO 80202',
      subtotalCents: 2000,
      discountCents: 0,
      taxCents: 165,
      deliveryFeeCents: 399,
      tipCents: 300,
      totalCents: 2864,
      taxRateBps: 825,
      lines: {
        create: [
          {
            position: 0,
            menuItemId: randomUUID(),
            itemName: 'Pepperoni Party',
            sizeLabel: 'Medium',
            crustName: 'Hand Tossed',
            quantity: 1,
            instructions: 'Well done',
            unitPriceCents: 2000,
            extendedPriceCents: 2000,
            toppings: { create: [{ name: 'Mushrooms', placement: 'LEFT', priceCents: 63 }] },
          },
        ],
      },
      payment: {
        create: {
          gatewayRef: `pi_status_${randomUUID()}`,
          status: opts.paid ? 'succeeded' : 'requires_payment_method',
          amountCents: 2864,
          cardBrand: opts.paid ? 'visa' : null,
          last4: opts.paid ? '4242' : null,
        },
      },
    },
  });
  return publicRef;
}

describe('GET /api/orders/status/:reference', () => {
  let pendingRef: string;
  let paidRef: string;
  beforeAll(async () => {
    pendingRef = await makeOrder();
    paidRef = await makeOrder({ status: 'RECEIVED', paid: true });
  });
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { publicRef: { in: [pendingRef, paidRef] } } });
    await disconnect();
  });

  it('shows the order contents, totals, and status for the customer link', async () => {
    const res = await request(app).get(`/api/orders/status/${paidRef}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      status: 'RECEIVED',
      fulfillment: 'DELIVERY',
      requestedTime: '2030-06-16T00:00:00.000Z',
      subtotalCents: 2000,
      deliveryFeeCents: 399,
      totalCents: 2864,
      paymentStatus: 'PAID',
      card: { brand: 'visa', last4: '4242' },
      lines: [
        {
          name: 'Pepperoni Party',
          size: 'Medium',
          crust: 'Hand Tossed',
          toppings: [{ name: 'Mushrooms', placement: 'LEFT' }],
          quantity: 1,
          instructions: 'Well done',
          extendedPriceCents: 2000,
        },
      ],
    });
    expect(typeof res.body.orderNumber).toBe('number');
  });

  it('reports a payment that is still processing as pending', async () => {
    const res = await request(app).get(`/api/orders/status/${pendingRef}`);
    expect(res.body).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', card: null });
  });

  it('never returns the customer name, phone, email, or address', async () => {
    const res = await request(app).get(`/api/orders/status/${paidRef}`);
    const text = JSON.stringify(res.body);
    for (const secret of ['Private Person', '505-555-0199', 'private@example.com', 'Secret Lane']) expect(text).not.toContain(secret);
    expect(res.body).not.toHaveProperty('id');
    expect(res.body).not.toHaveProperty('idempotencyKey');
  });

  it('answers an unknown or malformed reference with the same 404', async () => {
    const unknown = await request(app).get(`/api/orders/status/${newRef()}`);
    const malformed = await request(app).get('/api/orders/status/1');
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(malformed.body).toEqual(unknown.body);
  });
});
