import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { getPrisma } from '../../db.js';

// GET /api/orders/status/:reference (Table 25). The read side of the order for the customer's
// confirmation screen (S2-18) and status page (S2-20). The reference is the order's publicRef, 128
// random bits that only the customer receives, so the link itself is the access check. The response
// carries the order contents, totals, status, and payment state, and never the customer's name,
// phone, email, or address, because anyone holding the link can read it.
export const orderStatusRouter = Router();

const statusLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120, // the status page refreshes every 15 seconds
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

// publicRef is 16 random bytes in base64url: 22 characters.
const referenceSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export type CustomerPaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export async function getOrderForCustomer(prisma: PrismaClient, reference: string) {
  const order = await prisma.order.findUnique({
    where: { publicRef: reference },
    include: { lines: { orderBy: { position: 'asc' }, include: { toppings: true } }, payment: true },
  });
  if (!order) return null;
  const paymentStatus: CustomerPaymentStatus =
    order.payment?.status === 'succeeded' ? 'PAID' : order.status === 'PAYMENT_FAILED' ? 'FAILED' : 'PENDING';
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    requestedTime: order.requestedTime?.toISOString() ?? null,
    status: order.status,
    fulfillment: order.fulfillment,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    taxCents: order.taxCents,
    deliveryFeeCents: order.deliveryFeeCents,
    tipCents: order.tipCents,
    totalCents: order.totalCents,
    paymentStatus,
    card: paymentStatus === 'PAID' && order.payment?.last4 ? { brand: order.payment.cardBrand, last4: order.payment.last4 } : null,
    lines: order.lines.map((line) => ({
      position: line.position,
      name: line.itemName,
      size: line.sizeLabel,
      crust: line.crustName,
      toppings: line.toppings.map((t) => ({ name: t.name, placement: t.placement })),
      quantity: line.quantity,
      instructions: line.instructions,
      unitPriceCents: line.unitPriceCents,
      extendedPriceCents: line.extendedPriceCents,
    })),
  };
}

export type CustomerOrder = NonNullable<Awaited<ReturnType<typeof getOrderForCustomer>>>;

orderStatusRouter.get('/orders/status/:reference', statusLimiter, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const parsed = referenceSchema.safeParse(req.params.reference);
    // A malformed reference gets the same answer as an unknown one, so it reveals nothing.
    if (!parsed.success) return res.status(404).json({ error: 'We could not find that order. Please check the link.' });
    const order = await getOrderForCustomer(getPrisma(), parsed.data);
    if (!order) return res.status(404).json({ error: 'We could not find that order. Please check the link.' });
    return res.json(order);
  } catch (err) {
    next(err);
  }
});
