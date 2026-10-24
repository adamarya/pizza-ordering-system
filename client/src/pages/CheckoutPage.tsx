import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface CartLineItem {
  menuItemId: string;
  sizeId: string;
  crustId?: string;
  toppingIds?: string[];
  quantity: number;
  specialInstructions?: string;
}

interface ReviewPricing {
  subtotalCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  currency: string;
}

interface CheckoutPageProps {
  cartItems: CartLineItem[];
  tipCents?: number;
  CardPaymentComponent?: React.ComponentType<{
    totalCents: number;
    customer: any;
    onSuccess: (orderRef: string) => void;
  }>;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  cartItems,
  tipCents = 0,
  CardPaymentComponent,
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'details' | 'review' | 'payment'>('details');

  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [requestedTime, setRequestedTime] = useState('');

  // No prefilled personal details in repository
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Delivery Address
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('CO');
  const [zipCode, setZipCode] = useState('');
  const [unitOrApt, setUnitOrApt] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const payload = {
      fulfillmentType,
      requestedTime: requestedTime ? new Date(requestedTime).toISOString() : new Date().toISOString(),
      customer: { firstName, lastName, email, phone },
      deliveryAddress:
        fulfillmentType === 'delivery'
          ? { street, city, state, zipCode, unitOrApt: unitOrApt || undefined }
          : undefined,
      items: cartItems.map((item) => ({
        menuItemId: item.menuItemId,
        sizeId: item.sizeId,
        crustId: item.crustId,
        toppingIds: item.toppingIds || [],
        quantity: item.quantity,
        specialInstructions: item.specialInstructions,
      })),
      tipCents,
    };

    try {
      const res = await fetch('/api/checkout/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrors(json.errors || { general: json.error || 'Failed to validate checkout details.' });
      } else {
        setReviewData(json.review);
        setStep('review');
      }
    } catch {
      setErrors({ general: 'Network error communicating with the review service.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '2rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', margin: 0, color: '#111827' }}>
          Crust <span style={{ color: '#dc2626' }}>&</span> Co.
        </h1>
        <p style={{ color: '#6b7280', margin: '0.25rem 0' }}>Checkout</p>
      </header>

      {errors.general && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {errors.general}
        </div>
      )}

      {/* STEP 1: Details & Address */}
      {step === 'details' && (
        <form onSubmit={handleSubmitDetails} noValidate>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Fulfillment & Contact</h2>
            <button type="button" onClick={() => navigate('/cart')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer' }}>
              ← Return to Cart
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <label style={{ flex: 1, padding: '0.75rem', border: fulfillmentType === 'pickup' ? '2px solid #dc2626' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', textAlign: 'center' }}>
              <input type="radio" name="fulfillment" checked={fulfillmentType === 'pickup'} onChange={() => setFulfillmentType('pickup')} style={{ marginRight: '6px' }} />
              Pickup
            </label>
            <label style={{ flex: 1, padding: '0.75rem', border: fulfillmentType === 'delivery' ? '2px solid #dc2626' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', textAlign: 'center' }}>
              <input type="radio" name="fulfillment" checked={fulfillmentType === 'delivery'} onChange={() => setFulfillmentType('delivery')} style={{ marginRight: '6px' }} />
              Delivery
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="requestedTime" style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '4px' }}>Requested Date & Time</label>
            <input
              id="requestedTime"
              type="datetime-local"
              value={requestedTime}
              onChange={(e) => setRequestedTime(e.target.value)}
              required
              aria-invalid={!!errors.requestedTime}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
            {errors.requestedTime && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px' }}>{errors.requestedTime}</p>}
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
            <legend style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>Contact Information</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <input
                  type="text"
                  placeholder="First name"
                  aria-label="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                />
                {errors['customer.firstName'] && <p style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors['customer.firstName']}</p>}
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Last name"
                  aria-label="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                />
                {errors['customer.lastName'] && <p style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors['customer.lastName']}</p>}
              </div>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <input
                type="email"
                placeholder="Email address"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
              {errors['customer.email'] && <p style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors['customer.email']}</p>}
            </div>
            <div>
              <input
                type="tel"
                placeholder="Phone number"
                aria-label="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
              {errors['customer.phone'] && <p style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors['customer.phone']}</p>}
            </div>
          </fieldset>

          {fulfillmentType === 'delivery' && (
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
              <legend style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>Delivery Address</legend>
              <input
                type="text"
                placeholder="Street address"
                aria-label="Street address"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                required
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '0.5rem' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="City"
                  aria-label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                />
                <input
                  type="text"
                  placeholder="State"
                  aria-label="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                  maxLength={2}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                />
                <input
                  type="text"
                  placeholder="ZIP"
                  aria-label="ZIP Code"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                />
              </div>
              {errors['deliveryAddress.zipCode'] && <p style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errors['deliveryAddress.zipCode']}</p>}
              <input
                type="text"
                placeholder="Apt, Suite, Unit (optional)"
                aria-label="Apartment or unit"
                value={unitOrApt}
                onChange={(e) => setUnitOrApt(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
              />
            </fieldset>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            {isSubmitting ? 'Validating Order...' : 'Review Order'}
          </button>
        </form>
      )}

      {/* STEP 2: Server-Calculated Review */}
      {step === 'review' && reviewData && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Review Order Summary</h2>
            <button type="button" onClick={() => setStep('details')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer' }}>
              ← Edit Details
            </button>
          </div>

          <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 4px 0' }}><strong>Customer:</strong> {reviewData.customer.firstName} {reviewData.customer.lastName} ({reviewData.customer.phone})</p>
            <p style={{ margin: '0 0 4px 0' }}><strong>Fulfillment:</strong> {reviewData.fulfillmentType.toUpperCase()}</p>
            {reviewData.deliveryAddress && (
              <p style={{ margin: 0 }}><strong>Address:</strong> {reviewData.deliveryAddress.street}, {reviewData.deliveryAddress.city}, {reviewData.deliveryAddress.state} {reviewData.deliveryAddress.zipCode}</p>
            )}
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '1rem', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Items</h3>
            {reviewData.items.map((line: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '6px' }}>
                <span>{line.quantity}x {line.name || 'Pizza'}</span>
                <span>{formatCents(line.lineTotalCents || line.priceCents * line.quantity)}</span>
              </div>
            ))}
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.75rem 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>Subtotal</span><span>{formatCents(reviewData.pricing.subtotalCents)}</span>
            </div>
            {reviewData.pricing.deliveryFeeCents > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span>Delivery Fee</span><span>{formatCents(reviewData.pricing.deliveryFeeCents)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>Estimated Tax</span><span>{formatCents(reviewData.pricing.taxCents)}</span>
            </div>
            {reviewData.pricing.tipCents > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span>Tip</span><span>{formatCents(reviewData.pricing.tipCents)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem', marginTop: '0.5rem' }}>
              <span>Total</span><span>{formatCents(reviewData.pricing.totalCents)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep('payment')}
            style={{ width: '100%', padding: '0.85rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Continue to payment
          </button>
        </div>
      )}

      {/* STEP 3: Payment Transition for Adam's PR #7 */}
      {step === 'payment' && (
        <div>
          <button type="button" onClick={() => setStep('review')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '1rem' }}>
            ← Back to Review
          </button>
          {CardPaymentComponent ? (
            <CardPaymentComponent
              totalCents={reviewData.pricing.totalCents}
              customer={reviewData.customer}
              onSuccess={(orderRef) => alert(`Order ${orderRef} confirmed!`)}
            />
          ) : (
            <div style={{ border: '2px dashed #9ca3af', padding: '2rem', textAlign: 'center', borderRadius: '6px', color: '#4b5563' }}>
              <h3>&lt;CardPayment /&gt; Mount Point</h3>
              <p>Ready for PR #7 integration. Verified Total: <strong>{formatCents(reviewData?.pricing?.totalCents)}</strong></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
