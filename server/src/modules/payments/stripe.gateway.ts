import Stripe from 'stripe';
import {
  WebhookSignatureError,
  type CreatePaymentInput,
  type CreatedPayment,
  type GatewayEvent,
  type GatewayEventType,
  type PaymentDetails,
  type PaymentGateway,
} from './gateway.js';

// Pin the API version the code was written against, so a Dashboard default change cannot alter
// response shapes underneath us. Upgrade it deliberately with the SDK.
export const STRIPE_API_VERSION = '2026-09-30.endive';

const EVENT_TYPES: Record<string, GatewayEventType> = {
  'payment_intent.succeeded': 'payment.succeeded',
  'payment_intent.payment_failed': 'payment.failed',
  'payment_intent.canceled': 'payment.canceled',
};

export interface StripeGatewayOptions {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

export class StripeGateway implements PaymentGateway {
  readonly publishableKey: string;
  private readonly client: Stripe;
  private readonly webhookSecret: string;

  constructor(options: StripeGatewayOptions) {
    // One client instance for the process; no global or module-level API key.
    this.client = new Stripe(options.secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 });
    this.publishableKey = options.publishableKey;
    this.webhookSecret = options.webhookSecret;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    // payment_method_types is deliberately omitted: dynamic payment methods are managed in the
    // Stripe Dashboard. The amount always comes from the server's quote, never from the browser.
    const intent = await this.client.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency,
        metadata: { orderRef: input.orderRef },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!intent.client_secret) throw new Error('Payment could not be started.');
    return { gatewayRef: intent.id, clientSecret: intent.client_secret, status: intent.status };
  }

  async retrievePayment(gatewayRef: string): Promise<PaymentDetails> {
    const intent = await this.client.paymentIntents.retrieve(gatewayRef, { expand: ['payment_method'] });
    const method = typeof intent.payment_method === 'object' ? intent.payment_method : null;
    // Only the brand and last four digits are kept on the order (S2-16).
    return {
      gatewayRef: intent.id,
      status: intent.status,
      amountCents: intent.amount,
      cardBrand: method?.card?.brand,
      last4: method?.card?.last4,
    };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): GatewayEvent {
    if (!signature) throw new WebhookSignatureError('Missing signature');
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new WebhookSignatureError('Invalid signature');
    }
    const object = event.data.object as { object?: string; id?: string; metadata?: Record<string, string> };
    const isIntent = object.object === 'payment_intent';
    return {
      id: event.id,
      type: EVENT_TYPES[event.type] ?? 'other',
      providerType: event.type,
      gatewayRef: isIntent ? object.id : undefined,
      orderRef: isIntent ? object.metadata?.orderRef : undefined,
    };
  }
}
