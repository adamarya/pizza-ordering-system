// PaymentGateway (Figure 6, S2-12). OrderService depends on this interface rather than on Stripe,
// so tests can run against a fake and the provider can change without touching order logic.
// Card numbers never pass through this server: the customer types them into the gateway's own
// hosted fields (S2-13), and only the references below come back (PB-13).

export interface CreatePaymentInput {
  /** Amount to authorize, in integer cents, from the server's own quote (Table 21). */
  amountCents: number;
  currency: 'usd';
  /** Public order reference, stored on the payment so the two can be matched. */
  orderRef: string;
  /** One key per payment attempt, so a retried submission cannot create a second charge (S2-15). */
  idempotencyKey: string;
}

export interface CreatedPayment {
  gatewayRef: string;
  /** Handed to the browser so the hosted fields can confirm this payment; not a stored secret. */
  clientSecret: string;
  status: string;
}

export interface PaymentDetails {
  gatewayRef: string;
  status: string;
  amountCents: number;
  cardBrand?: string;
  last4?: string;
}

export type GatewayEventType = 'payment.succeeded' | 'payment.failed' | 'payment.canceled' | 'other';

export interface GatewayEvent {
  /** Provider event id; stored with a unique constraint so a replayed event applies once. */
  id: string;
  type: GatewayEventType;
  providerType: string;
  gatewayRef?: string;
  orderRef?: string;
}

export class WebhookSignatureError extends Error {}

export interface PaymentGateway {
  readonly publishableKey: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  retrievePayment(gatewayRef: string): Promise<PaymentDetails>;
  /** Verifies the signature on the raw request body and returns the event, or throws WebhookSignatureError. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): GatewayEvent;
}
