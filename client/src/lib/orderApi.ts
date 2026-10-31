// The customer's view of an order (S2-18, S2-20), from GET /api/orders/status/:reference (#17).
// The reference is the order's unguessable public reference; the response never carries the
// customer's name, phone, email, or address.

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'RECEIVED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CustomerOrderLine {
  position: number;
  name: string;
  size: string;
  crust: string | null;
  toppings: { name: string; placement: 'WHOLE' | 'LEFT' | 'RIGHT' }[];
  quantity: number;
  instructions: string;
  unitPriceCents: number;
  extendedPriceCents: number;
}

export interface CustomerOrder {
  orderNumber: number;
  createdAt: string;
  requestedTime: string | null;
  status: OrderStatus;
  fulfillment: 'PICKUP' | 'DELIVERY';
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  card: { brand: string | null; last4: string } | null;
  lines: CustomerOrderLine[];
}

export async function fetchOrderStatus(reference: string): Promise<CustomerOrder> {
  const res = await fetch(`/api/orders/status/${encodeURIComponent(reference)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'We could not load this order. Please try again.');
  return body as CustomerOrder;
}

const PLACEMENT = { WHOLE: '', LEFT: ' (left half)', RIGHT: ' (right half)' } as const;

/** "Medium, Thin crust, Pepperoni (left half), Mushrooms" for one order line. */
export function describeLine(line: CustomerOrderLine): string {
  return [line.size, line.crust ? `${line.crust} crust` : null, ...line.toppings.map((t) => `${t.name}${PLACEMENT[t.placement]}`)]
    .filter(Boolean)
    .join(', ');
}
