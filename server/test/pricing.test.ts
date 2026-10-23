import { describe, it, expect } from 'vitest';
import { calculateQuote, divideRoundHalfUp, type CatalogItem, type QuoteInput } from '../src/modules/cart/pricing.js';

// Unit tests for the pricing rules in Table 21 (S1-27). Every expected total below was worked out
// by hand from the rule definitions, so these fixtures are the acceptance oracle for PB-05.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const pizza: CatalogItem = {
  id: id(1),
  name: 'Pepperoni Party',
  isPizza: true,
  isAvailable: true,
  isRetired: false,
  sizes: [
    { id: id(11), label: 'Small', priceCents: 1000 },
    { id: id(12), label: 'Medium', priceCents: 1400 },
  ],
  crusts: [
    { id: id(21), name: 'Hand Tossed', surchargeCents: 0, isAvailable: true },
    { id: id(22), name: 'Stuffed Crust', surchargeCents: 250, isAvailable: true },
    { id: id(23), name: 'Gluten Free', surchargeCents: 300, isAvailable: false },
  ],
  toppings: [
    { id: id(31), name: 'Pepperoni', priceCents: 125, isAvailable: true },
    { id: id(32), name: 'Mushrooms', priceCents: 125, isAvailable: true },
    { id: id(33), name: 'Anchovies', priceCents: 150, isAvailable: false },
  ],
};
const knots: CatalogItem = {
  id: id(2),
  name: 'Garlic Knots',
  isPizza: false,
  isAvailable: true,
  isRetired: false,
  sizes: [{ id: id(41), label: 'Regular', priceCents: 599 }],
  crusts: [],
  toppings: [],
};
const soldOut: CatalogItem = { ...knots, id: id(3), name: 'Spicy Garden', isAvailable: false };
const catalog = new Map([pizza, knots, soldOut].map((i) => [i.id, i]));
const rates = { taxRateBps: 825, deliveryFeeCents: 399, deliveryFeeTaxable: false };

// Medium (1400) + Stuffed Crust (250) + whole Pepperoni (125) + left-half Mushrooms (63) = 1838,
// two of them = 3676; plus Garlic Knots 599. Subtotal 4275.
const order = (fulfillment: 'PICKUP' | 'DELIVERY'): QuoteInput => ({
  fulfillment,
  lines: [
    {
      menuItemId: pizza.id,
      sizeId: id(12),
      crustId: id(22),
      toppings: [
        { toppingId: id(31), placement: 'WHOLE' },
        { toppingId: id(32), placement: 'LEFT' },
      ],
      quantity: 2,
      instructions: '  Well done, please  ',
    },
    { menuItemId: knots.id, sizeId: id(41), quantity: 1 },
  ],
});

describe('divideRoundHalfUp', () => {
  it('rounds exact halves up and everything else to the nearest cent', () => {
    expect(divideRoundHalfUp(125, 2)).toBe(63);
    expect(divideRoundHalfUp(5, 10)).toBe(1);
    expect(divideRoundHalfUp(4, 10)).toBe(0);
    expect(divideRoundHalfUp(0, 7)).toBe(0);
  });
});

describe('calculateQuote', () => {
  it('prices a pickup order with a percentage tip to the cent', () => {
    const q = calculateQuote({ ...order('PICKUP'), tip: { type: 'PERCENT', percent: 15 } }, catalog, rates);
    expect(q.lines[0].unitPriceCents).toBe(1838);
    expect(q.lines[0].extendedPriceCents).toBe(3676);
    expect(q.lines[0].instructions).toBe('Well done, please');
    expect(q.subtotalCents).toBe(4275);
    expect(q.taxCents).toBe(353); // 4275 x 8.25% = 352.6875
    expect(q.deliveryFeeCents).toBe(0);
    expect(q.tipCents).toBe(641); // 15% of 4275 = 641.25
    expect(q.totalCents).toBe(5269);
    expect(q.hasErrors).toBe(false);
  });

  it('adds the delivery fee to delivery orders without taxing it by default', () => {
    const q = calculateQuote(order('DELIVERY'), catalog, rates);
    expect(q.deliveryFeeCents).toBe(399);
    expect(q.taxCents).toBe(353);
    expect(q.totalCents).toBe(4275 + 353 + 399);
  });

  it('taxes the delivery fee only when the store setting says so', () => {
    const q = calculateQuote(order('DELIVERY'), catalog, { ...rates, deliveryFeeTaxable: true });
    expect(q.taxCents).toBe(386); // (4275 + 399) x 8.25% = 385.605
    expect(q.totalCents).toBe(4275 + 386 + 399);
  });

  it('caps a fixed tip at the subtotal and never taxes the tip', () => {
    const q = calculateQuote(
      { fulfillment: 'PICKUP', tip: { type: 'AMOUNT', cents: 10_000 }, lines: [{ menuItemId: knots.id, sizeId: id(41), quantity: 1 }] },
      catalog,
      rates,
    );
    expect(q.tipCents).toBe(599);
    expect(q.taxCents).toBe(49); // 599 x 8.25% = 49.4175
    expect(q.totalCents).toBe(599 + 49 + 599);
  });

  it('rounds an exact half cent of tax up', () => {
    const tenDollars: CatalogItem = { ...knots, id: id(4), sizes: [{ id: id(42), label: 'Regular', priceCents: 1000 }] };
    const q = calculateQuote(
      { fulfillment: 'PICKUP', lines: [{ menuItemId: tenDollars.id, sizeId: id(42), quantity: 1 }] },
      new Map([[tenDollars.id, tenDollars]]),
      rates,
    );
    expect(q.taxCents).toBe(83); // 1000 x 8.25% = 82.5
    expect(q.totalCents).toBe(1083);
  });

  it('keeps discounts at zero until promotions arrive with PB-14', () => {
    expect(calculateQuote(order('PICKUP'), catalog, rates).discountCents).toBe(0);
  });

  it('flags an unavailable item and leaves it out of the totals', () => {
    const q = calculateQuote(
      { fulfillment: 'PICKUP', lines: [{ menuItemId: soldOut.id, sizeId: id(41), quantity: 1 }, ...order('PICKUP').lines] },
      catalog,
      rates,
    );
    expect(q.lines[0].error?.code).toBe('ITEM_UNAVAILABLE');
    expect(q.hasErrors).toBe(true);
    expect(q.subtotalCents).toBe(4275);
  });

  it('refuses combinations the item does not offer', () => {
    const base = order('PICKUP').lines[0];
    const codeFor = (line: object) =>
      calculateQuote({ fulfillment: 'PICKUP', lines: [{ ...base, ...line }] }, catalog, rates).lines[0].error?.code;
    expect(codeFor({ sizeId: id(41) })).toBe('SIZE_NOT_OFFERED');
    expect(codeFor({ crustId: undefined })).toBe('CRUST_REQUIRED');
    expect(codeFor({ crustId: id(99) })).toBe('CRUST_NOT_OFFERED');
    expect(codeFor({ crustId: id(23) })).toBe('CRUST_UNAVAILABLE');
    expect(codeFor({ toppings: [{ toppingId: id(99), placement: 'WHOLE' }] })).toBe('TOPPING_NOT_OFFERED');
    expect(codeFor({ toppings: [{ toppingId: id(33), placement: 'WHOLE' }] })).toBe('TOPPING_UNAVAILABLE');
    expect(
      codeFor({
        toppings: [
          { toppingId: id(31), placement: 'LEFT' },
          { toppingId: id(31), placement: 'RIGHT' },
        ],
      }),
    ).toBe('DUPLICATE_TOPPING');
    expect(codeFor({ menuItemId: id(99) })).toBe('ITEM_NOT_FOUND');
  });

  it('refuses crust and toppings on an item that is not a pizza', () => {
    const q = calculateQuote(
      { fulfillment: 'PICKUP', lines: [{ menuItemId: knots.id, sizeId: id(41), crustId: id(21), quantity: 1 }] },
      catalog,
      rates,
    );
    expect(q.lines[0].error?.code).toBe('OPTIONS_NOT_ALLOWED');
  });

  it('returns a zero quote for an empty cart', () => {
    const q = calculateQuote({ fulfillment: 'PICKUP', lines: [] }, catalog, rates);
    expect(q.totalCents).toBe(0);
    expect(q.hasErrors).toBe(false);
  });
});
