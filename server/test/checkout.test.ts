import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';
import { seedDemoData } from '../src/seed/demoData.js';
import { storeHour } from '../src/modules/checkout/checkout.settings.js';

// POST /api/checkout/validate (S2-07 to S2-10). Test cases by Emmanuella Ahinkrah, run against the
// real database and pricing service instead of mocks. Resets the demo data.

const app = createApp();
type MenuItem = { id: string; name: string; sizes: { id: string }[]; crusts: { id: string; name: string }[] };
let pizzaLine: Record<string, unknown>;

// Fixed future times in Denver (MDT, UTC-6), so the tests do not depend on today's clock.
const EVENING = '2030-06-15T18:00:00-06:00';
const EARLY_MORNING = '2030-06-15T08:00:00-06:00';

const validPickup = () => ({
  fulfillment: 'PICKUP',
  requestedTime: EVENING,
  customer: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '303-555-1234' },
  lines: [pizzaLine],
  tip: { type: 'AMOUNT', cents: 200 },
});
const validate = (body: object) => request(app).post('/api/checkout/validate').send(body);

beforeAll(async () => {
  await seedDemoData(getPrisma());
  const res = await request(app).get('/api/menu');
  const items: MenuItem[] = res.body.categories.flatMap((c: { items: MenuItem[] }) => c.items);
  const pizza = items.find((i) => i.name === 'Pepperoni Party')!;
  pizzaLine = { menuItemId: pizza.id, sizeId: pizza.sizes[1].id, crustId: pizza.crusts[0].id, quantity: 1 }; // Medium 1400
});
afterAll(() => disconnect());

describe('POST /api/checkout/validate', () => {
  it('validates a legitimate pickup order and returns the server-priced review', async () => {
    const res = await validate(validPickup());
    expect(res.status).toBe(200);
    expect(res.body.review.quote).toMatchObject({ subtotalCents: 1400, taxCents: 116, tipCents: 200, totalCents: 1716 });
    expect(res.body.review.customer.firstName).toBe('Jane');
  });

  it('rejects delivery when the address is missing', async () => {
    const res = await validate({ ...validPickup(), fulfillment: 'DELIVERY' });
    expect(res.status).toBe(400);
    expect(res.body.errors.deliveryAddress).toBeDefined();
  });

  it('accepts delivery inside the area and does not tax the delivery fee (Table 21)', async () => {
    const res = await validate({
      ...validPickup(),
      fulfillment: 'DELIVERY',
      deliveryAddress: { street: '1600 Glenarm Place', city: 'Denver', state: 'CO', zipCode: '80202' },
    });
    expect(res.status).toBe(200);
    expect(res.body.review.quote).toMatchObject({ subtotalCents: 1400, deliveryFeeCents: 399, taxCents: 116 });
  });

  it('refuses a ZIP code outside the delivery area', async () => {
    const res = await validate({
      ...validPickup(),
      fulfillment: 'DELIVERY',
      deliveryAddress: { street: '1 Main Street', city: 'Boulder', state: 'CO', zipCode: '80301' },
    });
    expect(res.status).toBe(400);
    expect(res.body.errors['deliveryAddress.zipCode']).toMatch(/80301/);
  });

  it('rejects requested times outside store hours, in the store time zone', async () => {
    expect(storeHour(new Date(EARLY_MORNING))).toBe(8);
    const res = await validate({ ...validPickup(), requestedTime: EARLY_MORNING });
    expect(res.status).toBe(400);
    expect(res.body.errors.requestedTime).toMatch(/outside our hours/);
  });

  it('rejects browser-submitted prices outright', async () => {
    const res = await validate({ ...validPickup(), lines: [{ ...pizzaLine, price: 1 }] });
    expect(res.status).toBe(400);
  });

  it('returns field-level messages for contact details', async () => {
    const res = await validate({ ...validPickup(), customer: { firstName: '', lastName: 'Doe', email: 'nope', phone: '12' } });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['customer.email', 'customer.firstName', 'customer.phone']);
  });
});
