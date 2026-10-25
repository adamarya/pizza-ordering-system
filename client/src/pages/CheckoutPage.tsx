import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toQuoteRequest, useCart } from '../cart/CartContext';
import { validateCheckout, type CheckoutReview } from '../lib/api';
import { formatCents } from '../lib/money';

// Checkout (S2-07 to S2-10, PB-06). Designed and written by Emmanuella Ahinkrah: fulfillment and
// requested time, contact details, delivery address, then a server-priced review screen that ends
// with "Continue to payment". The card form (S2-13, #7) and order placement (S2-14, #12) attach to
// the payment step once both are merged.

const field = { width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' } as const;
const fieldError = { color: '#b91c1c', fontSize: '0.8rem', marginTop: '4px' } as const;

export function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, dispatch } = useCart();
  const [step, setStep] = useState<'details' | 'review' | 'payment'>('details');
  const [requestedTime, setRequestedTime] = useState('');

  // No prefilled personal details.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('CO');
  const [zipCode, setZipCode] = useState('');
  const [unitOrApt, setUnitOrApt] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [review, setReview] = useState<CheckoutReview | null>(null);

  if (cart.lines.length === 0) {
    return (
      <section className="page">
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <Link className="button" to="/menu">Browse the menu</Link>
      </section>
    );
  }

  const fulfillment = cart.fulfillment;
  const errorFor = (key: string) =>
    errors[key] ? (
      <p id={`${key}-error`} style={fieldError}>
        {errors[key]}
      </p>
    ) : null;
  const describedBy = (key: string) => (errors[key] ? `${key}-error` : undefined);

  async function handleSubmitDetails(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await validateCheckout({
        ...toQuoteRequest(cart),
        requestedTime: requestedTime ? new Date(requestedTime).toISOString() : undefined,
        customer: { firstName, lastName, email, phone },
        deliveryAddress:
          fulfillment === 'DELIVERY' ? { street, city, state, zipCode, unitOrApt: unitOrApt || undefined } : undefined,
      });
      if (result.ok) {
        setReview(result.review);
        setStep('review');
      } else {
        setErrors(result.errors);
        setMessage(result.message);
      }
    } catch {
      setMessage('We could not reach the restaurant. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <h1>Checkout</h1>

      {message && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {message}
        </div>
      )}

      {step === 'details' && (
        <form onSubmit={handleSubmitDetails} noValidate>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Fulfillment and contact</h2>
            <button type="button" onClick={() => navigate('/cart')} className="link-button">
              Return to cart
            </button>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0', display: 'flex', gap: '1rem' }}>
            <legend className="visually-hidden">Pickup or delivery</legend>
            {(['PICKUP', 'DELIVERY'] as const).map((option) => (
              <label key={option} style={{ flex: 1, padding: '0.75rem', border: fulfillment === option ? '2px solid #b91c1c' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', textAlign: 'center' }}>
                <input
                  type="radio"
                  name="fulfillment"
                  checked={fulfillment === option}
                  onChange={() => dispatch({ type: 'fulfillment', fulfillment: option })}
                  style={{ marginRight: '6px' }}
                />
                {option === 'PICKUP' ? 'Pickup' : 'Delivery'}
              </label>
            ))}
          </fieldset>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="requestedTime" style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '4px' }}>
              Requested date and time (leave empty for as soon as possible)
            </label>
            <input id="requestedTime" type="datetime-local" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} aria-invalid={!!errors.requestedTime} aria-describedby={describedBy('requestedTime')} style={field} />
            {errorFor('requestedTime')}
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
            <legend style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>Contact information</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <input type="text" placeholder="First name" aria-label="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} aria-invalid={!!errors['customer.firstName']} aria-describedby={describedBy('customer.firstName')} style={field} />
                {errorFor('customer.firstName')}
              </div>
              <div>
                <input type="text" placeholder="Last name" aria-label="Last name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} aria-invalid={!!errors['customer.lastName']} aria-describedby={describedBy('customer.lastName')} style={field} />
                {errorFor('customer.lastName')}
              </div>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <input type="email" placeholder="Email address" aria-label="Email address" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors['customer.email']} aria-describedby={describedBy('customer.email')} style={field} />
              {errorFor('customer.email')}
            </div>
            <div>
              <input type="tel" placeholder="Phone number" aria-label="Phone number" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors['customer.phone']} aria-describedby={describedBy('customer.phone')} style={field} />
              {errorFor('customer.phone')}
            </div>
          </fieldset>

          {fulfillment === 'DELIVERY' && (
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
              <legend style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>Delivery address</legend>
              {errorFor('deliveryAddress')}
              <input type="text" placeholder="Street address" aria-label="Street address" autoComplete="address-line1" value={street} onChange={(e) => setStreet(e.target.value)} aria-invalid={!!errors['deliveryAddress.street']} style={{ ...field, marginBottom: '0.5rem' }} />
              {errorFor('deliveryAddress.street')}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input type="text" placeholder="City" aria-label="City" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} style={field} />
                <input type="text" placeholder="State" aria-label="State" autoComplete="address-level1" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} style={field} />
                <input type="text" placeholder="ZIP" aria-label="ZIP code" autoComplete="postal-code" inputMode="numeric" value={zipCode} onChange={(e) => setZipCode(e.target.value)} aria-invalid={!!errors['deliveryAddress.zipCode']} aria-describedby={describedBy('deliveryAddress.zipCode')} style={field} />
              </div>
              {errorFor('deliveryAddress.city')}
              {errorFor('deliveryAddress.state')}
              {errorFor('deliveryAddress.zipCode')}
              <input type="text" placeholder="Apt, suite, unit (optional)" aria-label="Apartment or unit" autoComplete="address-line2" value={unitOrApt} onChange={(e) => setUnitOrApt(e.target.value)} style={field} />
            </fieldset>
          )}

          <button type="submit" className="checkout-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Checking your order…' : 'Review order'}
          </button>
        </form>
      )}

      {step === 'review' && review && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Review your order</h2>
            <button type="button" onClick={() => setStep('details')} className="link-button">
              Edit details
            </button>
          </div>

          <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 4px 0' }}>
              <strong>Customer:</strong> {review.customer.firstName} {review.customer.lastName} ({review.customer.phone})
            </p>
            <p style={{ margin: '0 0 4px 0' }}>
              <strong>Fulfillment:</strong> {review.fulfillment === 'PICKUP' ? 'Pickup' : 'Delivery'}
              {review.requestedTime ? `, ${new Date(review.requestedTime).toLocaleString()}` : ', as soon as possible'}
            </p>
            {review.deliveryAddress && (
              <p style={{ margin: 0 }}>
                <strong>Address:</strong> {review.deliveryAddress.street}, {review.deliveryAddress.city}, {review.deliveryAddress.state} {review.deliveryAddress.zipCode}
              </p>
            )}
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '1rem', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Items</h3>
            {review.quote.lines.map((line) => (
              <div key={line.index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '6px' }}>
                <span>
                  {line.quantity} × {line.name}
                  {line.sizeLabel ? ` (${line.sizeLabel})` : ''}
                </span>
                <span>{formatCents(line.extendedPriceCents)}</span>
              </div>
            ))}
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.75rem 0' }} />
            <div className="row"><span>Subtotal</span><span>{formatCents(review.quote.subtotalCents)}</span></div>
            {review.quote.deliveryFeeCents > 0 && (
              <div className="row"><span>Delivery fee</span><span>{formatCents(review.quote.deliveryFeeCents)}</span></div>
            )}
            <div className="row"><span>Tax</span><span>{formatCents(review.quote.taxCents)}</span></div>
            {review.quote.tipCents > 0 && (
              <div className="row"><span>Tip</span><span>{formatCents(review.quote.tipCents)}</span></div>
            )}
            <div className="row grand-total"><span>Total</span><span>{formatCents(review.quote.totalCents)}</span></div>
          </div>

          <button type="button" className="checkout-btn" onClick={() => setStep('payment')}>
            Continue to payment
          </button>
        </div>
      )}

      {step === 'payment' && review && (
        <div>
          <button type="button" onClick={() => setStep('review')} className="link-button" style={{ marginBottom: '1rem' }}>
            Back to review
          </button>
          <div style={{ border: '2px dashed #9ca3af', padding: '2rem', textAlign: 'center', borderRadius: '6px', color: '#44403c' }}>
            <h2 style={{ fontSize: '1.1rem' }}>Payment</h2>
            <p>
              Total to pay: <strong>{formatCents(review.quote.totalCents)}</strong>. Card payment opens here once order placement
              (#12) and the card form (#7) are merged.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
