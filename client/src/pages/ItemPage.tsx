import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MAX_QUANTITY, useCart } from '../cart/CartContext';
import { useQuote } from '../cart/useQuote';
import { fetchMenuItem, type MenuItem, type Placement, type QuoteLineRequest } from '../lib/api';
import { formatCents } from '../lib/money';

// Item configuration (S1-15, S1-19, S1-20, S1-21, S1-22, PB-04). Size, crust, toppings with
// half-and-half placement, quantity, and special instructions. Only options the item offers are
// shown, unavailable ones cannot be picked, and the price shown is the server's quote for exactly
// this configuration. Opening /menu/:id?edit=<line> edits a cart line with its choices restored.

const MAX_INSTRUCTIONS = 200;
type Choice = Placement | 'NONE';
const placementLabels: Record<Choice, string> = { NONE: 'None', WHOLE: 'Whole pizza', LEFT: 'Left half', RIGHT: 'Right half' };

export function ItemPage() {
  const { itemId = '' } = useParams();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const navigate = useNavigate();
  const { cart, dispatch } = useCart();
  const editing = cart.lines.find((l) => l.lineId === editId);

  const [item, setItem] = useState<MenuItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState('');
  const [crustId, setCrustId] = useState('');
  const [toppings, setToppings] = useState<Record<string, Choice>>({});
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    fetchMenuItem(itemId)
      .then((it) => {
        setItem(it);
        if (editing) {
          setSizeId(editing.sizeId);
          setCrustId(editing.crustId ?? '');
          setToppings(Object.fromEntries(editing.toppings.map((t) => [t.toppingId, t.placement])));
          setQuantity(editing.quantity);
          setInstructions(editing.instructions);
        } else {
          setSizeId(it.sizes[0]?.id ?? '');
          setCrustId(it.crusts.find((c) => c.isAvailable)?.id ?? '');
        }
      })
      .catch((e: Error) => setLoadError(e.message));
    // Loads once per item; the cart line being edited is read at that moment.
  }, [itemId]);

  const line: QuoteLineRequest | null = useMemo(() => {
    if (!item || !sizeId) return null;
    const chosen = Object.entries(toppings)
      .filter(([, p]) => p !== 'NONE')
      .map(([toppingId, placement]) => ({ toppingId, placement: placement as Placement }));
    return {
      menuItemId: item.id,
      sizeId,
      ...(item.isPizza && crustId ? { crustId } : {}),
      ...(chosen.length ? { toppings: chosen } : {}),
      quantity,
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    };
  }, [item, sizeId, crustId, toppings, quantity, instructions]);

  const { quote, error: quoteError } = useQuote(line ? { fulfillment: 'PICKUP', lines: [line] } : null);
  const priced = quote?.lines[0];

  if (loadError) return <p role="alert">This item could not be loaded. {loadError}</p>;
  if (!item) return <p aria-live="polite">Loading…</p>;
  if (!item.isAvailable) {
    return (
      <section className="page">
        <h1>{item.name}</h1>
        <p role="alert">This item is currently unavailable.</p>
        <button type="button" className="button-secondary" onClick={() => navigate(-1)}>
          Back to menu
        </button>
      </section>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!line || priced?.error) return;
    const cartLine = {
      menuItemId: line.menuItemId,
      sizeId: line.sizeId,
      crustId: line.crustId,
      toppings: line.toppings ?? [],
      quantity: line.quantity,
      instructions: instructions.trim(),
    };
    if (editing) dispatch({ type: 'update', lineId: editing.lineId, line: cartLine });
    else dispatch({ type: 'add', line: cartLine });
    navigate('/cart');
  };

  return (
    <section className="page">
      <button type="button" className="link-button" onClick={() => navigate(-1)}>
        ← Back to menu
      </button>
      <div className="config-grid">
        <form onSubmit={onSubmit} className="card" aria-describedby="price-summary">
          <h1>{item.name}</h1>
          {item.description && <p className="muted">{item.description}</p>}

          <fieldset>
            <legend>Size</legend>
            {item.sizes.map((s) => (
              <label key={s.id} className="choice">
                <input type="radio" name="size" value={s.id} checked={sizeId === s.id} onChange={() => setSizeId(s.id)} />
                {s.label} <span className="muted">{formatCents(s.priceCents)}</span>
              </label>
            ))}
          </fieldset>

          {item.isPizza && (
            <fieldset>
              <legend>Crust</legend>
              {item.crusts.map((c) => (
                <label key={c.id} className="choice">
                  <input
                    type="radio"
                    name="crust"
                    value={c.id}
                    checked={crustId === c.id}
                    disabled={!c.isAvailable}
                    onChange={() => setCrustId(c.id)}
                  />
                  {c.name}{' '}
                  <span className="muted">
                    {c.surchargeCents ? `+${formatCents(c.surchargeCents)}` : 'included'}
                    {!c.isAvailable && ' (unavailable)'}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {item.isPizza && item.toppings.length > 0 && (
            <fieldset>
              <legend>Toppings</legend>
              <p className="muted small">Each topping is {formatCents(item.toppings[0].priceCents)} on the whole pizza, half price on one half.</p>
              <div className="topping-grid">
                {item.toppings.map((t) => (
                  <label key={t.id} className="topping">
                    <span>
                      {t.name}
                      {!t.isAvailable && <span className="muted"> (unavailable)</span>}
                    </span>
                    <select
                      value={toppings[t.id] ?? 'NONE'}
                      disabled={!t.isAvailable}
                      onChange={(e) => setToppings({ ...toppings, [t.id]: e.target.value as Choice })}
                    >
                      {(Object.keys(placementLabels) as Choice[]).map((p) => (
                        <option key={p} value={p}>
                          {placementLabels[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="field">
            Quantity
            <input
              type="number"
              min={1}
              max={MAX_QUANTITY}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>

          <label className="field">
            <span className="label-text">
              Special instructions <span className="muted">(optional)</span>
            </span>
            <textarea
              rows={3}
              maxLength={MAX_INSTRUCTIONS}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              aria-describedby="instructions-count"
              placeholder="e.g. well done, light sauce"
            />
            <span id="instructions-count" className="muted small">
              {instructions.length} / {MAX_INSTRUCTIONS} characters
            </span>
          </label>

          <button type="submit" className="button" disabled={!priced || Boolean(priced.error)}>
            {editing ? 'Update cart' : 'Add to cart'}
          </button>
        </form>

        <aside className="quote-box" id="price-summary" aria-live="polite">
          <h2>Your {item.isPizza ? 'pizza' : 'item'}</h2>
          {quoteError && <p role="alert">{quoteError}</p>}
          {priced?.error && <p role="alert" className="error-text">{priced.error.message}</p>}
          {priced && !priced.error && (
            <>
              <div className="row">
                <span>Price each</span>
                <span>{formatCents(priced.unitPriceCents)}</span>
              </div>
              <div className="row grand-total">
                <span>{quantity} × total</span>
                <span>{formatCents(priced.extendedPriceCents)}</span>
              </div>
            </>
          )}
          {!priced && !quoteError && <p className="muted">Pricing…</p>}
        </aside>
      </div>
    </section>
  );
}
