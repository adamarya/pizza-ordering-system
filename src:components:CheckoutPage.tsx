import React, { useState } from 'react';

export interface CartItem {
  id: string | number;
  name: string;
  price: number;
  quantity: number;
}

interface ReviewPricing {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  tip: number;
  total: number;
}

interface CheckoutPageProps {
  cart: CartItem[];
  promoCode?: string;
  tipAmount?: number;
  onBackToCart: () => void;
  // CardPayment component from PR #7 (passed in or rendered when review is complete)
  CardPaymentComponent?: React.ComponentType<{
    total: number;
    customer: any;
    onSuccess: (orderRef: string) => void;
  }>;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  cart,
  promoCode = '',
  tipAmount = 0,
  onBackToCart,
  CardPaymentComponent,
}) => {
  const [step, setStep] = useState<'details' | 'review' | 'payment'>('details');

  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [requestedTime, setRequestedTime] = useState('18:00');

  const [firstName, setFirstName] = useState('Emmanuella');
  const [lastName, setLastName] = useState('Ahinkrah');
  const [email, setEmail] = useState('emmanuella@example.com');
  const [phone, setPhone] = useState('555-0199');

  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [unitOrApt, setUnitOrApt] = useState('');

  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerErrors({});
    setIsSubmitting(true);

    const payload = {
      fulfillmentType,
      requestedTime: `${new Date().toISOString().split('T')[0]}T${requestedTime}:00`,
      customer: { firstName, lastName, email, phone },
      deliveryAddress: fulfillmentType === 'delivery' ? { street, city, postalCode, unitOrApt } : undefined,
      cartItems: cart,
      promoCode: promoCode || undefined,
      tipAmount,
    };

    try {
      const res = await fetch('/api/checkout/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setServerErrors(data.errors || { general: 'Failed to validate checkout details.' });
      } else {
        setReviewData(data.review);
        setStep('review');
      }
    } catch (err) {
      setServerErrors({ general: 'Network error communicating with the review server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '2rem auto', fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#111827' }}>
          Crust <span style={{ color: '#dc2626' }}>&</span> Co.
        </h1>
        <p style={{ color: '#6b7280', margin: '0.25rem 0 0 0' }}>Order for: {firstName} {lastName}</p>
      </div>

      {serverErrors.general && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {serverErrors.general}
        </div>
      )}

      {/* STEP 1: Details & Fulfillment */}
      {step === 'details' && (
        <form onSubmit={handleReviewSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>1. Fulfillment & Details</h2>
            <button type="button" onClick={onBackToCart} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer' }}>
              ← Back to cart
            </button>
          </div>

          {/* Fulfillment Toggle */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ flex: 1, padding: '0.75rem', border: fulfillmentType === 'pickup' ? '2px solid #dc2626' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', textAlign: 'center' }}>
              <input type="radio" name="fulfillment" checked={fulfillmentType === 'pickup'} onChange={() => setFulfillmentType('pickup')} style={{ marginRight: '6px' }} />
              Pickup
            </label>
            <label style={{ flex: 1, padding: '0.75rem', border: fulfillmentType === 'delivery' ? '2px solid #dc2626' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', textAlign: 'center' }}>
              <input type="radio" name="fulfillment" checked={fulfillmentType === 'delivery'} onChange={() => setFulfillmentType('delivery')} style={{ marginRight: '6px' }} />
              Delivery (+$3.99)
            </label>
          </div>

          {/* Time */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '4px' }}>Requested Time</label>
            <input type="time" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
            {serverErrors.requestedTime && <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>{serverErrors.requestedTime}</span>}
          </div>

          {/* Contact Details */}
          <h3 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem 0' }}>Contact Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div>
              <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
              {serverErrors['customer.firstName'] && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{serverErrors['customer.firstName']}</span>}
            </div>
            <div>
              <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
              {serverErrors['customer.lastName'] && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{serverErrors['customer.lastName']}</span>}
            </div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
            {serverErrors['customer.email'] && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{serverErrors['customer.email']}</span>}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <input type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
            {serverErrors['customer.phone'] && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{serverErrors['customer.phone']}</span>}
          </div>

          {/* Delivery Address fields */}
          {fulfillmentType === 'delivery' && (
            <div>
              <h3 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem 0' }}>Delivery Address</h3>
              <input type="text" placeholder="Street Address" value={street} onChange={(e) => setStreet(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '0.5rem' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                <input type="text" placeholder="Postal Code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
              </div>
              {serverErrors['deliveryAddress.postalCode'] && <span style={{ color: '#dc2626', fontSize: '0.75rem', display: 'block', marginBottom: '0.5rem' }}>{serverErrors['deliveryAddress.postalCode']}</span>}
              <input type="text" placeholder="Apt / Suite / Unit (Optional)" value={unitOrApt} onChange={(e) => setUnitOrApt(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '1rem' }} />
            </div>
          )}

          <button type="submit" disabled={isSubmitting} style={{ width: '100%', padding: '0.75rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            {isSubmitting ? 'Validating order...' : 'Review Order'}
          </button>
        </form>
      )}

      {/* STEP 2: Review Screen */}
      {step === 'review' && reviewData && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>2. Review Your Order</h2>
            <button type="button" onClick={() => setStep('details')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer' }}>
              ← Edit details
            </button>
          </div>

          <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
            <p><strong>Customer:</strong> {reviewData.customer.firstName} {reviewData.customer.lastName}</p>
            <p><strong>Method:</strong> {reviewData.fulfillmentType.toUpperCase()} at {reviewData.requestedTime.split('T')[1]?.slice(0, 5) || reviewData.requestedTime}</p>
            {reviewData.deliveryAddress && (
              <p><strong>Address:</strong> {reviewData.deliveryAddress.street}, {reviewData.deliveryAddress.city} {reviewData.deliveryAddress.postalCode}</p>
            )}
          </div>

          {/* Repriced Order Summary */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '1rem', marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>Order Summary</h4>
            {reviewData.cartItems.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                <span>{item.quantity}x {item.name}</span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>Subtotal</span><span>${reviewData.pricing.subtotal.toFixed(2)}</span>
            </div>
            {reviewData.pricing.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#16a34a' }}>
                <span>Discount</span><span>-${reviewData.pricing.discount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>Delivery Fee</span><span>${reviewData.pricing.deliveryFee.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>Tax</span><span>${reviewData.pricing.tax.toFixed(2)}</span>
            </div>
            {reviewData.pricing.tip > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span>Tip</span><span>${reviewData.pricing.tip.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '0.5rem' }}>
              <span>Total</span><span>${reviewData.pricing.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Review ends with "Continue to payment" as Adam specified */}
          <button
            type="button"
            onClick={() => setStep('payment')}
            style={{ width: '100%', padding: '0.85rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Continue to payment
          </button>
        </div>
      )}

      {/* STEP 3: Payment Transition (Adam's S2-14 / PR #7 card component) */}
      {step === 'payment' && (
        <div>
          <button type="button" onClick={() => setStep('review')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginBottom: '1rem' }}>
            ← Back to review
          </button>

          {CardPaymentComponent ? (
            <CardPaymentComponent
              total={reviewData.pricing.total}
              customer={reviewData.customer}
              onSuccess={(orderRef) => alert(`Order ${orderRef} successfully placed!`)}
            />
          ) : (
            <div style={{ border: '2px dashed #9ca3af', padding: '2rem', textAlign: 'center', borderRadius: '6px', color: '#4b5563' }}>
              <h3>&lt;CardPayment /&gt; Hook</h3>
              <p>Ready for Adam's PR #7 component (S2-14).</p>
              <p>Amount to charge: <strong>${reviewData?.pricing?.total?.toFixed(2)}</strong></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
