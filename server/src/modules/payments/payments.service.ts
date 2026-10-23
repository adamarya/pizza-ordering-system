import { config } from '../../config.js';
import type { GatewayEvent, PaymentGateway } from './gateway.js';
import { StripeGateway } from './stripe.gateway.js';

// Returns the configured gateway, or null when the Stripe keys are not set (local development
// without keys, CI). Tests replace it with setPaymentGateway.
let gateway: PaymentGateway | null | undefined;

export function getPaymentGateway(): PaymentGateway | null {
  if (gateway === undefined) {
    const { STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET } = config;
    gateway =
      STRIPE_SECRET_KEY && STRIPE_PUBLISHABLE_KEY && STRIPE_WEBHOOK_SECRET
        ? new StripeGateway({
            secretKey: STRIPE_SECRET_KEY,
            publishableKey: STRIPE_PUBLISHABLE_KEY,
            webhookSecret: STRIPE_WEBHOOK_SECRET,
          })
        : null;
  }
  return gateway;
}

export function setPaymentGateway(next: PaymentGateway | null | undefined) {
  gateway = next;
}

export type GatewayEventHandler = (event: GatewayEvent) => Promise<void>;

// Order placement registers its handlers here (S2-14): payment.succeeded writes the order as
// placed, payment.failed returns the customer to checkout. Fulfillment is driven by these
// verified events, not by the browser reaching the confirmation page, because a customer can pay
// and lose the connection before that page loads.
const handlers = new Map<GatewayEvent['type'], GatewayEventHandler>();

export function onGatewayEvent(type: GatewayEvent['type'], handler: GatewayEventHandler) {
  handlers.set(type, handler);
}

export async function handleGatewayEvent(event: GatewayEvent): Promise<boolean> {
  const handler = handlers.get(event.type);
  if (!handler) return false;
  await handler(event);
  return true;
}
