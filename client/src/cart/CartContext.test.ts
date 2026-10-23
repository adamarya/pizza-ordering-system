import { cartReducer, emptyCart, parseStoredCart, toQuoteRequest, MAX_QUANTITY } from './CartContext';

const line = { menuItemId: 'item-1', sizeId: 'size-1', crustId: 'crust-1', toppings: [], quantity: 1, instructions: '' };

describe('cartReducer', () => {
  it('adds, updates, and removes lines', () => {
    let s = cartReducer(emptyCart, { type: 'add', line });
    expect(s.lines).toHaveLength(1);
    const id = s.lines[0].lineId;
    s = cartReducer(s, { type: 'update', lineId: id, line: { ...line, sizeId: 'size-2' } });
    expect(s.lines[0]).toMatchObject({ lineId: id, sizeId: 'size-2' });
    s = cartReducer(s, { type: 'remove', lineId: id });
    expect(s.lines).toHaveLength(0);
  });

  it('keeps quantity between 1 and the maximum', () => {
    let s = cartReducer(emptyCart, { type: 'add', line });
    const id = s.lines[0].lineId;
    s = cartReducer(s, { type: 'quantity', lineId: id, quantity: 0 });
    expect(s.lines[0].quantity).toBe(1);
    s = cartReducer(s, { type: 'quantity', lineId: id, quantity: 99 });
    expect(s.lines[0].quantity).toBe(MAX_QUANTITY);
  });

  it('sends only the choices to the server, never prices', () => {
    const s = cartReducer(emptyCart, { type: 'add', line: { ...line, instructions: '  extra crispy ' } });
    const req = toQuoteRequest(s);
    expect(req.lines[0]).toEqual({ menuItemId: 'item-1', sizeId: 'size-1', crustId: 'crust-1', quantity: 1, instructions: 'extra crispy' });
    expect(JSON.stringify(req)).not.toMatch(/price|total/i);
  });
});

describe('parseStoredCart', () => {
  it('restores a well-formed cart', () => {
    const stored = { lines: [{ ...line, lineId: 'a' }], fulfillment: 'DELIVERY', tip: { type: 'AMOUNT', cents: 300 } };
    expect(parseStoredCart(JSON.stringify(stored))).toEqual(stored);
  });

  it('drops malformed lines and falls back to defaults for anything unexpected', () => {
    const stored = {
      lines: [{ ...line, lineId: 'a', quantity: 500 }, { lineId: 'b', menuItemId: 7 }, { ...line, lineId: 'c' }],
      fulfillment: 'TELEPORT',
      tip: { type: 'PERCENT', percent: -5 },
    };
    const cart = parseStoredCart(JSON.stringify(stored));
    expect(cart.lines.map((l) => l.lineId)).toEqual(['c']);
    expect(cart.fulfillment).toBe('PICKUP');
    expect(cart.tip).toEqual(emptyCart.tip);
    expect(parseStoredCart('not json')).toEqual(emptyCart);
  });
});
