import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatCents } from '../lib/money';
import { describeLine, fetchOrderStatus, type CustomerOrder } from '../lib/orderApi';
import './OrderPages.css';

// Order confirmation (S2-18, PB-08). Designed by Aaron Aguirre; moved onto the order tables from #12
// and the status endpoint from #17. Shows the order number, the contents, the amount charged, the
// fulfillment method, and the time, from the server's copy of the order.

function paymentText(order: CustomerOrder) {
  if (order.paymentStatus === 'PAID') {
    return order.card ? `Paid by ${order.card.brand ?? 'card'} ending in ${order.card.last4}.` : 'Paid.';
  }
  if (order.paymentStatus === 'FAILED') return 'The payment did not go through, so this order was not placed.';
  return 'Your payment is being confirmed. This page updates when it is.';
}

export function OrderConfirmationPage() {
  const { reference = '' } = useParams();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchOrderStatus(reference)
      .then((data) => active && setOrder(data))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [reference]);

  // Stripe's confirmation can arrive a few seconds after the customer lands here, so check again
  // every 5 seconds while the payment is still being confirmed.
  const pending = order?.paymentStatus === 'PENDING';
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      fetchOrderStatus(reference).then(setOrder).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [reference, pending]);

  if (error) {
    return (
      <section className="page">
        <h1>Order confirmation</h1>
        <p role="alert" className="error-text">{error}</p>
        <Link to="/menu">Back to the menu</Link>
      </section>
    );
  }
  if (!order) return <section className="page"><h1>Order confirmation</h1><p>Loading your order…</p></section>;

  return (
    <section className="page">
      <div className="card order-confirmation">
        <p className="order-badge">{order.paymentStatus === 'PAID' ? 'Order received' : order.paymentStatus === 'FAILED' ? 'Payment failed' : 'Confirming payment'}</p>
        <h1>{order.paymentStatus === 'FAILED' ? 'Your order was not placed' : 'Thank you for your order'}</h1>
        <p>
          Your order number is <strong>{order.orderNumber}</strong>.
        </p>
        <p>
          Placed <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString()}</time>.{' '}
          {order.fulfillment === 'PICKUP' ? 'Pickup' : 'Delivery'}
          {order.requestedTime ? `, requested for ${new Date(order.requestedTime).toLocaleString()}` : ', as soon as possible'}.
        </p>
        <h2>Order contents</h2>
        <ul className="order-lines">
          {order.lines.map((line) => (
            <li key={line.position}>
              <div>
                <strong>
                  {line.quantity} × {line.name}
                </strong>
                <p className="muted small">{describeLine(line)}</p>
                {line.instructions && <p className="muted small">Instructions: {line.instructions}</p>}
              </div>
              <strong>{formatCents(line.extendedPriceCents)}</strong>
            </li>
          ))}
        </ul>
        <div className="row"><span>Subtotal</span><span>{formatCents(order.subtotalCents)}</span></div>
        {order.deliveryFeeCents > 0 && <div className="row"><span>Delivery fee</span><span>{formatCents(order.deliveryFeeCents)}</span></div>}
        <div className="row"><span>Tax</span><span>{formatCents(order.taxCents)}</span></div>
        {order.tipCents > 0 && <div className="row"><span>Tip</span><span>{formatCents(order.tipCents)}</span></div>}
        <div className="row grand-total"><span>Total</span><span>{formatCents(order.totalCents)}</span></div>
        <p role="status" className="muted small">{paymentText(order)}</p>
        {order.paymentStatus === 'FAILED' ? (
          <Link className="button" to="/cart">Return to cart</Link>
        ) : (
          <Link className="button" to={`/order/status/${reference}`}>Track your order</Link>
        )}
        <p className="muted small">Keep this page's link private: anyone with it can see this order.</p>
      </div>
    </section>
  );
}
