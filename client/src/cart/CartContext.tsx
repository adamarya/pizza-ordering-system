import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { Fulfillment, Placement, QuoteRequest, Tip } from '../lib/api';

// Cart storage (S1-23, PB-05). The cart survives navigation within the browser session and holds
// only the customer's choices. Names and prices are never stored here; they come back from the
// server quote every time the cart changes.

export interface CartLine {
  lineId: string;
  menuItemId: string;
  sizeId: string;
  crustId?: string;
  toppings: { toppingId: string; placement: Placement }[];
  quantity: number;
  instructions: string;
}

export interface CartState {
  lines: CartLine[];
  fulfillment: Fulfillment;
  tip: Tip;
}

type Action =
  | { type: 'add'; line: Omit<CartLine, 'lineId'> }
  | { type: 'update'; lineId: string; line: Omit<CartLine, 'lineId'> }
  | { type: 'remove'; lineId: string }
  | { type: 'quantity'; lineId: string; quantity: number }
  | { type: 'fulfillment'; fulfillment: Fulfillment }
  | { type: 'tip'; tip: Tip }
  | { type: 'clear' };

export const MAX_QUANTITY = 20;
export const MAX_LINES = 30;
const STORAGE_KEY = 'pizza-cart-v1';
export const emptyCart: CartState = { lines: [], fulfillment: 'PICKUP', tip: { type: 'PERCENT', percent: 15 } };

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());

export function cartReducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case 'add':
      if (state.lines.length >= MAX_LINES) return state;
      return { ...state, lines: [...state.lines, { ...action.line, lineId: newId() }] };
    case 'update':
      return { ...state, lines: state.lines.map((l) => (l.lineId === action.lineId ? { ...action.line, lineId: l.lineId } : l)) };
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.lineId !== action.lineId) };
    case 'quantity': {
      const quantity = Math.min(MAX_QUANTITY, Math.max(1, Math.round(action.quantity)));
      return { ...state, lines: state.lines.map((l) => (l.lineId === action.lineId ? { ...l, quantity } : l)) };
    }
    case 'fulfillment':
      return { ...state, fulfillment: action.fulfillment };
    case 'tip':
      return { ...state, tip: action.tip };
    case 'clear':
      return emptyCart;
  }
}

export function toQuoteRequest(state: CartState): QuoteRequest {
  return {
    fulfillment: state.fulfillment,
    tip: state.tip,
    lines: state.lines.map(({ menuItemId, sizeId, crustId, toppings, quantity, instructions }) => ({
      menuItemId,
      sizeId,
      ...(crustId ? { crustId } : {}),
      ...(toppings.length ? { toppings } : {}),
      quantity,
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    })),
  };
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** Accepts stored data only if it has the cart's shape; anything else starts an empty cart. */
export function parseStoredCart(raw: string | null): CartState {
  if (!raw) return emptyCart;
  try {
    const data = JSON.parse(raw);
    const lines: CartLine[] = Array.isArray(data?.lines)
      ? data.lines
          .filter(
            (l: Partial<CartLine>) =>
              isString(l?.lineId) &&
              isString(l?.menuItemId) &&
              isString(l?.sizeId) &&
              (l.crustId === undefined || isString(l.crustId)) &&
              Array.isArray(l.toppings) &&
              l.toppings.every((t) => isString(t?.toppingId) && ['WHOLE', 'LEFT', 'RIGHT'].includes(t?.placement)) &&
              Number.isInteger(l.quantity) &&
              (l.quantity as number) >= 1 &&
              (l.quantity as number) <= MAX_QUANTITY &&
              isString(l.instructions),
          )
          .slice(0, MAX_LINES)
      : [];
    const fulfillment = data?.fulfillment === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    const tip: Tip =
      data?.tip?.type === 'PERCENT' && Number.isInteger(data.tip.percent) && data.tip.percent >= 0 && data.tip.percent <= 100
        ? { type: 'PERCENT', percent: data.tip.percent }
        : data?.tip?.type === 'AMOUNT' && Number.isInteger(data.tip.cents) && data.tip.cents >= 0
          ? { type: 'AMOUNT', cents: data.tip.cents }
          : emptyCart.tip;
    return { lines, fulfillment, tip };
  } catch {
    return emptyCart;
  }
}

function load(): CartState {
  try {
    return parseStoredCart(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyCart;
  }
}

const CartContext = createContext<{ cart: CartState; dispatch: (a: Action) => void } | null>(null);

export function CartProvider({ children, initial }: { children: ReactNode; initial?: CartState }) {
  const [cart, dispatch] = useReducer(cartReducer, initial ?? emptyCart, (init) => (initial ? init : load()));
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Storage can be unavailable (private browsing); the cart still works for this page view.
    }
  }, [cart]);
  const value = useMemo(() => ({ cart, dispatch }), [cart]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
