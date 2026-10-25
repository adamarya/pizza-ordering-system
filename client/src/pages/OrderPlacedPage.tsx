import { useEffect } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useCart } from '../cart/CartContext';

// Shown after Stripe accepts the payment (S2-13). The customer arrives here from the card form, or
// from Stripe itself when a payment method needed a redirect (then the URL carries redirect_status).
// This page only thanks the customer: the order is marked received from Stripe's signed webhook.
// The full confirmation screen with the order contents is S2-18, and the status page is S2-20; both
// take over this route when they are built.
export function OrderPlacedPage() {
  const { orderRef } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const { dispatch } = useCart();
  const orderNumber = (location.state as { orderNumber?: number } | null)?.orderNumber;
  const redirectStatus = params.get('redirect_status');
  const failed = redirectStatus !== null && redirectStatus !== 'succeeded';

  useEffect(() => {
    if (redirectStatus === 'succeeded') dispatch({ type: 'clear' });
  }, [redirectStatus, dispatch]);

  if (failed) {
    return (
      <section className="page">
        <h1>Payment not completed</h1>
        <p role="alert">The payment did not go through, so the order was not placed. Your cart is saved.</p>
        <Link className="button" to="/cart">
          Return to cart
        </Link>
      </section>
    );
  }
  return (
    <section className="page">
      <h1>Thank you for your order</h1>
      <p>
        We received your payment{orderNumber ? ` for order ${orderNumber}` : ''}, and the order is on its way to the
        kitchen.
      </p>
      <p>
        Your order reference is <strong>{orderRef}</strong>. Keep it to check on your order.
      </p>
      <Link className="button" to="/menu">
        Back to the menu
      </Link>
    </section>
  );
}
