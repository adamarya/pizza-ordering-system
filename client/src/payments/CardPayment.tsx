import { useEffect, useState, type FormEvent } from 'react';
import type { Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getStripe } from './stripe';

// Card entry for checkout (S2-13, PB-07). The card number, expiry, and security code are typed only
// into fields that Stripe serves in its own frames (the Payment Element), so card data never reaches
// this site or its server (PB-13). This component confirms the payment that the server created for
// the order (S2-14) and reports the result; the order itself is recorded from Stripe's signed
// webhook, not from this page, so a customer who closes the tab after paying still has an order.

export interface CardPaymentProps {
  /** client_secret of the payment the server created for this order. */
  clientSecret: string;
  /** Total the server charged, already formatted, e.g. "$52.69". */
  amountLabel: string;
  /** Where Stripe returns the customer after a payment method that needs a redirect. */
  returnPath: string;
  /** Called with the payment reference once Stripe accepts the payment. */
  onPaid: (paymentRef: string) => void;
}

export function CardPayment(props: CardPaymentProps) {
  const [stripe, setStripe] = useState<Stripe | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    getStripe().then((s) => live && setStripe(s));
    return () => {
      live = false;
    };
  }, []);

  if (stripe === undefined) return <p aria-live="polite">Loading secure payment…</p>;
  if (stripe === null) {
    return (
      <p role="alert">
        Online payment is not available right now. Your cart is saved; please try again in a few minutes.
      </p>
    );
  }
  return (
    <Elements stripe={stripe} options={{ clientSecret: props.clientSecret }}>
      <CardForm {...props} />
    </Elements>
  );
}

function CardForm({ amountLabel, returnPath, onPaid }: CardPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || paying) return;
    setPaying(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: new URL(returnPath, window.location.origin).toString() },
      redirect: 'if_required',
    });
    if (result.error) {
      // A declined card or invalid field: the cart and the details already entered stay as they are.
      setError(result.error.message ?? 'The payment did not go through. Please check the card details.');
      setPaying(false);
      return;
    }
    const status = result.paymentIntent?.status;
    if (status === 'succeeded' || status === 'processing' || status === 'requires_capture') {
      onPaid(result.paymentIntent!.id);
    } else {
      setError('The payment was not completed. Please try again.');
      setPaying(false);
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby="card-heading" className="card-payment">
      <h2 id="card-heading">Payment</h2>
      <PaymentElement onReady={() => setReady(true)} />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button type="submit" className="button" disabled={!stripe || !elements || !ready || paying}>
        {paying ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
    </form>
  );
}
