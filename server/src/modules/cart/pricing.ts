// PricingService (S1-25, PB-05). The single place in the system where money is calculated.
// Implements the Pricing Rules in Table 21 of the Project Document:
//   - every amount is an integer number of cents; no floating-point money anywhere
//   - line unit price = size price + crust surcharge + toppings; a half topping costs half,
//     rounded half up to the cent
//   - tax = round half up of (subtotal - discount) x taxRateBps / 10,000; the delivery fee is
//     added to the taxable amount only when the store setting deliveryFeeTaxable is true
//   - delivery fee applies only to DELIVERY orders; tip is added after tax and never taxed
//   - discount is zero in Sprints 1 and 2 (promotions arrive with PB-14)
// The function is pure: it receives a catalog snapshot and returns a quote, so it is tested
// without a database. The route loads the snapshot and calls it.

export type Placement = 'WHOLE' | 'LEFT' | 'RIGHT';
export type Fulfillment = 'PICKUP' | 'DELIVERY';
export type Tip = { type: 'PERCENT'; percent: number } | { type: 'AMOUNT'; cents: number };

export interface QuoteLineInput {
  menuItemId: string;
  sizeId: string;
  crustId?: string;
  toppings?: { toppingId: string; placement: Placement }[];
  quantity: number;
  instructions?: string;
}

export interface QuoteInput {
  fulfillment: Fulfillment;
  tip?: Tip;
  lines: QuoteLineInput[];
}

export interface CatalogItem {
  id: string;
  name: string;
  isPizza: boolean;
  isAvailable: boolean;
  isRetired: boolean;
  sizes: { id: string; label: string; priceCents: number }[];
  crusts: { id: string; name: string; surchargeCents: number; isAvailable: boolean }[];
  toppings: { id: string; name: string; priceCents: number; isAvailable: boolean }[];
}

export interface StoreRates {
  taxRateBps: number;
  deliveryFeeCents: number;
  deliveryFeeTaxable: boolean;
}

export type LineErrorCode =
  | 'ITEM_NOT_FOUND'
  | 'ITEM_UNAVAILABLE'
  | 'SIZE_NOT_OFFERED'
  | 'CRUST_REQUIRED'
  | 'CRUST_NOT_OFFERED'
  | 'CRUST_UNAVAILABLE'
  | 'OPTIONS_NOT_ALLOWED'
  | 'TOPPING_NOT_OFFERED'
  | 'TOPPING_UNAVAILABLE'
  | 'DUPLICATE_TOPPING';

export interface QuoteLine {
  index: number;
  menuItemId: string;
  name: string | null;
  sizeLabel: string | null;
  crustName: string | null;
  toppings: { name: string; placement: Placement }[];
  quantity: number;
  instructions: string;
  unitPriceCents: number;
  extendedPriceCents: number;
  error: { code: LineErrorCode; message: string } | null;
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

/** Round half up of numerator / denominator, for non-negative integers. */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

const messages: Record<LineErrorCode, string> = {
  ITEM_NOT_FOUND: 'This item is no longer on the menu.',
  ITEM_UNAVAILABLE: 'This item is currently unavailable.',
  SIZE_NOT_OFFERED: 'That size is not offered for this item.',
  CRUST_REQUIRED: 'Please choose a crust.',
  CRUST_NOT_OFFERED: 'That crust is not offered for this item.',
  CRUST_UNAVAILABLE: 'That crust is currently unavailable.',
  OPTIONS_NOT_ALLOWED: 'This item does not take crust or topping choices.',
  TOPPING_NOT_OFFERED: 'One of the toppings is not offered for this item.',
  TOPPING_UNAVAILABLE: 'One of the toppings is currently unavailable.',
  DUPLICATE_TOPPING: 'Each topping can be chosen only once.',
};

function priceLine(index: number, input: QuoteLineInput, item: CatalogItem | undefined): QuoteLine {
  const base: QuoteLine = {
    index,
    menuItemId: input.menuItemId,
    name: item?.name ?? null,
    sizeLabel: null,
    crustName: null,
    toppings: [],
    quantity: input.quantity,
    instructions: (input.instructions ?? '').trim(),
    unitPriceCents: 0,
    extendedPriceCents: 0,
    error: null,
  };
  const fail = (code: LineErrorCode): QuoteLine => ({ ...base, error: { code, message: messages[code] } });

  if (!item || item.isRetired) return fail('ITEM_NOT_FOUND');
  if (!item.isAvailable) return fail('ITEM_UNAVAILABLE');

  const size = item.sizes.find((s) => s.id === input.sizeId);
  if (!size) return fail('SIZE_NOT_OFFERED');
  base.sizeLabel = size.label;

  const chosenToppings = input.toppings ?? [];
  let crustCents = 0;
  let toppingCents = 0;

  if (!item.isPizza) {
    if (input.crustId || chosenToppings.length > 0) return fail('OPTIONS_NOT_ALLOWED');
  } else {
    if (!input.crustId) return fail('CRUST_REQUIRED');
    const crust = item.crusts.find((c) => c.id === input.crustId);
    if (!crust) return fail('CRUST_NOT_OFFERED');
    if (!crust.isAvailable) return fail('CRUST_UNAVAILABLE');
    base.crustName = crust.name;
    crustCents = crust.surchargeCents;

    const seen = new Set<string>();
    for (const choice of chosenToppings) {
      if (seen.has(choice.toppingId)) return fail('DUPLICATE_TOPPING');
      seen.add(choice.toppingId);
      const topping = item.toppings.find((t) => t.id === choice.toppingId);
      if (!topping) return fail('TOPPING_NOT_OFFERED');
      if (!topping.isAvailable) return fail('TOPPING_UNAVAILABLE');
      toppingCents += choice.placement === 'WHOLE' ? topping.priceCents : divideRoundHalfUp(topping.priceCents, 2);
      base.toppings.push({ name: topping.name, placement: choice.placement });
    }
  }

  const unit = size.priceCents + crustCents + toppingCents;
  return { ...base, unitPriceCents: unit, extendedPriceCents: unit * input.quantity };
}

export function calculateQuote(input: QuoteInput, catalog: Map<string, CatalogItem>, rates: StoreRates): Quote {
  const lines = input.lines.map((line, i) => priceLine(i, line, catalog.get(line.menuItemId)));
  const subtotalCents = lines.reduce((sum, l) => sum + (l.error ? 0 : l.extendedPriceCents), 0);
  const discountCents = 0;
  const deliveryFeeCents = input.fulfillment === 'DELIVERY' ? rates.deliveryFeeCents : 0;

  const taxableCents = subtotalCents - discountCents + (rates.deliveryFeeTaxable ? deliveryFeeCents : 0);
  const taxCents = divideRoundHalfUp(taxableCents * rates.taxRateBps, 10_000);

  let tipCents = 0;
  if (input.tip?.type === 'PERCENT') tipCents = divideRoundHalfUp(subtotalCents * input.tip.percent, 100);
  if (input.tip?.type === 'AMOUNT') tipCents = input.tip.cents;
  tipCents = Math.min(tipCents, subtotalCents);

  return {
    lines,
    subtotalCents,
    discountCents,
    taxCents,
    deliveryFeeCents,
    tipCents,
    totalCents: subtotalCents - discountCents + taxCents + deliveryFeeCents + tipCents,
    taxRateBps: rates.taxRateBps,
    deliveryFeeTaxable: rates.deliveryFeeTaxable,
    hasErrors: lines.some((l) => l.error !== null),
  };
}
