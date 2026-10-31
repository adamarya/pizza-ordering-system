import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { fetchPaymentConfig } from '../lib/api';

// Loads Stripe.js once per page with the publishable key from the server. Resolves to null when the
// server reports that online payment is unavailable, so checkout can say so instead of failing.
let stripePromise: Promise<Stripe | null> | undefined;

export function getStripe(): Promise<Stripe | null> {
  stripePromise ??= fetchPaymentConfig()
    .then(({ publishableKey }) => loadStripe(publishableKey))
    .catch(() => null);
  return stripePromise;
}
