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
  toppings: { name: string; placement: Placement }[];
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


export interface StoreProfile {
  name: string;
  description: string;
  streetAddress: string;
  phone: string;
  email: string;
  openingHours: Record<string, string>;
}

export interface OrderLineSnapshot {
  id: string;
  name: string;
  options: string;
  instructions: string;
  quantity: number;
  unitPriceCents: number;
  extendedPriceCents: number;
}

export type OrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED';
export interface OrderRecord {
  orderNumber: string;
  publicReference?: string;
  createdAt: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  paymentStatus: 'NOT_PROCESSED' | 'PAID' | 'FAILED';
  lines: OrderLineSnapshot[];
}

export const fetchStoreProfile = () => getJson<StoreProfile>('/api/store');
export const saveStoreProfile = (profile: StoreProfile, managerToken: string) =>
  getJson<StoreProfile>('/api/store/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify(profile),
  });
export const createOrder = (body: QuoteRequest) =>
  getJson<OrderRecord>('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
export const fetchOrderStatus = (reference: string) =>
  getJson<OrderRecord>(`/api/orders/status/${encodeURIComponent(reference)}`);
