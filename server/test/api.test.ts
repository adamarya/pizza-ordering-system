import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';
import { seedDemoData } from '../src/seed/demoData.js';

// Integration tests for the Sprint 1 endpoints against a real PostgreSQL database with the demo
// data loaded. CI provides the database and applies migrations before the tests run.
// Note: running these resets the database named in DATABASE_URL to the demo data.

const app = createApp();
type MenuItem = { id: string; name: string; isPizza: boolean; isAvailable: boolean; sizes: { id: string }[]; crusts: { id: string; name: string }[]; toppings: { id: string; name: string }[] };
let items: MenuItem[] = [];
const find = (name: string) => items.find((i) => i.name === name)!;

beforeAll(async () => {
  await seedDemoData(getPrisma());
  const res = await request(app).get('/api/menu');
  items = res.body.categories.flatMap((c: { items: MenuItem[] }) => c.items);
});
afterAll(() => disconnect());

describe('GET /api/menu', () => {
  it('returns categories in display order with prices in cents and an ETag', async () => {
    const res = await request(app).get('/api/menu');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { name: string }) => c.name)).toEqual(['Pizzas', 'Sides', 'Drinks']);
    expect(res.body.store).toMatchObject({ name: 'Crust & Co.', taxRateBps: 825, deliveryFeeCents: 399, deliveryFeeTaxable: false });
    expect(res.headers.etag).toBe(`W/"menu-${res.body.menuVersion}"`);
  });

  it('answers 304 when the browser already has the current menu', async () => {
    const first = await request(app).get('/api/menu');
    const again = await request(app).get('/api/menu').set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);
  });

  it('shows an unavailable item as unavailable instead of hiding it', () => {
    expect(find('Spicy Garden (Seasonal)').isAvailable).toBe(false);
  });
});

describe('GET /api/menu/items/:id', () => {
  it('returns one item with its options', async () => {
    const res = await request(app).get(`/api/menu/items/${find('Pepperoni Party').id}`);
    expect(res.status).toBe(200);
    expect(res.body.sizes).toHaveLength(3);
    expect(res.body.crusts).toHaveLength(3);
    expect(res.body.toppings).toHaveLength(6);
  });

  it('rejects an id that is not a UUID and returns 404 for an unknown item', async () => {
    expect((await request(app).get('/api/menu/items/1 OR 1=1')).status).toBe(400);
    expect((await request(app).get('/api/menu/items/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('POST /api/cart/quote', () => {
  it('prices a cart on the server from current catalog prices', async () => {
    const pizza = find('Pepperoni Party');
    const pepperoni = pizza.toppings.find((t) => t.name === 'Pepperoni')!;
    const stuffed = pizza.crusts.find((c) => c.name === 'Stuffed Crust')!;
    const res = await request(app)
      .post('/api/cart/quote')
      .send({
        fulfillment: 'DELIVERY',
        lines: [
          {
            menuItemId: pizza.id,
            sizeId: pizza.sizes[1].id, // Medium 1400
            crustId: stuffed.id, // +250
            toppings: [{ toppingId: pepperoni.id, placement: 'RIGHT' }], // +63
            quantity: 1,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.subtotalCents).toBe(1713);
    expect(res.body.taxCents).toBe(141); // 1713 x 8.25% = 141.32
    expect(res.body.deliveryFeeCents).toBe(399);
    expect(res.body.totalCents).toBe(1713 + 141 + 399);
    expect(res.headers['ratelimit-policy']).toBe('120;w=60');
  });

  it('validates the request on the server', async () => {
    const pizza = find('Pepperoni Party');
    const bad = await request(app)
      .post('/api/cart/quote')
      .send({ fulfillment: 'PICKUP', lines: [{ menuItemId: pizza.id, sizeId: pizza.sizes[0].id, quantity: 21 }] });
    expect(bad.status).toBe(400);
    const tooLong = await request(app)
      .post('/api/cart/quote')
      .send({ fulfillment: 'PICKUP', lines: [{ menuItemId: pizza.id, sizeId: pizza.sizes[0].id, quantity: 1, instructions: 'x'.repeat(201) }] });
    expect(tooLong.status).toBe(400);
    const extraField = await request(app).post('/api/cart/quote').send({ fulfillment: 'PICKUP', lines: [], totalCents: 1 });
    expect(extraField.status).toBe(400);
  });

  it('returns a line error for an unavailable item', async () => {
    const spicy = find('Spicy Garden (Seasonal)');
    const res = await request(app)
      .post('/api/cart/quote')
      .send({ fulfillment: 'PICKUP', lines: [{ menuItemId: spicy.id, sizeId: spicy.sizes[0].id, crustId: spicy.crusts[0].id, quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.lines[0].error.code).toBe('ITEM_UNAVAILABLE');
    expect(res.body.subtotalCents).toBe(0);
  });
});


describe('store profile settings (PB-02)', () => {
  it('returns store contact details and opening hours from persisted data', async () => {
    const res = await request(app).get('/api/store');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Crust & Co.',
      streetAddress: '123 Main Street',
      phone: '555-0100',
      email: 'hello@crustandco.example',
    });
    expect(res.body.openingHours.monday).toBe('11:00 AM – 9:00 PM');
  });

  it('requires manager authorization before saving settings', async () => {
    const previous = process.env.MANAGER_SETTINGS_TOKEN;
    process.env.MANAGER_SETTINGS_TOKEN = 'test-only-manager-token';
    try {
      const profile = (await request(app).get('/api/store')).body;
      const denied = await request(app).put('/api/store/settings').send(profile);
      expect(denied.status).toBe(401);
      const saved = await request(app)
        .put('/api/store/settings')
        .set('Authorization', 'Bearer test-only-manager-token')
        .send(profile);
      expect(saved.status).toBe(200);
      expect(saved.body.name).toBe(profile.name);
    } finally {
      if (previous === undefined) delete process.env.MANAGER_SETTINGS_TOKEN;
      else process.env.MANAGER_SETTINGS_TOKEN = previous;
    }
  });
});

describe('order confirmation and private status (PB order flow)', () => {
  it('creates an order number and unguessable reference, then serves its status only by reference', async () => {
    const item = find('Garlic Knots');
    const created = await request(app).post('/api/orders').send({
      fulfillment: 'PICKUP',
      lines: [{ menuItemId: item.id, sizeId: item.sizes[0].id, quantity: 2 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.orderNumber).toMatch(/^PZ-\d{8}-[A-F0-9]{6}$/);
    expect(created.body.publicReference).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(created.body.totalCents).toBeGreaterThan(0);
    expect(created.body.paymentStatus).toBe('NOT_PROCESSED');

    const found = await request(app).get(`/api/orders/status/${created.body.publicReference}`);
    expect(found.status).toBe(200);
    expect(found.body.orderNumber).toBe(created.body.orderNumber);
    expect(found.body.status).toBe('RECEIVED');
    const denied = await request(app).patch(`/api/orders/${created.body.orderNumber}/status`).send({ status: 'READY' });
    expect(denied.status).toBe(401);
    const previous = process.env.MANAGER_SETTINGS_TOKEN;
    process.env.MANAGER_SETTINGS_TOKEN = 'test-only-manager-token';
    try {
      const updated = await request(app)
        .patch(`/api/orders/${created.body.orderNumber}/status`)
        .set('Authorization', 'Bearer test-only-manager-token')
        .send({ status: 'READY' });
      expect(updated.status).toBe(200);
      const refreshed = await request(app).get(`/api/orders/status/${created.body.publicReference}`);
      expect(refreshed.body.status).toBe('READY');
    } finally {
      if (previous === undefined) delete process.env.MANAGER_SETTINGS_TOKEN;
      else process.env.MANAGER_SETTINGS_TOKEN = previous;
    }
    expect((await request(app).get('/api/orders/status/not-a-secret')).status).toBe(404);
  });
});

// Runs last: reseeding replaces every row, so the ids captured above stop matching.
describe('demo data for the public test site', () => {
  it('loads the menu without the demo accounts when asked to', async () => {
    const prisma = getPrisma();
    await seedDemoData(prisma, { accounts: false });
    expect(await prisma.userAccount.count()).toBe(0);
    expect(await prisma.menuItem.count()).toBe(7);
    await seedDemoData(prisma);
    expect(await prisma.userAccount.count()).toBe(2);
  });
});
