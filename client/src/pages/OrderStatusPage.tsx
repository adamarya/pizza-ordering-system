import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchOrderStatus, type OrderRecord } from '../lib/api';

const stages: { value: OrderRecord['status']; label: string; detail: string }[] = [
  { value: 'RECEIVED', label: 'Received', detail: 'The restaurant has received your order.' },
  { value: 'IN_PROGRESS', label: 'In progress', detail: 'The kitchen is preparing your order.' },
  { value: 'READY', label: 'Ready', detail: 'Your order is ready for pickup or dispatch.' },
  { value: 'COMPLETED', label: 'Completed', detail: 'Your order has been completed.' },
];

export function OrderStatusPage() {
  const { reference = '' } = useParams();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => fetchOrderStatus(reference).then((data) => { if (active) { setOrder(data); setError(''); } })
      .catch((e: Error) => { if (active) setError(e.message); });
    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, [reference]);

  if (error) return <section className="page"><h1>Order status</h1><p role="alert">{error}</p><p>Check that you used the complete private order link from your confirmation.</p></section>;
  if (!order) return <section className="page"><h1>Order status</h1><p>Loading order status…</p></section>;
  const activeIndex = stages.findIndex((stage) => stage.value === order.status);
  return (
    <section className="page">
      <h1>Order status</h1>
      <p>Order <strong>{order.orderNumber}</strong> · updates automatically every 15 seconds.</p>
      <ol className="status-steps">
        {stages.map((stage, index) => (
          <li key={stage.value} className={index <= activeIndex ? 'status-step is-current' : 'status-step'}>
            <span className="status-dot" aria-hidden="true">{index < activeIndex ? '✓' : index + 1}</span>
            <div><h2>{stage.label}</h2><p>{stage.detail}</p></div>
            {index === activeIndex && <span className="status-current-label">Current</span>}
          </li>
        ))}
      </ol>
      <p className="muted small">Keep this private link to view your order. Anyone with the complete reference can access its status and contents.</p>
      <Link to={`/order/confirmation/${reference}`}>View order confirmation</Link>
    </section>
  );
}
