import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchOrderStatus, type OrderRecord } from '../lib/api';
import { formatCents } from '../lib/money';

const statusLabel: Record<OrderRecord['status'], string> = {
  RECEIVED: 'Received', IN_PROGRESS: 'In progress', READY: 'Ready for pickup / dispatch', COMPLETED: 'Completed',
};

export function OrderConfirmationPage() {
  const { reference = '' } = useParams();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchOrderStatus(reference).then(setOrder).catch((e: Error) => setError(e.message));
  }, [reference]);

  if (error) return <section className="page"><h1>Order confirmation</h1><p role="alert">{error}</p><Link to="/menu">Back to menu</Link></section>;
  if (!order) return <section className="page"><h1>Order confirmation</h1><p>Loading order…</p></section>;

  return (
    <section className="page">
      <div className="card order-confirmation">
        <p className="quote-status-badge">Order received</p>
        <h1>Thank you for your order!</h1>
        <p>Your order number is <strong>{order.orderNumber}</strong>.</p>
        <p>Placed: <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString()}</time></p>
        <p>Fulfillment: <strong>{order.fulfillment === 'PICKUP' ? 'Pickup' : 'Delivery'}</strong></p>
        <h2>Order contents</h2>
        <ul className="order-lines">
          {order.lines.map((line) => {
            let options: { size?: string; crust?: string | null; toppings?: { name: string; placement: string }[] } = {};
            try { options = JSON.parse(line.options); } catch { /* keep a safe empty display */ }
            return <li key={line.id}>
              <div><strong>{line.quantity} × {line.name}</strong>
                <p className="muted small">{[options.size, options.crust, ...(options.toppings ?? []).map((t) => t.name)].filter(Boolean).join(' · ')}</p>
                {line.instructions && <p className="muted small">Instructions: {line.instructions}</p>}
              </div>
              <strong>{formatCents(line.extendedPriceCents)}</strong>
            </li>;
          })}
        </ul>
        <div className="row"><span>Subtotal</span><span>{formatCents(order.subtotalCents)}</span></div>
        <div className="row"><span>Tax</span><span>{formatCents(order.taxCents)}</span></div>
        {order.deliveryFeeCents > 0 && <div className="row"><span>Delivery fee</span><span>{formatCents(order.deliveryFeeCents)}</span></div>}
        {order.tipCents > 0 && <div className="row"><span>Tip</span><span>{formatCents(order.tipCents)}</span></div>}
        <div className="row grand-total"><span>Order total</span><span>{formatCents(order.totalCents)}</span></div>
        <p role="status" className="muted small">
          Payment status: {order.paymentStatus === 'PAID' ? 'Paid' : order.paymentStatus === 'FAILED' ? 'Payment failed' : 'Not processed — this project demo does not charge a payment method.'}
        </p>
        <Link className="button" to={`/order/status/${reference}`}>Track order status</Link>
      </div>
    </section>
  );
}
