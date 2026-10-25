// Typed calls to the API. Shapes match the server contracts in Table 22 of the Project Document.

export type Placement = 'WHOLE' | 'LEFT' | 'RIGHT';
export type Fulfillment = 'PICKUP' | 'DELIVERY';
export type Tip = { type: 'PERCENT'; percent: number } | { type: 'AMOUNT'; cents: number };

export interface Option { id: string; name: string; isAvailable: boolean }
export interface Crust extends Option { surchargeCents: number }
export interface Topping extends Option { priceCents: number }
export interface Size { id: string; label: string; priceCents: number }

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  isPizza: boolean;
  isAvailable: boolean;
  sizes: Size[];
  crusts: Crust[];
  toppings: Topping[];
}

export interface Menu {
  store: { name: string; taxRateBps: number; deliveryFeeCents: number; deliveryFeeTaxable: boolean };
  menuVersion: number;
  categories: { id: string; name: string; items: MenuItem[] }[];
}

export interface QuoteLineRequest {
  menuItemId: string;
  sizeId: string;
  crustId?: string;
  toppings?: { toppingId: string; placement: Placement }[];
  quantity: number;
  instructions?: string;
}

export interface QuoteRequest { fulfillment: Fulfillment; tip?: Tip; lines: QuoteLineRequest[] }

export interface QuoteLine {
  index: number;
  name: string | null;
  sizeLabel: string | null;
  crustName: string | null;
  toppings: { name: string; placement: Placement; priceCents: number }[];
  quantity: number;
  instructions: string;
  unitPriceCents: number;
  extendedPriceCents: number;
  error: { code: string; message: string } | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  taxRateBps: number;
  deliveryFeeTaxable: boolean;
  hasErrors: boolean;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Something went wrong. Please try again.');
  }
  return res.json() as Promise<T>;
}

export const fetchMenu = () => getJson<Menu>('/api/menu');
export const fetchMenuItem = (id: string) => getJson<MenuItem>(`/api/menu/items/${encodeURIComponent(id)}`);
export const fetchQuote = (body: QuoteRequest, signal?: AbortSignal) =>
  getJson<Quote>('/api/cart/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

// Checkout (S2-07 to S2-10, POST /api/checkout/validate). The server reprices the cart; the review
// screen shows the returned quote and never computes money itself.
export interface CheckoutCustomer { firstName: string; lastName: string; email: string; phone: string }
export interface CheckoutAddress { street: string; city: string; state: string; zipCode: string; unitOrApt?: string }
export interface CheckoutValidateRequest extends QuoteRequest {
  requestedTime?: string;
  customer: CheckoutCustomer;
  deliveryAddress?: CheckoutAddress;
}
export interface CheckoutReview {
  fulfillment: Fulfillment;
  requestedTime: string | null;
  customer: CheckoutCustomer;
  deliveryAddress: CheckoutAddress | null;
  quote: Quote;
}
export type CheckoutValidateResult =
  | { ok: true; review: CheckoutReview }
  | { ok: false; errors: Record<string, string>; message: string };

export async function validateCheckout(body: CheckoutValidateRequest): Promise<CheckoutValidateResult> {
  const res = await fetch('/api/checkout/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, review: json.review };
  return { ok: false, errors: json.errors ?? {}, message: json.error ?? 'Something went wrong. Please try again.' };
}

// Order placement (S2-14, POST /api/orders). The body is the same checkout request the review screen
// validated, plus the total the customer confirmed. The Idempotency-Key is made once per review, so
// pressing the button twice or retrying after a dropped connection returns the same order.
export interface PlaceOrderRequest extends CheckoutValidateRequest {
  confirmedTotalCents: number;
}
export interface PlacedOrder { orderRef: string; orderNumber: number; totalCents: number; clientSecret: string }
export type PlaceOrderResult =
  | ({ kind: 'placed' } & PlacedOrder)
  | { kind: 'quote-changed'; message: string; quote: Quote }
  | { kind: 'invalid'; message: string; errors: Record<string, string> }
  | { kind: 'unavailable'; message: string };

export async function placeOrder(body: PlaceOrderRequest, idempotencyKey: string): Promise<PlaceOrderResult> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const message: string = json.error ?? 'Something went wrong. Please try again.';
  if (res.ok) return { kind: 'placed', ...(json as PlacedOrder) };
  if (res.status === 409 && json.quote) return { kind: 'quote-changed', message, quote: json.quote };
  if (res.status === 400) return { kind: 'invalid', message, errors: json.errors ?? {} };
  return { kind: 'unavailable', message };
}

/** A new key for one checkout attempt (letters, digits, and dashes, as the server requires). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

// Payments (S2-12, S2-13). The publishable key is public by design; the server never sends the secret key.
export const fetchPaymentConfig = () => getJson<{ publishableKey: string }>('/api/payments/config');
