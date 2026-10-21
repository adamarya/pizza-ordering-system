import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import { createApp } from '../src/app.js';
import { disconnect } from '../src/db.js';
import { StripeGateway } from '../src/modules/payments/stripe.gateway.js';
import { onGatewayEvent, setPaymentGateway } from '../src/modules/payments/payments.service.js';
import type { GatewayEvent } from '../src/modules/payments/gateway.js';

// Placeholder values only: signature checks are local, so no request reaches Stripe.
const WEBHOOK_SECRET = 'whsec_unittest';
const gateway = () =>
  new StripeGateway({ secretKey: 'rk_test_unit', publishableKey: 'pk_test_unit', webhookSecret: WEBHOOK_SECRET });
const signer = new Stripe('rk_test_unit').webhooks;

function stripeEvent(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id: 'evt_unit_1', object: 'event', type, data: { object }, api_version: '2026-09-30.endive' });
}
const sign = (payload: string, secret = WEBHOOK_SECRET) => signer.generateTestHeaderString({ payload, secret });

describe('payments (S2-12)', () => {
  afterEach(() => setPaymentGateway(undefined));
  afterAll(() => disconnect());

  it('reports that online payment is unavailable when no keys are configured', async () => {
    setPaymentGateway(null);
    const res = await request(createApp()).get('/api/payments/config');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not available/);
  });

  it('serves only the publishable key to the browser', async () => {
    setPaymentGateway(gateway());
    const res = await request(createApp()).get('/api/payments/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ publishableKey: 'pk_test_unit' });
    expect(JSON.stringify(res.body)).not.toMatch(/rk_test|sk_test|whsec/);
  });

  it('accepts a correctly signed payment event and passes it to the order handler', async () => {
    setPaymentGateway(gateway());
    const received: GatewayEvent[] = [];
    onGatewayEvent('payment.succeeded', async (e) => {
      received.push(e);
    });
    const payload = stripeEvent('payment_intent.succeeded', {
      object: 'payment_intent',
      id: 'pi_unit_1',
      metadata: { orderRef: 'ord_ref_1' },
    });
    const res = await request(createApp())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
    expect(received).toEqual([
      {
        id: 'evt_unit_1',
        type: 'payment.succeeded',
        providerType: 'payment_intent.succeeded',
        gatewayRef: 'pi_unit_1',
        orderRef: 'ord_ref_1',
      },
    ]);
  });

  it('rejects an event signed with the wrong secret, or with no signature', async () => {
    setPaymentGateway(gateway());
    const payload = stripeEvent('payment_intent.succeeded', { object: 'payment_intent', id: 'pi_unit_2' });
    const forged = await request(createApp())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sign(payload, 'whsec_wrong'))
      .send(payload);
    expect(forged.status).toBe(400);
    const unsigned = await request(createApp())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(unsigned.status).toBe(400);
  });

  it('rejects a signed body that was altered after signing', async () => {
    setPaymentGateway(gateway());
    const payload = stripeEvent('payment_intent.succeeded', { object: 'payment_intent', id: 'pi_unit_3' });
    const res = await request(createApp())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sign(payload))
      .send(payload.replace('pi_unit_3', 'pi_unit_9'));
    expect(res.status).toBe(400);
  });

  it('acknowledges event types it does not handle, and asks for a retry when a handler fails', async () => {
    setPaymentGateway(gateway());
    const other = stripeEvent('customer.created', { object: 'customer', id: 'cus_unit' });
    const ack = await request(createApp())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sign(other))
      .send(other);
    expect(ack.status).toBe(200);

    onGatewayEvent('payment.failed', async () => {
      throw new Error('database unavailable');
    });
    const failed = stripeEvent('payment_intent.payment_failed', { object: 'payment_intent', id: 'pi_unit_4' });
    const retry = await request(createApp())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sign(failed))
      .send(failed);
    expect(retry.status).toBe(500);
    expect(JSON.stringify(retry.body)).not.toMatch(/database unavailable/);
  });

  it('allows the Stripe card fields in the content security policy and nothing broader', async () => {
    const res = await request(createApp()).get('/health');
    const csp = res.headers['content-security-policy'] as string;
    for (const directive of ['script-src', 'frame-src', 'connect-src']) {
      expect(csp).toMatch(new RegExp(`${directive} 'self' https://\\*\\.stripe\\.com`));
    }
    expect(csp).not.toMatch(/default-src \*/);
  });
});
