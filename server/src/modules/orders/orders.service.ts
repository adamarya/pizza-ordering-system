import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { getStoreSettings, loadCatalogForQuote, toRates } from '../catalog/catalog.repository.js';
import { calculateQuote, type Quote } from '../cart/pricing.js';
import type { GatewayEvent, PaymentGateway } from '../payments/gateway.js';
import type { OrderInput } from './orders.schema.js';

// OrderService (Figures 6 to 9, S2-14, S2-15, S2-16). Depends on the PaymentGateway interface, not
// on Stripe, so the tests run against a fake gateway.

export type PlaceOrderResult =
  | { kind: 'created' | 'existing'; orderRef: string; orderNumber: number; totalCents: number; clientSecret: string }
  | { kind: 'store-not-ready' }
  | { kind: 'quote-changed'; quote: Quote };

export class PaymentStartError extends Error {}

const newPublicRef = () => randomBytes(16).toString('base64url'); // 128 bits, URL-safe

export async function placeOrder(
  prisma: PrismaClient,
  gateway: PaymentGateway,
  input: OrderInput,
  idempotencyKey: string,
): Promise<PlaceOrderResult> {
  // A repeated submission with the same key returns the order already written (S2-15).
  const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing) return startPayment(prisma, gateway, existing, 'existing');

  const store = await getStoreSettings(prisma);
  if (!store) return { kind: 'store-not-ready' };
  const catalog = await loadCatalogForQuote(prisma, input.lines.map((l) => l.menuItemId));
  const quote = calculateQuote(input, catalog, toRates(store));
  // A changed price, an item that became unavailable, or a tampered total: the customer confirms again.
  if (quote.hasErrors || quote.totalCents !== input.confirmedTotalCents) return { kind: 'quote-changed', quote };

  let order;
  try {
    order = await prisma.order.create({
      data: {
        publicRef: newPublicRef(),
        idempotencyKey,
        status: 'PENDING_PAYMENT',
        fulfillment: input.fulfillment,
        requestedTime: input.requestedTime ? new Date(input.requestedTime) : null,
        customerName: input.contact.name,
        customerPhone: input.contact.phone,
        customerEmail: input.contact.email,
        deliveryAddress: input.fulfillment === 'DELIVERY' ? input.deliveryAddress : null,
        subtotalCents: quote.subtotalCents,
        discountCents: quote.discountCents,
        taxCents: quote.taxCents,
        deliveryFeeCents: quote.deliveryFeeCents,
        tipCents: quote.tipCents,
        totalCents: quote.totalCents,
        taxRateBps: quote.taxRateBps,
        lines: {
          create: quote.lines.map((line) => ({
            position: line.index,
            menuItemId: line.menuItemId,
            itemName: line.name ?? '',
            sizeLabel: line.sizeLabel ?? '',
            crustName: line.crustName,
            quantity: line.quantity,
            instructions: line.instructions,
            unitPriceCents: line.unitPriceCents,
            extendedPriceCents: line.extendedPriceCents,
            toppings: { create: line.toppings.map((t) => ({ name: t.name, placement: t.placement, priceCents: t.priceCents })) },
          })),
        },
        statusEvents: { create: { fromStatus: null, toStatus: 'PENDING_PAYMENT', actor: 'customer' } },
      },
    });
  } catch (err) {
    // Two identical submissions at the same moment: the unique key lets only one through.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (winner) return startPayment(prisma, gateway, winner, 'existing');
    }
    throw err;
  }

  return startPayment(prisma, gateway, order, 'created');
}

// Creates the PaymentIntent with the order's own idempotency key. Stripe returns the same intent for
// the same key, which is its documented protection against duplicate charges (Stripe, n.d.), so a
// retry or a double click can never charge twice. The gateway reference is recorded the first time;
// the card brand and last four digits arrive with the confirming webhook (S2-16).
async function startPayment(
  prisma: PrismaClient,
  gateway: PaymentGateway,
  order: { id: string; publicRef: string; orderNumber: number; totalCents: number; idempotencyKey: string },
  kind: 'created' | 'existing',
): Promise<PlaceOrderResult> {
  let payment;
  try {
    payment = await gateway.createPayment({
      amountCents: order.totalCents,
      currency: 'usd',
      orderRef: order.publicRef,
      idempotencyKey: order.idempotencyKey,
    });
  } catch {
    throw new PaymentStartError('Payment could not be started.');
  }
  await prisma.payment.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, gatewayRef: payment.gatewayRef, status: payment.status, amountCents: order.totalCents },
    update: {},
  });
  return {
    kind,
    orderRef: order.publicRef,
    orderNumber: order.orderNumber,
    totalCents: order.totalCents,
    clientSecret: payment.clientSecret,
  };
}

// Webhook handlers (Figure 8). The order becomes RECEIVED only from a verified Stripe event, never
// because the browser says the payment worked. The status change, the Payment record, and the
// OrderStatusEvent are written in one transaction, and the unique gatewayEventId makes a replayed
// event a no-op.
export async function applyPaymentSucceeded(prisma: PrismaClient, gateway: PaymentGateway, event: GatewayEvent) {
  if (!event.gatewayRef) return;
  const payment = await prisma.payment.findUnique({ where: { gatewayRef: event.gatewayRef }, include: { order: true } });
  if (!payment) {
    console.warn(`Payment webhook ${event.id}: no order for this payment.`);
    return;
  }
  if (payment.gatewayEventId === event.id || payment.status === 'succeeded') return;

  // Ask the gateway for the payment itself rather than trusting the event body, and check that
  // the amount charged is the amount the order was priced at.
  const details = await gateway.retrievePayment(event.gatewayRef);
  if (details.status !== 'succeeded' || details.amountCents !== payment.order.totalCents) {
    console.error(`Payment webhook ${event.id}: payment does not match order ${payment.order.orderNumber}; not accepted.`);
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'succeeded',
          gatewayEventId: event.id,
          cardBrand: details.cardBrand ?? null,
          last4: details.last4 ?? null,
        },
      });
      const moved = await tx.order.updateMany({
        where: { id: payment.orderId, status: { in: ['PENDING_PAYMENT', 'PAYMENT_FAILED'] } },
        data: { status: 'RECEIVED' },
      });
      if (moved.count === 1) {
        await tx.orderStatusEvent.create({
          data: { orderId: payment.orderId, fromStatus: payment.order.status, toStatus: 'RECEIVED', actor: 'payment-gateway' },
        });
      }
    });
  } catch (err) {
    // Another delivery of the same event won the race; it has already been applied.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
}

export async function applyPaymentFailed(prisma: PrismaClient, event: GatewayEvent) {
  if (!event.gatewayRef) return;
  const payment = await prisma.payment.findUnique({ where: { gatewayRef: event.gatewayRef }, include: { order: true } });
  if (!payment || payment.status === 'succeeded') return;
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { status: event.type === 'payment.canceled' ? 'canceled' : 'failed' } });
    const moved = await tx.order.updateMany({
      where: { id: payment.orderId, status: 'PENDING_PAYMENT' },
      data: { status: 'PAYMENT_FAILED' },
    });
    if (moved.count === 1) {
      await tx.orderStatusEvent.create({
        data: { orderId: payment.orderId, fromStatus: 'PENDING_PAYMENT', toStatus: 'PAYMENT_FAILED', actor: 'payment-gateway' },
      });
    }
  });
}
