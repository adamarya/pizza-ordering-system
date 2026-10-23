import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MAX_QUANTITY, toQuoteRequest, useCart } from '../cart/CartContext';
import { useQuote } from '../cart/useQuote';
import { fetchMenu, type Placement } from '../lib/api';
import { formatCents } from '../lib/money';

// Cart screen (S1-24, PB-05). Layout, fulfillment toggle, tip options, and summary design by
// Emmanuella Ahinkrah (pull request #2), rebuilt as a React screen that displays the server's quote.
// Every amount on this page comes from POST /api/cart/quote. Promo codes from the prototype are
// held for PB-14, when the server can validate them.

const TIP_PRESETS = [0, 10, 15, 20];
const placementText: Record<Placement, string> = { WHOLE: '', LEFT: ' (left half)', RIGHT: ' (right half)' };

export function CartPage() {
  const { cart, dispatch } = useCart();
  const request = useMemo(() => (cart.lines.length ? toQuoteRequest(cart) : null), [cart]);
  const { quote, error, loading } = useQuote(request);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState(cart.tip.type === 'AMOUNT' ? (cart.tip.cents / 100).toFixed(2) : '');

  useEffect(() => {
    fetchMenu()
      .then((m) => setDeliveryFee(m.store.deliveryFeeCents))
      .catch(() => setDeliveryFee(null));
  }, []);

  if (cart.lines.length === 0) {
    return (
      <section className="page">
        <h1>Your cart</h1>
        <p>Your cart is empty.</p>
        <Link className="button" to="/menu">
          Browse the menu
        </Link>
      </section>
    );
  }

  const onCustomTip = (value: string) => {
    setCustomTip(value);
    const dollars = Number(value);
    if (value.trim() === '' || !Number.isFinite(dollars) || dollars < 0) return;
    // Converting the typed dollar amount to whole cents is input parsing, not a price calculation;
    // the server caps the tip and computes the total.
    dispatch({ type: 'tip', tip: { type: 'AMOUNT', cents: Math.round(dollars * 100) } });
  };

  return (
    <section className="page">
      <div className="header-bar">
        <h1>Your cart</h1>
        <Link to="/menu">Add more items</Link>
      </div>

      <div className="cart-grid">
        <section aria-label="Order items">
          <ul className="cart-list">
            {cart.lines.map((line, i) => {
              const priced = quote?.lines[i];
              return (
                <li key={line.lineId} className={`cart-item${priced?.error ? ' out-of-stock' : ''}`}>
                  <div className="cart-item-main">
                    <h2>{priced?.name ?? 'Item'}</h2>
                    <p className="muted small">
                      {[priced?.sizeLabel, priced?.crustName].filter(Boolean).join(' · ')}
                    </p>
                    {priced && priced.toppings.length > 0 && (
                      <p className="small">
                        Toppings: {priced.toppings.map((t) => t.name + placementText[t.placement]).join(', ')}
                      </p>
                    )}
                    {line.instructions && <p className="small instructions">“{line.instructions}”</p>}
                    {priced?.error && (
                      <p role="alert" className="error-text small">
                        {priced.error.message} Remove it or change it to continue.
                      </p>
                    )}
                    <div className="line-actions">
                      <div className="stepper" role="group" aria-label={`Quantity of ${priced?.name ?? 'item'}`}>
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          disabled={line.quantity <= 1}
                          onClick={() => dispatch({ type: 'quantity', lineId: line.lineId, quantity: line.quantity - 1 })}
                        >
                          −
                        </button>
                        <span aria-live="polite">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={line.quantity >= MAX_QUANTITY}
                          onClick={() => dispatch({ type: 'quantity', lineId: line.lineId, quantity: line.quantity + 1 })}
                        >
                          +
                        </button>
                      </div>
                      <Link to={`/menu/${line.menuItemId}?edit=${line.lineId}`}>Edit</Link>
                      <button type="button" className="link-button" onClick={() => dispatch({ type: 'remove', lineId: line.lineId })}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="cart-item-price">
                    {priced && !priced.error && (
                      <>
                        <span className="muted small">{formatCents(priced.unitPriceCents)} each</span>
                        <strong>{formatCents(priced.extendedPriceCents)}</strong>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="quote-box" aria-label="Order summary">
          <div className="quote-status-badge">{loading ? 'Updating price…' : 'Priced by the restaurant'}</div>
          <h2>Order summary</h2>

          <fieldset className="fulfillment-toggle">
            <legend className="section-title">Pickup or delivery</legend>
            <label className="toggle-label">
              <input
                type="radio"
                name="fulfillment"
                checked={cart.fulfillment === 'PICKUP'}
                onChange={() => dispatch({ type: 'fulfillment', fulfillment: 'PICKUP' })}
              />
              Pickup
            </label>
            <label className="toggle-label">
              <input
                type="radio"
                name="fulfillment"
                checked={cart.fulfillment === 'DELIVERY'}
                onChange={() => dispatch({ type: 'fulfillment', fulfillment: 'DELIVERY' })}
              />
              Delivery{deliveryFee !== null ? ` (${formatCents(deliveryFee)})` : ''}
            </label>
          </fieldset>

          <fieldset className="panel-section">
            <legend className="section-title">Add a tip for the team</legend>
            <div className="tip-grid">
              {TIP_PRESETS.map((pct) => {
                const active = cart.tip.type === 'PERCENT' && cart.tip.percent === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    className={`tip-btn${active ? ' active' : ''}`}
                    aria-pressed={active}
                    onClick={() => {
                      setCustomTip('');
                      dispatch({ type: 'tip', tip: { type: 'PERCENT', percent: pct } });
                    }}
                  >
                    {pct === 0 ? 'None' : `${pct}%`}
                  </button>
                );
              })}
            </div>
            <label className="field small">
              Custom tip ($)
              <input type="number" min={0} step="0.50" inputMode="decimal" value={customTip} onChange={(e) => onCustomTip(e.target.value)} />
            </label>
          </fieldset>

          {error && <p role="alert">{error}</p>}
          {quote && (
            <div aria-live="polite">
              <div className="row">
                <span>Subtotal</span>
                <span>{formatCents(quote.subtotalCents)}</span>
              </div>
              {quote.discountCents > 0 && (
                <div className="row discount-row">
                  <span>Discount</span>
                  <span>−{formatCents(quote.discountCents)}</span>
                </div>
              )}
              {cart.fulfillment === 'DELIVERY' && (
                <div className="row">
                  <span>Delivery fee</span>
                  <span>{formatCents(quote.deliveryFeeCents)}</span>
                </div>
              )}
              <div className="row">
                <span>Tax ({(quote.taxRateBps / 100).toFixed(2)}%)</span>
                <span>{formatCents(quote.taxCents)}</span>
              </div>
              <div className="row">
                <span>Tip</span>
                <span>{formatCents(quote.tipCents)}</span>
              </div>
              <div className="row grand-total">
                <span>Total</span>
                <span>{formatCents(quote.totalCents)}</span>
              </div>
            </div>
          )}

          <button type="button" className="checkout-btn" disabled aria-describedby="checkout-note">
            Continue to checkout
          </button>
          <p id="checkout-note" className="muted small">
            {quote?.hasErrors
              ? 'Fix the items marked above before checking out.'
              : 'Checkout and payment open in Sprint 2.'}
          </p>
        </aside>
      </div>
    </section>
  );
}
