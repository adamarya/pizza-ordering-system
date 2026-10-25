import express, { Router, type RequestHandler } from 'express';
import { WebhookSignatureError } from './gateway.js';
import { getPaymentGateway, handleGatewayEvent } from './payments.service.js';

// GET /api/payments/config (S2-12). The browser needs the publishable key to load the hosted card
// fields. It is public by design; the secret key and webhook secret never leave the server.
export const paymentsRouter = Router();

paymentsRouter.get('/payments/config', (_req, res) => {
  const gateway = getPaymentGateway();
  if (!gateway) return res.status(503).json({ error: 'Online payment is not available right now.' });
  res.set('Cache-Control', 'no-store').json({ publishableKey: gateway.publishableKey });
});

// POST /api/payments/webhook. Mounted in app.ts ahead of the JSON body parser, because the
// signature is computed over the exact bytes Stripe sent. Every event is signature-checked before
// anything else happens; an unknown event type is acknowledged so Stripe stops retrying it, and a
// handler failure returns 500 so Stripe retries it later.
export const webhookRawBody = express.raw({ type: 'application/json', limit: '512kb' });

export const handleWebhook: RequestHandler = async (req, res, next) => {
  const gateway = getPaymentGateway();
  if (!gateway) return res.status(503).json({ error: 'Payments are not configured.' });
  let event;
  try {
    event = gateway.parseWebhook(req.body as Buffer, req.get('stripe-signature'));
  } catch (err) {
    if (err instanceof WebhookSignatureError) return res.status(400).json({ error: 'Invalid signature.' });
    return next(err);
  }
  try {
    const handled = await handleGatewayEvent(event);
    // Event id and type only: no customer details or payment data in the log (PB-13).
    console.log(`Payment webhook ${event.id} ${event.providerType}${handled ? '' : ' (no handler)'}`);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};
