import { Router } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getPrisma } from '../../db.js';
import { getStoreSettings, loadCatalogForQuote, toRates } from '../catalog/catalog.repository.js';
import { calculateQuote } from '../cart/pricing.js';
import { quoteRequestSchema } from '../cart/quote.schema.js';

export const ordersRouter = Router();

const orderLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many order attempts. Please wait before trying again.' },
});

ordersRouter.post('/orders', orderLimiter, async (req, res, next) => {
  try {
    const parsed = quoteRequestSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.lines.length === 0) {
      return res.status(400).json({ error: 'A valid, non-empty order is required.' });
    }
    const prisma = getPrisma();
    const store = await getStoreSettings(prisma);
    if (!store) return res.status(503).json({ error: 'The store is not configured yet.' });
    const catalog = await loadCatalogForQuote(prisma, parsed.data.lines.map((line) => line.menuItemId));
    const quote = calculateQuote(parsed.data, catalog, toRates(store));
    if (quote.hasErrors) return res.status(409).json({ error: 'One or more items are no longer available. Return to your cart and review the order.' });

    const orderNumber = `PZ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const publicReference = randomBytes(32).toString('base64url');
    const lines = quote.lines.map((line, index) => {
      const requestLine = parsed.data.lines[index];
      return {
        name: line.name ?? 'Menu item',
        options: JSON.stringify({
          size: line.sizeLabel,
          crust: line.crustName,
          toppings: line.toppings,
        }),
        instructions: requestLine.instructions ?? '',
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        extendedPriceCents: line.extendedPriceCents,
      };
    });
    const order = await prisma.order.create({
      data: {
        orderNumber,
        publicReference,
        fulfillment: parsed.data.fulfillment,
        subtotalCents: quote.subtotalCents,
        discountCents: quote.discountCents,
        taxCents: quote.taxCents,
        deliveryFeeCents: quote.deliveryFeeCents,
        tipCents: quote.tipCents,
        totalCents: quote.totalCents,
        paymentStatus: 'NOT_PROCESSED',
        lines: { create: lines },
      },
      include: { lines: true },
    });
    res.status(201).json({
      orderNumber: order.orderNumber,
      publicReference: order.publicReference,
      createdAt: order.createdAt,
      status: order.status,
      fulfillment: order.fulfillment,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      taxCents: order.taxCents,
      deliveryFeeCents: order.deliveryFeeCents,
      tipCents: order.tipCents,
      totalCents: order.totalCents,
      paymentStatus: order.paymentStatus,
      lines: order.lines,
    });
  } catch (err) {
    next(err);
  }
});

const referenceSchema = z.string().regex(/^[A-Za-z0-9_-]{40,60}$/);

ordersRouter.get('/orders/status/:reference', async (req, res, next) => {
  try {
    const parsed = referenceSchema.safeParse(req.params.reference);
    if (!parsed.success) return res.status(404).json({ error: 'Order not found.' });
    const order = await getPrisma().order.findUnique({
      where: { publicReference: parsed.data },
      include: { lines: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
      fulfillment: order.fulfillment,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      taxCents: order.taxCents,
      deliveryFeeCents: order.deliveryFeeCents,
      tipCents: order.tipCents,
      totalCents: order.totalCents,
      paymentStatus: order.paymentStatus,
      lines: order.lines,
    });
  } catch (err) {
    next(err);
  }
});


// Staff status updates use the same temporary manager token until the planned staff-session
// authentication module is implemented. The customer-facing status route remains read-only.
const statusUpdateSchema = z.object({
  status: z.enum(['RECEIVED', 'IN_PROGRESS', 'READY', 'COMPLETED']),
}).strict();

ordersRouter.patch('/orders/:orderNumber/status', async (req, res, next) => {
  try {
    const expected = process.env.MANAGER_SETTINGS_TOKEN;
    const authorization = req.header('authorization') ?? '';
    const candidate = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!expected || !candidate) return res.status(401).json({ error: 'Staff authorization is required.' });
    const a = Buffer.from(expected);
    const b = Buffer.from(candidate);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Staff authorization is required.' });
    }
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'A valid order status is required.' });
    const prisma = getPrisma();
    const existing = await prisma.order.findUnique({ where: { orderNumber: req.params.orderNumber } });
    if (!existing) return res.status(404).json({ error: 'Order not found.' });
    const order = await prisma.order.update({
      where: { orderNumber: req.params.orderNumber },
      data: { status: parsed.data.status },
    });
    res.json({ orderNumber: order.orderNumber, status: order.status });
  } catch (err) {
    next(err);
  }
});
