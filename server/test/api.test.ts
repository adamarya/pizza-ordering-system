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
