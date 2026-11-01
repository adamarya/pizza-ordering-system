import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchOrderStatus, type CustomerOrder, type OrderStatus } from '../lib/orderApi';
import './OrderPages.css';

// Customer order status (S2-20, PB-08). Designed by Aaron Aguirre; moved onto the status endpoint
// from #17. Reachable only with the order's unguessable reference, and refreshed every 15 seconds,
// so a change the kitchen makes (S2-23) shows up without reloading.

const stages: { value: OrderStatus; label: string; detail: string }[] = [
  { value: 'RECEIVED', label: 'Received', detail: 'The restaurant has your order.' },
  { value: 'IN_PROGRESS', label: 'In progress', detail: 'The kitchen is preparing your order.' },
  { value: 'READY', label: 'Ready', detail: 'Your order is ready for pickup or on its way.' },
  { value: 'COMPLETED', label: 'Completed', detail: 'Your order is complete. Enjoy!' },
];

const notices: Partial<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: 'We are still confirming your payment. This page updates when it is confirmed.',
  PAYMENT_FAILED: 'The payment did not go through, so the kitchen has not received this order.',
  CANCELLED: 'This order was cancelled.',
  EXPIRED: 'This order was not paid for in time and has expired.',
};

export function OrderStatusPage() {
  const { reference = '' } = useParams();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchOrderStatus(reference)
        .then((data) => {
          if (active) {
            setOrder(data);
            setError('');
          }
        })
        .catch((e: Error) => active && setError(e.message));
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [reference]);

  if (error && !order) {
    return (
      <section className="page">
        <h1>Order status</h1>
        <p role="alert" className="error-text">{error}</p>
        <p>Check that you used the complete link from your order confirmation.</p>
      </section>
    );
  }
  if (!order) return <section className="page"><h1>Order status</h1><p>Loading order status…</p></section>;

  const activeIndex = stages.findIndex((stage) => stage.value === order.status);
  const notice = notices[order.status];
  return (
    <section className="page order-status">
      <h1>Order status</h1>
      <p>
        Order <strong>{order.orderNumber}</strong>. This page updates every 15 seconds.
      </p>
      {notice ? (
        <p role="status" className="order-notice">{notice}</p>
      ) : (
        <ol className="status-steps" aria-label="Order progress">
          {stages.map((stage, index) => (
            <li
              key={stage.value}
              className={index === activeIndex ? 'status-step is-current' : index < activeIndex ? 'status-step is-done' : 'status-step'}
              aria-current={index === activeIndex ? 'step' : undefined}
            >
              <span className="status-dot" aria-hidden="true">{index < activeIndex ? '✓' : index + 1}</span>
              <div>
                <h2>{stage.label}</h2>
                <p>{stage.detail}</p>
              </div>
              {index === activeIndex && <span className="status-current-label">Current</span>}
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">Keep this link private: anyone with it can see this order.</p>
      <Link to={`/order/confirmation/${reference}`}>View your order confirmation</Link>
    </section>
  );
}
