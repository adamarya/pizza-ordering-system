import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPrisma } from '../../db.js';
import { getPaymentGateway, onGatewayEvent } from '../payments/payments.service.js';
import { idempotencyKeySchema, placeOrderSchema } from './orders.schema.js';
import { applyPaymentFailed, applyPaymentSucceeded, PaymentStartError, placeOrder } from './orders.service.js';

// POST /api/orders (Table 25, S2-14). Public, rate limited, and requires an Idempotency-Key header.
// Returns only the public order reference, the order number, the total, and a client secret valid
// for this one payment. The browser then confirms the payment with Stripe's hosted card fields (S2-13).
export const ordersRouter = Router();

const orderLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many order attempts. Please wait a moment and try again.' },
});

ordersRouter.post('/orders', orderLimiter, async (req, res, next) => {
  try {
    const key = idempotencyKeySchema.safeParse(req.get('Idempotency-Key'));
    if (!key.success) return res.status(400).json({ error: 'The order could not be submitted. Please refresh and try again.' });

    const parsed = placeOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Please check the highlighted details.',
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    // Checked before anything is written, so no order is created that cannot be paid for.
    const gateway = getPaymentGateway();
    if (!gateway) return res.status(503).json({ error: 'Online payment is not available right now. Your cart is saved.' });

    const result = await placeOrder(getPrisma(), gateway, parsed.data, key.data);
    switch (result.kind) {
      case 'store-not-ready':
        return res.status(503).json({ error: 'The menu is not set up yet.' });
      case 'quote-changed':
        return res.status(409).json({
          error: 'Your order total changed. Please review the updated order before paying.',
          quote: result.quote,
        });
      default:
        res.set('Cache-Control', 'no-store');
        return res.status(result.kind === 'created' ? 201 : 200).json({
          orderRef: result.orderRef,
          orderNumber: result.orderNumber,
          totalCents: result.totalCents,
          clientSecret: result.clientSecret,
        });
    }
  } catch (err) {
    if (err instanceof PaymentStartError) {
      return res.status(502).json({ error: 'Payment could not be started. Please try again in a moment.' });
    }
    next(err);
  }
});

// Verified Stripe events drive the order lifecycle (Figure 8). The webhook route itself, with its
// signature check, lives in the payments module.
onGatewayEvent('payment.succeeded', async (event) => {
  const gateway = getPaymentGateway();
  if (gateway) await applyPaymentSucceeded(getPrisma(), gateway, event);
});
onGatewayEvent('payment.failed', (event) => applyPaymentFailed(getPrisma(), event));
onGatewayEvent('payment.canceled', (event) => applyPaymentFailed(getPrisma(), event));
