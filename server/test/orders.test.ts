import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { createApp } from '../src/app.js';
import { disconnect, getPrisma } from '../src/db.js';
import { seedDemoData } from '../src/seed/demoData.js';
import { handleGatewayEvent, setPaymentGateway } from '../src/modules/payments/payments.service.js';
import type {
  CreatePaymentInput,
  CreatedPayment,
  GatewayEvent,
  PaymentDetails,
  PaymentGateway,
} from '../src/modules/payments/gateway.js';

// S2-14, S2-15, S2-16 against a real PostgreSQL database and a fake payment gateway (Figure 6:
// OrderService depends on the PaymentGateway interface, not on Stripe). Resets the demo data.

let intentCounter = 0; // unique across tests, like real PaymentIntent ids

class FakeGateway implements PaymentGateway {
  readonly publishableKey = 'pk_test_unit';
  calls: CreatePaymentInput[] = [];
  intents = new Map<string, { id: string; amount: number; status: string }>();
  failNext = false;
  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('gateway down');
    }
    this.calls.push(input);
    // Like Stripe: the same idempotency key returns the same PaymentIntent.
    let intent = this.intents.get(input.idempotencyKey);
    if (!intent) {
      intent = { id: `pi_unit_${++intentCounter}`, amount: input.amountCents, status: 'requires_payment_method' };
      this.intents.set(input.idempotencyKey, intent);
    }
    return { gatewayRef: intent.id, clientSecret: `${intent.id}_secret_unit`, status: intent.status };
  }
  async retrievePayment(gatewayRef: string): Promise<PaymentDetails> {
    const intent = [...this.intents.values()].find((i) => i.id === gatewayRef)!;
    return { gatewayRef, status: intent.status, amountCents: intent.amount, cardBrand: 'visa', last4: '4242' };
  }
  parseWebhook(): GatewayEvent {
    throw new Error('not used in these tests');
  }
  pay(gatewayRef: string, amount?: number) {
    const intent = [...this.intents.values()].find((i) => i.id === gatewayRef)!;
    intent.status = 'succeeded';
    if (amount !== undefined) intent.amount = amount;
  }
}

const app = createApp();
const prisma = getPrisma();
let gateway: FakeGateway;
type MenuItem = { id: string; name: string; sizes: { id: string }[]; crusts: { id: string; name: string }[]; toppings: { id: string; name: string }[] };
let items: MenuItem[] = [];
const find = (name: string) => items.find((i) => i.name === name)!;
let keyCounter = 0;
const newKey = () => `test-key-${Date.now()}-${++keyCounter}-abcdef`;

function order(overrides: Record<string, unknown> = {}) {
  const pizza = find('Pepperoni Party');
  return {
    fulfillment: 'PICKUP',
    lines: [
      {
        menuItemId: pizza.id,
        sizeId: pizza.sizes[1].id, // Medium 1400
        crustId: pizza.crusts.find((c) => c.name === 'Stuffed Crust')!.id, // +250
        toppings: [{ toppingId: pizza.toppings.find((t) => t.name === 'Pepperoni')!.id, placement: 'RIGHT' }], // +63
        quantity: 2,
        instructions: 'Well done, please',
      },
    ],
    confirmedTotalCents: 3426 + 283, // 2 x 1713, tax 282.65 -> 283
    contact: { name: 'Test Customer', phone: '505-555-0100', email: 'customer@example.com' },
    ...overrides,
  };
}
const post = (body: object, key: string | null = newKey()) => {
  const r = request(app).post('/api/orders');
  if (key) r.set('Idempotency-Key', key);
  return r.send(body);
};
const event = (type: GatewayEvent['type'], gatewayRef: string, id = `evt_${gatewayRef}_${type}`): GatewayEvent => ({
  id,
  type,
  providerType: type,
  gatewayRef,
});

beforeAll(async () => {
  await prisma.order.deleteMany();
  await seedDemoData(prisma);
  const res = await request(app).get('/api/menu');
  items = res.body.categories.flatMap((c: { items: MenuItem[] }) => c.items);
});
beforeEach(() => {
  gateway = new FakeGateway();
  setPaymentGateway(gateway);
});
afterAll(async () => {
  setPaymentGateway(undefined);
  await prisma.order.deleteMany();
  await disconnect();
});

describe('POST /api/orders (S2-14)', () => {
  it('prices the order on the server, writes it as pending payment, and starts one payment', async () => {
    const key = newKey();
    const res = await post(order(), key);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      orderRef: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      orderNumber: expect.any(Number),
      totalCents: 3709,
      clientSecret: expect.stringMatching(/^pi_unit_\d+_secret_unit$/),
    });
    const intentId = gateway.intents.get(key)!.id;
    expect(res.body.clientSecret).toBe(`${intentId}_secret_unit`);
    expect(gateway.calls).toEqual([{ amountCents: 3709, currency: 'usd', orderRef: res.body.orderRef, idempotencyKey: key }]);

    const saved = await prisma.order.findUniqueOrThrow({
      where: { publicRef: res.body.orderRef },
      include: { lines: { include: { toppings: true } }, payment: true, statusEvents: true },
    });
    expect(saved).toMatchObject({ status: 'PENDING_PAYMENT', subtotalCents: 3426, taxCents: 283, totalCents: 3709, taxRateBps: 825 });
    expect(saved.lines[0]).toMatchObject({
      itemName: 'Pepperoni Party',
      sizeLabel: 'Medium',
      crustName: 'Stuffed Crust',
      quantity: 2,
      instructions: 'Well done, please',
      unitPriceCents: 1713,
      extendedPriceCents: 3426,
    });
    expect(saved.lines[0].toppings).toMatchObject([{ name: 'Pepperoni', placement: 'RIGHT', priceCents: 63 }]);
    expect(saved.payment).toMatchObject({ gatewayRef: intentId, amountCents: 3709, cardBrand: null, last4: null });
    expect(saved.statusEvents.map((e) => e.toStatus)).toEqual(['PENDING_PAYMENT']);
  });

  it('returns the same order and the same payment for a repeated key, so a double click cannot charge twice (S2-15)', async () => {
    const key = newKey();
    const first = await post(order(), key);
    const again = await post(order(), key);
    expect(again.status).toBe(200);
    expect(again.body.orderRef).toBe(first.body.orderRef);
    expect(again.body.clientSecret).toBe(first.body.clientSecret);
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
    expect(new Set(gateway.calls.map((c) => c.idempotencyKey))).toEqual(new Set([key]));
  });

  it('refuses with 409 and the new quote when the confirmed total does not match the server price', async () => {
    const before = await prisma.order.count();
    const res = await post(order({ confirmedTotalCents: 100 }));
    expect(res.status).toBe(409);
    expect(res.body.quote.totalCents).toBe(3709);
    expect(await prisma.order.count()).toBe(before);
    expect(gateway.calls).toHaveLength(0);
  });

  it('ignores any price the browser tries to send', async () => {
    const res = await post({ ...order(), unitPriceCents: 1 });
    expect(res.status).toBe(400); // unknown fields are rejected outright
  });

  it('requires an Idempotency-Key header and valid contact details', async () => {
    expect((await post(order(), null)).status).toBe(400);
    const bad = await post(order({ contact: { name: '', phone: 'abc', email: 'not-an-email' } }));
    expect(bad.status).toBe(400);
    expect(bad.body.fields.map((f: { path: string }) => f.path).sort()).toEqual(['contact.email', 'contact.name', 'contact.phone']);
    const noAddress = await post(order({ fulfillment: 'DELIVERY', confirmedTotalCents: 3709 + 399 }));
    expect(noAddress.status).toBe(400);
    expect(noAddress.body.fields[0].path).toBe('deliveryAddress');
  });

  it('writes no order when online payment is not configured', async () => {
    setPaymentGateway(null);
    const before = await prisma.order.count();
    const res = await post(order());
    expect(res.status).toBe(503);
    expect(await prisma.order.count()).toBe(before);
  });

  it('lets the customer retry with the same key when the gateway fails to start the payment', async () => {
    const key = newKey();
    gateway.failNext = true;
    const failed = await post(order(), key);
    expect(failed.status).toBe(502);
    const retry = await post(order(), key);
    expect(retry.status).toBe(200);
    const saved = await prisma.order.findUniqueOrThrow({ where: { idempotencyKey: key }, include: { payment: true } });
    expect(saved.payment?.gatewayRef).toBe(gateway.intents.get(key)!.id);
  });
});

describe('payment webhooks drive the order lifecycle (Figure 8)', () => {
  async function placed() {
    const res = await post(order());
    const saved = await prisma.order.findUniqueOrThrow({ where: { publicRef: res.body.orderRef }, include: { payment: true } });
    return saved.payment!.gatewayRef;
  }
  const load = (gatewayRef: string) =>
    prisma.payment.findUniqueOrThrow({ where: { gatewayRef }, include: { order: { include: { statusEvents: true } } } });

  it('marks the order received only on a confirmed payment, keeping just the brand and last four (S2-16)', async () => {
    const ref = await placed();
    gateway.pay(ref);
    await handleGatewayEvent(event('payment.succeeded', ref));
    const payment = await load(ref);
    expect(payment).toMatchObject({ status: 'succeeded', cardBrand: 'visa', last4: '4242', gatewayEventId: `evt_${ref}_payment.succeeded` });
    expect(payment.order.status).toBe('RECEIVED');
    expect(payment.order.statusEvents.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
      [null, 'PENDING_PAYMENT', 'customer'],
      ['PENDING_PAYMENT', 'RECEIVED', 'payment-gateway'],
    ]);
  });

  it('applies a replayed event only once', async () => {
    const ref = await placed();
    gateway.pay(ref);
    await handleGatewayEvent(event('payment.succeeded', ref));
    await handleGatewayEvent(event('payment.succeeded', ref));
    expect((await load(ref)).order.statusEvents).toHaveLength(2);
  });

  it('does not accept a payment whose amount differs from the order total', async () => {
    const ref = await placed();
    gateway.pay(ref, 50);
    await handleGatewayEvent(event('payment.succeeded', ref));
    const payment = await load(ref);
    expect(payment.order.status).toBe('PENDING_PAYMENT');
    expect(payment.status).not.toBe('succeeded');
  });

  it('marks a declined payment as failed, and still accepts a later successful retry', async () => {
    const ref = await placed();
    await handleGatewayEvent(event('payment.failed', ref));
    expect((await load(ref)).order.status).toBe('PAYMENT_FAILED');
    gateway.pay(ref);
    await handleGatewayEvent(event('payment.succeeded', ref));
    expect((await load(ref)).order.status).toBe('RECEIVED');
  });

  it('keeps no column that could hold a card number, expiry, or security code (PB-13)', () => {
    const fields = Prisma.dmmf.datamodel.models.flatMap((m) => m.fields.map((f) => `${m.name}.${f.name}`.toLowerCase()));
    expect(fields.filter((f) => /cardnumber|\bpan\b|expiry|expmonth|cvc|cvv|securitycode/.test(f))).toEqual([]);
  });
});
