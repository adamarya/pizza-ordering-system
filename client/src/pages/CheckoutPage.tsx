import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toQuoteRequest, useCart } from '../cart/CartContext';
import {
  newIdempotencyKey,
  placeOrder,
  validateCheckout,
  type CheckoutReview,
  type CheckoutValidateRequest,
  type PlacedOrder,
} from '../lib/api';
import { formatCents } from '../lib/money';
import { CardPayment } from '../payments/CardPayment';

// Checkout (S2-07 to S2-10, PB-06).
// CRUST & CO. styling follows Emmanuella's index.html checkout prototype.
// Keep server-side validation and server-calculated prices.
// "Continue to payment" places the order (S2-14) with the request the review screen validated and
// the total it showed, then opens Stripe's card fields (S2-13). The order is marked received from
// Stripe's signed webhook, not from this page.

type CheckoutStep = 'details' | 'review' | 'payment';

export function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, dispatch } = useCart();

  const [step, setStep] = useState<CheckoutStep>('details');
  const [requestedTime, setRequestedTime] = useState('');

  // Customer details intentionally start empty.
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
  // The request the review screen validated, one Idempotency-Key per review, and the placed order.
  const [request, setRequest] = useState<CheckoutValidateRequest | null>(null);
  const [orderKey, setOrderKey] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  if (cart.lines.length === 0) {
    return (
      <section className="page checkout-page">
        <div className="checkout-empty card">
          <span className="checkout-eyebrow">CRUST &amp; CO.</span>
          <h1>Your cart is empty</h1>
          <p className="muted">
            Your next favorite pizza is only a few clicks away.
          </p>
          <Link className="button checkout-empty-button" to="/menu">
            Browse the menu
          </Link>
        </div>
      </section>
    );
  }

  const fulfillment = cart.fulfillment;

  const errorFor = (key: string) =>
    errors[key] ? (
      <p id={`${key}-error`} className="checkout-field-error">
        {errors[key]}
      </p>
    ) : null;

  const describedBy = (key: string) =>
    errors[key] ? `${key}-error` : undefined;

  async function handleSubmitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    setIsSubmitting(true);

    try {
      const body: CheckoutValidateRequest = {
        ...toQuoteRequest(cart),
        requestedTime: requestedTime
          ? new Date(requestedTime).toISOString()
          : undefined,
        customer: {
          firstName,
          lastName,
          email,
          phone,
        },
        deliveryAddress:
          fulfillment === 'DELIVERY'
            ? {
                street,
                city,
                state,
                zipCode,
                unitOrApt: unitOrApt || undefined,
              }
            : undefined,
      };
      const result = await validateCheckout(body);

      if (result.ok) {
        setReview(result.review);
        setRequest(body);
        setOrderKey(newIdempotencyKey());
        setPlaced(null);
        setStep('review');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setErrors(result.errors);
        setMessage(result.message);
      }
    } catch {
      setMessage(
        'We could not reach the restaurant. Please check your connection and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePlaceOrder() {
    if (!review || !request || !orderKey || isSubmitting) return;
    if (placed) {
      setStep('payment'); // same order, already placed for this review
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await placeOrder({ ...request, confirmedTotalCents: review.quote.totalCents }, orderKey);
      switch (result.kind) {
        case 'placed':
          setPlaced(result);
          setStep('payment');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'quote-changed':
          // Show the new total and ask again; a new key, because the confirmed total is different.
          setReview({ ...review, quote: result.quote });
          setOrderKey(newIdempotencyKey());
          setMessage(result.message);
          break;
        case 'invalid':
          setErrors(result.errors);
          setMessage(result.message);
          setStep('details');
          break;
        default:
          setMessage(result.message);
      }
    } catch {
      setMessage('We could not reach the restaurant. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePaid() {
    if (!placed) return;
    dispatch({ type: 'clear' });
    navigate(`/order-placed/${placed.orderRef}`, { replace: true, state: { orderNumber: placed.orderNumber } });
  }

  return (
    <section className="page checkout-page">
      <header className="checkout-heading">
        <span className="checkout-eyebrow">CRUST &amp; CO.</span>
        <h1>Checkout</h1>
        <p className="checkout-intro">
          Freshly made, almost yours. Complete your details to review your order.
        </p>

        <ol className="checkout-progress">
          <li
            className={
              step === 'details' ? 'is-current' : 'is-complete'
            }
            aria-current={step === 'details' ? 'step' : undefined}
          >
            <span className="checkout-progress-number">1</span>
            <span>Your details</span>
          </li>
          <li
            className={
              step === 'review'
                ? 'is-current'
                : step === 'payment'
                  ? 'is-complete'
                  : ''
            }
            aria-current={step === 'review' ? 'step' : undefined}
          >
            <span className="checkout-progress-number">2</span>
            <span>Review order</span>
          </li>
          <li
            className={step === 'payment' ? 'is-current' : ''}
            aria-current={step === 'payment' ? 'step' : undefined}
          >
            <span className="checkout-progress-number">3</span>
            <span>Payment</span>
          </li>
        </ol>
      </header>

      {message && (
        <div className="checkout-alert" role="alert">
          <strong>Something needs your attention</strong>
          <p>{message}</p>
        </div>
      )}

      {step === 'details' && (
        <form
          className="checkout-layout"
          onSubmit={handleSubmitDetails}
          noValidate
        >
          <div className="checkout-form-card card">
            <div className="checkout-card-heading">
              <div>
                <span className="checkout-step-label">STEP 01</span>
                <h2>Your details</h2>
                <p className="muted">
                  Tell us how to prepare and get your order to you.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="link-button checkout-back-link"
              >
                ← Back to cart
              </button>
            </div>

            <fieldset className="checkout-section">
              <legend>How would you like your order?</legend>
              <div className="checkout-fulfillment-options">
                <label
                  className={`checkout-fulfillment-option ${
                    fulfillment === 'PICKUP' ? 'is-selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    value="PICKUP"
                    checked={fulfillment === 'PICKUP'}
                    onChange={() =>
                      dispatch({
                        type: 'fulfillment',
                        fulfillment: 'PICKUP',
                      })
                    }
                  />
                  <span className="checkout-option-icon" aria-hidden="true">
                    ↗
                  </span>
                  <span className="checkout-option-copy">
                    <strong>Pickup</strong>
                    <small>Collect your order</small>
                  </span>
                </label>

                <label
                  className={`checkout-fulfillment-option ${
                    fulfillment === 'DELIVERY' ? 'is-selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    value="DELIVERY"
                    checked={fulfillment === 'DELIVERY'}
                    onChange={() =>
                      dispatch({
                        type: 'fulfillment',
                        fulfillment: 'DELIVERY',
                      })
                    }
                  />
                  <span className="checkout-option-icon" aria-hidden="true">
                    ♧
                  </span>
                  <span className="checkout-option-copy">
                    <strong>Delivery</strong>
                    <small>Bring it to your door</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="checkout-section">
              <label className="checkout-label" htmlFor="requestedTime">
                Requested date and time
              </label>
              <input
                className="checkout-input"
                id="requestedTime"
                type="datetime-local"
                value={requestedTime}
                onChange={(event) => setRequestedTime(event.target.value)}
                aria-invalid={!!errors.requestedTime}
                aria-describedby={describedBy('requestedTime')}
              />
              <p className="checkout-hint">
                Leave this empty if you want your order as soon as possible.
              </p>
              {errorFor('requestedTime')}
            </div>

            <fieldset className="checkout-section">
              <legend>Contact information</legend>
              <p className="checkout-hint checkout-legend-hint">
                We’ll use these details for your order.
              </p>

              <div className="checkout-form-grid">
                <div className="checkout-field">
                  <label className="checkout-label" htmlFor="firstName">
                    First name
                  </label>
                  <input
                    className="checkout-input"
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="First name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    aria-invalid={!!errors['customer.firstName']}
                    aria-describedby={describedBy('customer.firstName')}
                  />
                  {errorFor('customer.firstName')}
                </div>

                <div className="checkout-field">
                  <label className="checkout-label" htmlFor="lastName">
                    Last name
                  </label>
                  <input
                    className="checkout-input"
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Last name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    aria-invalid={!!errors['customer.lastName']}
                    aria-describedby={describedBy('customer.lastName')}
                  />
                  {errorFor('customer.lastName')}
                </div>

                <div className="checkout-field checkout-field-full">
                  <label className="checkout-label" htmlFor="email">
                    Email address
                  </label>
                  <input
                    className="checkout-input"
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={!!errors['customer.email']}
                    aria-describedby={describedBy('customer.email')}
                  />
                  {errorFor('customer.email')}
                </div>

                <div className="checkout-field checkout-field-full">
                  <label className="checkout-label" htmlFor="phone">
                    Phone number
                  </label>
                  <input
                    className="checkout-input"
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="Your phone number"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    aria-invalid={!!errors['customer.phone']}
                    aria-describedby={describedBy('customer.phone')}
                  />
                  {errorFor('customer.phone')}
                </div>
              </div>
            </fieldset>

            {fulfillment === 'DELIVERY' && (
              <fieldset className="checkout-section">
                <legend>Delivery address</legend>
                <p className="checkout-hint checkout-legend-hint">
                  Where should we bring your order?
                </p>

                {errorFor('deliveryAddress')}

                <div className="checkout-field">
                  <label className="checkout-label" htmlFor="street">
                    Street address
                  </label>
                  <input
                    className="checkout-input"
                    id="street"
                    name="street"
                    type="text"
                    placeholder="Street address"
                    autoComplete="address-line1"
                    value={street}
                    onChange={(event) => setStreet(event.target.value)}
                    aria-invalid={!!errors['deliveryAddress.street']}
                    aria-describedby={describedBy('deliveryAddress.street')}
                  />
                  {errorFor('deliveryAddress.street')}
                </div>

                <div className="checkout-form-grid checkout-address-grid">
                  <div className="checkout-field">
                    <label className="checkout-label" htmlFor="city">
                      City
                    </label>
                    <input
                      className="checkout-input"
                      id="city"
                      name="city"
                      type="text"
                      placeholder="City"
                      autoComplete="address-level2"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      aria-invalid={!!errors['deliveryAddress.city']}
                      aria-describedby={describedBy('deliveryAddress.city')}
                    />
                    {errorFor('deliveryAddress.city')}
                  </div>

                  <div className="checkout-field">
                    <label className="checkout-label" htmlFor="state">
                      State
                    </label>
                    <input
                      className="checkout-input"
                      id="state"
                      name="state"
                      type="text"
                      placeholder="CO"
                      autoComplete="address-level1"
                      maxLength={2}
                      value={state}
                      onChange={(event) =>
                        setState(event.target.value.toUpperCase())
                      }
                      aria-invalid={!!errors['deliveryAddress.state']}
                      aria-describedby={describedBy('deliveryAddress.state')}
                    />
                    {errorFor('deliveryAddress.state')}
                  </div>

                  <div className="checkout-field">
                    <label className="checkout-label" htmlFor="zipCode">
                      ZIP code
                    </label>
                    <input
                      className="checkout-input"
                      id="zipCode"
                      name="zipCode"
                      type="text"
                      placeholder="ZIP"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      value={zipCode}
                      onChange={(event) => setZipCode(event.target.value)}
                      aria-invalid={!!errors['deliveryAddress.zipCode']}
                      aria-describedby={describedBy('deliveryAddress.zipCode')}
                    />
                    {errorFor('deliveryAddress.zipCode')}
                  </div>

                  <div className="checkout-field checkout-field-full">
                    <label className="checkout-label" htmlFor="unitOrApt">
                      Apartment, suite, or unit{' '}
                      <span className="checkout-optional">(optional)</span>
                    </label>
                    <input
                      className="checkout-input"
                      id="unitOrApt"
                      name="unitOrApt"
                      type="text"
                      placeholder="Apartment or unit number"
                      autoComplete="address-line2"
                      value={unitOrApt}
                      onChange={(event) => setUnitOrApt(event.target.value)}
                    />
                  </div>
                </div>
              </fieldset>
            )}

            <button
              type="submit"
              className="checkout-btn checkout-primary-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Checking your order…' : 'Review your order'}
              {!isSubmitting && <span aria-hidden="true"> →</span>}
            </button>

            <p className="checkout-secure-note">
              Your total will be calculated securely by the restaurant.
            </p>
          </div>

          <aside className="checkout-summary-card quote-box">
            <span className="checkout-step-label">YOUR ORDER</span>
            <h2>Almost there!</h2>
            <p className="muted">
              Your order summary will appear after you submit your details and
              we verify the prices.
            </p>

            <div className="checkout-summary-divider" />

            <div className="checkout-summary-note">
              <span className="checkout-summary-note-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Freshly made for you</strong>
                <p>We prepare your order with care.</p>
              </div>
            </div>

            <div className="checkout-summary-note">
              <span className="checkout-summary-note-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Clear pricing</strong>
                <p>
                  Your subtotal, fees, tax, and total are shown before payment.
                </p>
              </div>
            </div>

            <div className="checkout-summary-divider" />
            <p className="checkout-summary-footnote">
              Have a change of heart? You can return to your cart before
              reviewing your order.
            </p>
          </aside>
        </form>
      )}

      {step === 'review' && review && (
        <div className="checkout-layout checkout-review-layout">
          <section className="checkout-form-card card">
            <div className="checkout-card-heading">
              <div>
                <span className="checkout-step-label">STEP 02</span>
                <h2>Review your order</h2>
                <p className="muted">
                  Make sure everything looks right before continuing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep('details')}
                className="link-button checkout-back-link"
              >
                Edit details
              </button>
            </div>

            <div className="checkout-review-info">
              <h3>Order details</h3>
              <p>
                <strong>Name</strong>
                <span>
                  {review.customer.firstName} {review.customer.lastName}
                </span>
              </p>
              <p>
                <strong>Phone</strong>
                <span>{review.customer.phone}</span>
              </p>
              <p>
                <strong>Fulfillment</strong>
                <span>
                  {review.fulfillment === 'PICKUP' ? 'Pickup' : 'Delivery'}
                </span>
              </p>
              <p>
                <strong>Requested time</strong>
                <span>
                  {review.requestedTime
                    ? new Date(review.requestedTime).toLocaleString()
                    : 'As soon as possible'}
                </span>
              </p>

              {review.deliveryAddress && (
                <p>
                  <strong>Delivery address</strong>
                  <span>
                    {review.deliveryAddress.street}
                    {', '}
                    {review.deliveryAddress.city}
                    {', '}
                    {review.deliveryAddress.state}{' '}
                    {review.deliveryAddress.zipCode}
                  </span>
                </p>
              )}
            </div>

            <div className="checkout-items-card">
              <h3>Your items</h3>

              {review.quote.lines.map((line) => (
                <div className="checkout-review-item" key={line.index}>
                  <div className="checkout-review-item-name">
                    <span className="checkout-item-quantity">
                      {line.quantity}×
                    </span>
                    <span>
                      {line.name}
                      {line.sizeLabel ? ` (${line.sizeLabel})` : ''}
                    </span>
                  </div>
                  <strong>{formatCents(line.extendedPriceCents)}</strong>
                </div>
              ))}
            </div>
          </section>

          <aside className="checkout-summary-card quote-box checkout-price-card">
            <span className="checkout-step-label">ORDER SUMMARY</span>
            <h2>Price breakdown</h2>
            <p className="muted">
              These prices were returned by the restaurant’s server.
            </p>

            <div className="checkout-summary-divider" />

            <div className="row">
              <span>Subtotal</span>
              <span>{formatCents(review.quote.subtotalCents)}</span>
            </div>

            {review.quote.deliveryFeeCents > 0 && (
              <div className="row">
                <span>Delivery fee</span>
                <span>{formatCents(review.quote.deliveryFeeCents)}</span>
              </div>
            )}

            <div className="row">
              <span>Tax</span>
              <span>{formatCents(review.quote.taxCents)}</span>
            </div>

            {review.quote.tipCents > 0 && (
              <div className="row">
                <span>Tip</span>
                <span>{formatCents(review.quote.tipCents)}</span>
              </div>
            )}

            <div className="row grand-total checkout-grand-total">
              <span>Total</span>
              <span>{formatCents(review.quote.totalCents)}</span>
            </div>

            <button
              type="button"
              className="checkout-btn checkout-primary-button"
              onClick={handlePlaceOrder}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Placing your order…' : 'Continue to payment'}
              {!isSubmitting && <span aria-hidden="true"> →</span>}
            </button>

            <p className="checkout-secure-note">
              You can still go back and edit your details.
            </p>
          </aside>
        </div>
      )}

      {step === 'payment' && review && placed && (
        <section className="checkout-payment-card card">
          <button
            type="button"
            onClick={() => setStep('review')}
            className="link-button checkout-back-link"
          >
            ← Back to review
          </button>

          <span className="checkout-step-label">STEP 03</span>
          <h2>Payment</h2>
          <p className="muted">
            Order {placed.orderNumber}. Your card is charged{' '}
            <strong>{formatCents(placed.totalCents)}</strong> when you press Pay.
          </p>

          <CardPayment
            clientSecret={placed.clientSecret}
            amountLabel={formatCents(placed.totalCents)}
            returnPath={`/order-placed/${placed.orderRef}`}
            onPaid={handlePaid}
          />
        </section>
      )}
    </section>
  );
}

 
