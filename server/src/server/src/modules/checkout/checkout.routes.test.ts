import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { checkoutRouter } from './checkout.routes.js';

vi.mock('../quote/quote.service.js', () => ({
  calculateQuote: vi.fn().mockResolvedValue({
    subtotalCents: 1800,
    items: [{ menuItemId: 'p1', sizeId: 'large', quantity: 1, lineTotalCents: 1800 }],
  }),
}));

vi.mock('../store/store.service.js', () => ({
  getStoreSettings: vi.fn().mockResolvedValue({
    timeZone: 'America/Denver',
    openHour: 11,
    closeHour: 22,
    deliveryZipCodes: ['80202'],
    deliveryFeeCents: 399,
    taxRateBasisPoints: 825,
  }),
}));

const app = express();
app.use(express.json());
app.use('/api/checkout', checkoutRouter);

describe('POST /api/checkout/review', () => {
  const validPickup = {
    fulfillmentType: 'pickup',
    requestedTime: '2026-10-24T19:00:00Z',
    customer: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '3035551234',
    },
    items: [{ menuItemId: 'p1', sizeId: 'large', quantity: 1 }],
    tipCents: 200,
  };

  it('validates a legitimate pickup review', async () => {
    const res = await request(app).post('/api/checkout/review').send(validPickup);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.review.pricing.subtotalCents).toBe(1800);
  });

  it('rejects delivery if address is missing', async () => {
    const res = await request(app).post('/api/checkout/review').send({ ...validPickup, fulfillmentType: 'delivery' });
    expect(res.status).toBe(400);
    expect(res.body.errors['deliveryAddress']).toBeDefined();
  });

  it('rejects requested times outside store hours', async () => {
    const res = await request(app).post('/api/checkout/review').send({
      ...validPickup,
      requestedTime: '2026-10-24T08:00:00Z',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors['requestedTime']).toContain('operating hours');
  });

  it('ignores browser-submitted prices', async () => {
    const res = await request(app).post('/api/checkout/review').send({
      ...validPickup,
      items: [{ menuItemId: 'p1', sizeId: 'large', quantity: 1, price: 0.01 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.review.pricing.subtotalCents).toBe(1800);
  });
});
