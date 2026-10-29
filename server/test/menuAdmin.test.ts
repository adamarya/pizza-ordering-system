import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { seedDemoData } from '../src/seed/demoData.js';

// Menu maintenance (S2-27, S2-28) through the real API and database. Resets the demo menu.
const app = createApp();
const prisma = getPrisma();
const PASSWORD = 'Menu-Admin-Test-9!';

type Who = { cookie: string; csrf: string };
let manager: Who;
let staff: Who;

async function signIn(username: string): Promise<Who> {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  const raw = (res.headers['set-cookie'] as unknown as string[])[0];
  return { cookie: raw.split(';')[0], csrf: res.body.csrfToken };
}
const as = (who: Who, method: 'post' | 'patch', url: string, body: object) =>
  request(app)[method](url).set('Cookie', who.cookie).set('X-CSRF-Token', who.csrf).send(body);

const customerMenu = async () => (await request(app).get('/api/menu')).body;
const findItem = (menu: { categories: { items: { id: string; name: string }[] }[] }, name: string) =>
  menu.categories.flatMap((c) => c.items).find((i) => i.name === name);

beforeAll(async () => {
  await seedDemoData(prisma, { accounts: false });
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.userAccount.create({ data: { username: 'menu-test-manager', passwordHash, role: 'MANAGER' } });
  await prisma.userAccount.create({ data: { username: 'menu-test-staff', passwordHash, role: 'STAFF' } });
  manager = await signIn('menu-test-manager');
  staff = await signIn('menu-test-staff');
});
afterAll(async () => {
  await seedDemoData(prisma); // leave the standard demo data for the next test file
  await disconnect();
});

describe('access to menu maintenance', () => {
  it('needs a signed-in session', async () => {
    expect((await request(app).get('/api/admin/menu')).status).toBe(401);
    expect((await request(app).post('/api/admin/toppings').send({ name: 'Basil', priceCents: 100 })).status).toBe(401);
  });

  it('keeps prices, text, and retirement for the manager; staff get 403', async () => {
    const admin = await request(app).get('/api/admin/menu').set('Cookie', staff.cookie);
    expect(admin.status).toBe(200); // staff can see the full menu to work availability
    const size = admin.body.categories[0].menuItems[0].sizes[0];
    expect((await as(staff, 'patch', `/api/admin/sizes/${size.id}`, { priceCents: 1 })).status).toBe(403);
    expect((await as(staff, 'post', '/api/admin/toppings', { name: 'Basil', priceCents: 100 })).status).toBe(403);
    const after = await prisma.itemSize.findUniqueOrThrow({ where: { id: size.id } });
    expect(after.priceCents).toBe(size.priceCents);
  });

  it('refuses a change without the session CSRF token', async () => {
    const res = await request(app)
      .post('/api/admin/toppings')
      .set('Cookie', manager.cookie)
      .send({ name: 'Basil', priceCents: 100 });
    expect(res.status).toBe(403);
    const wrong = await request(app)
      .post('/api/admin/toppings')
      .set('Cookie', manager.cookie)
      .set('X-CSRF-Token', staff.csrf)
      .send({ name: 'Basil', priceCents: 100 });
    expect(wrong.status).toBe(403);
    expect(await prisma.topping.count({ where: { name: 'Basil' } })).toBe(0);
  });
});

describe('manager maintenance (S2-27)', () => {
  it('adds a category, crust, topping, and pizza that customers see on their next menu load', async () => {
    const before = await request(app).get('/api/menu');
    const etag = before.headers.etag as string;

    const category = await as(manager, 'post', '/api/admin/categories', { name: 'Specials', displayOrder: 9 });
    const crust = await as(manager, 'post', '/api/admin/crusts', { name: 'Cauliflower', surchargeCents: 300 });
    const topping = await as(manager, 'post', '/api/admin/toppings', { name: 'Hot Honey', priceCents: 150 });
    expect([category.status, crust.status, topping.status]).toEqual([201, 201, 201]);

    const item = await as(manager, 'post', '/api/admin/items', {
      categoryId: category.body.id,
      name: 'Hot Honey Special',
      description: 'Pepperoni and hot honey.',
      isPizza: true,
      sizes: [
        { label: 'Small', priceCents: 1199, displayOrder: 0 },
        { label: 'Large', priceCents: 1899, displayOrder: 1 },
      ],
      crustIds: [crust.body.id],
      toppingIds: [topping.body.id],
    });
    expect(item.status).toBe(201);
    expect(item.body.sizes.map((s: { priceCents: number }) => s.priceCents)).toEqual([1199, 1899]);

    // The ETag follows menuVersion, so a browser holding the old menu gets the new one, not a 304.
    const stale = await request(app).get('/api/menu').set('If-None-Match', etag);
    expect(stale.status).toBe(200);
    expect(stale.headers.etag).not.toBe(etag);
    const shown = findItem(stale.body, 'Hot Honey Special');
    expect(shown).toBeDefined();
  });

  it('changes a price for new quotes', async () => {
    const admin = (await request(app).get('/api/admin/menu').set('Cookie', manager.cookie)).body;
    const item = admin.categories.flatMap((c: { menuItems: unknown[] }) => c.menuItems).find((i: { name: string }) => i.name === 'Hot Honey Special');
    const small = item.sizes[0];
    expect((await as(manager, 'patch', `/api/admin/sizes/${small.id}`, { priceCents: 1299 })).status).toBe(200);
    const quote = await request(app)
      .post('/api/cart/quote')
      .send({ fulfillment: 'PICKUP', lines: [{ menuItemId: item.id, sizeId: small.id, crustId: item.crusts[0].id, toppings: [], quantity: 1 }] });
    expect(quote.status).toBe(200);
    expect(quote.body.hasErrors).toBe(false);
    expect(quote.body.subtotalCents).toBe(1299 + 300); // new size price plus the crust surcharge
  });

  it('rejects decimal prices, unknown fields, crusts on a non-pizza, and unknown ids', async () => {
    const decimal = await as(manager, 'post', '/api/admin/toppings', { name: 'Basil', priceCents: 0.99 });
    expect(decimal.status).toBe(400);
    expect(decimal.body.errors.priceCents).toBe('Prices are whole cents.');
    expect((await as(manager, 'post', '/api/admin/toppings', { name: 'Basil', priceCents: 99, isAvailable: false, id: randomUUID() })).status).toBe(400);
    const anyCategory = await prisma.category.findFirstOrThrow();
    const anyCrust = await prisma.crust.findFirstOrThrow();
    const drink = await as(manager, 'post', '/api/admin/items', {
      categoryId: anyCategory.id,
      name: 'Lemonade',
      sizes: [{ label: 'Regular', priceCents: 299 }],
      crustIds: [anyCrust.id],
    });
    expect(drink.status).toBe(400);
    expect((await as(manager, 'patch', `/api/admin/sizes/${randomUUID()}`, { priceCents: 100 })).status).toBe(404);
    expect((await as(manager, 'patch', '/api/admin/sizes/not-an-id', { priceCents: 100 })).status).toBe(404);
    const noCategory = await as(manager, 'post', '/api/admin/items', { categoryId: randomUUID(), name: 'Ghost', sizes: [{ label: 'One', priceCents: 1 }] });
    expect(noCategory.status).toBe(404);
  });
});

describe('retire and availability (S2-28)', () => {
  it('lets staff switch availability, and customers see it on the next menu load', async () => {
    const item = await prisma.menuItem.findFirstOrThrow({ where: { name: 'Hot Honey Special' } });
    const res = await as(staff, 'patch', '/api/admin/availability', { kind: 'item', id: item.id, isAvailable: false });
    expect(res.status).toBe(200);
    expect(findItem(await customerMenu(), 'Hot Honey Special')).toMatchObject({ isAvailable: false });
    const topping = await prisma.topping.findFirstOrThrow({ where: { name: 'Hot Honey' } });
    expect((await as(staff, 'patch', '/api/admin/availability', { kind: 'topping', id: topping.id, isAvailable: false })).status).toBe(200);
    expect((await prisma.topping.findUniqueOrThrow({ where: { id: topping.id } })).isAvailable).toBe(false);
    await as(staff, 'patch', '/api/admin/availability', { kind: 'item', id: item.id, isAvailable: true });
  });

  it('removes a retired item from the customer menu but leaves placed orders as they were', async () => {
    const item = await prisma.menuItem.findFirstOrThrow({ where: { name: 'Hot Honey Special' }, include: { sizes: true } });
    // An order placed earlier keeps its own copy of the name and price (Figure 6).
    const order = await prisma.order.create({
      data: {
        publicRef: randomBytes(16).toString('base64url'),
        idempotencyKey: `menu-test-${randomUUID()}`,
        status: 'RECEIVED',
        fulfillment: 'PICKUP',
        customerName: 'Test',
        customerPhone: '505-555-0100',
        customerEmail: 'test@example.com',
        subtotalCents: 1299,
        discountCents: 0,
        taxCents: 107,
        deliveryFeeCents: 0,
        tipCents: 0,
        totalCents: 1406,
        taxRateBps: 825,
        lines: {
          create: [
            {
              position: 0,
              menuItemId: item.id,
              itemName: item.name,
              sizeLabel: 'Small',
              quantity: 1,
              instructions: '',
              unitPriceCents: 1299,
              extendedPriceCents: 1299,
            },
          ],
        },
      },
    });

    expect((await as(manager, 'patch', `/api/admin/items/${item.id}`, { isRetired: true })).status).toBe(200);
    await as(manager, 'patch', `/api/admin/sizes/${item.sizes[0].id}`, { priceCents: 1499 });

    expect(findItem(await customerMenu(), 'Hot Honey Special')).toBeUndefined();
    expect((await request(app).get(`/api/menu/items/${item.id}`)).status).toBe(404);
    const quote = await request(app)
      .post('/api/cart/quote')
      .send({ fulfillment: 'PICKUP', lines: [{ menuItemId: item.id, sizeId: item.sizes[0].id, toppings: [], quantity: 1 }] });
    expect(quote.body.hasErrors).toBe(true);

    const kept = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } });
    expect(kept.totalCents).toBe(1406);
    expect(kept.lines[0]).toMatchObject({ itemName: 'Hot Honey Special', unitPriceCents: 1299 });

    const admin = (await request(app).get('/api/admin/menu').set('Cookie', manager.cookie)).body;
    expect(JSON.stringify(admin)).toContain('Hot Honey Special'); // still there for the manager to restore
    await prisma.order.delete({ where: { id: order.id } });
  });
});
