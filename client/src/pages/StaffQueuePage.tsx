import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  NotSignedIn,
  fetchMe,
  fetchQueue,
  moveOrder,
  type KitchenStatus,
  type Me,
  type OpenStatus,
  type QueueOrder,
} from '../lib/staffApi';
import './StaffQueuePage.css';

// Staff order queue (S2-22, S2-23) for the API in #26 and #32. Open orders appear oldest first, the
// order they were received, and staff move each one a single step: received, in progress, ready,
// completed. The server decides what is allowed and records who made each change; this page only
// offers the next step. It does not refresh by itself (S2-24): press Refresh to see new orders.

const NEXT_STEP: Record<OpenStatus, { to: KitchenStatus; label: string }> = {
  RECEIVED: { to: 'IN_PROGRESS', label: 'Start' },
  IN_PROGRESS: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'COMPLETED', label: 'Mark completed' },
};
const STATUS_WORDS: Record<OpenStatus, string> = {
  RECEIVED: 'Received',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
};
const PLACEMENT_WORDS = { WHOLE: '', LEFT: ' (left half)', RIGHT: ' (right half)' } as const;

type Load =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'error'; message: string }
  | { state: 'ready'; me: Me; orders: QueueOrder[] };

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function StaffQueuePage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      const orders = await fetchQueue();
      setLoad({ state: 'ready', me, orders });
    } catch (err) {
      if (err instanceof NotSignedIn) setLoad({ state: 'signed-out' });
      else setLoad({ state: 'error', message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.state === 'loading') return <section className="page"><h1>Order queue</h1><p>Loading…</p></section>;
  if (load.state === 'signed-out') {
    return (
      <section className="page">
        <h1>Order queue</h1>
        <p role="alert">Please sign in as a staff member or the manager to see the order queue.</p>
        <p>
          <Link className="button" to="/sign-in?next=/staff/queue">
            Staff sign-in
          </Link>
        </p>
      </section>
    );
  }
  if (load.state === 'error') {
    return <section className="page"><h1>Order queue</h1><p role="alert" className="error-text">{load.message}</p></section>;
  }

  const { me, orders } = load;

  async function step(order: QueueOrder) {
    const next = NEXT_STEP[order.status];
    setBusy(true);
    setMessage(null);
    try {
      await moveOrder(me, order.orderNumber, next.to);
      setMessage({ kind: 'ok', text: `Order ${order.orderNumber} is now ${next.to === 'COMPLETED' ? 'completed' : STATUS_WORDS[next.to as OpenStatus].toLowerCase()}.` });
    } catch (err) {
      if (err instanceof NotSignedIn) {
        setLoad({ state: 'signed-out' });
        return;
      }
      setMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
    await refresh(); // always show what the server now has, including after a refused change
  }

  return (
    <section className="page staff-queue">
      <h1>Order queue</h1>
      <p className="muted">
        Signed in as {me.user.username}. Oldest orders first. Each order moves one step at a time.
      </p>
      <p>
        <button type="button" className="button" onClick={() => void refresh()} disabled={busy}>
          Refresh
        </button>
      </p>
      <div role="status" className={message?.kind === 'ok' ? 'queue-ok' : 'error-text'}>
        {message?.kind === 'ok' ? message.text : null}
      </div>
      {message?.kind === 'error' && <p role="alert" className="error-text">{message.text}</p>}

      {orders.length === 0 ? (
        <p>No open orders right now.</p>
      ) : (
        <ul className="queue-list">
          {orders.map((order) => {
            const next = NEXT_STEP[order.status];
            return (
              <li key={order.orderNumber} className="card queue-order">
                <div className="queue-head">
                  <h2>Order {order.orderNumber}</h2>
                  <span className={`queue-badge queue-${order.status.toLowerCase()}`}>Status: {STATUS_WORDS[order.status]}</span>
                </div>
                <p className="muted">
                  {order.customerName} · {order.fulfillment === 'PICKUP' ? 'Pickup' : 'Delivery'} ·{' '}
                  {order.requestedTime ? `for ${time(order.requestedTime)}` : 'as soon as possible'} · received {time(order.createdAt)}
                </p>
                <ul className="queue-lines">
                  {order.lines.map((line, i) => (
                    <li key={i}>
                      <strong>
                        {line.quantity} × {line.itemName}
                      </strong>{' '}
                      ({[line.sizeLabel, line.crustName].filter(Boolean).join(', ')})
                      {line.toppings.length > 0 && (
                        <div>{line.toppings.map((t) => `${t.name}${PLACEMENT_WORDS[t.placement]}`).join(', ')}</div>
                      )}
                      {line.instructions && <div className="queue-note">Note: {line.instructions}</div>}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  aria-label={`${next.label}: order ${order.orderNumber}`}
                  onClick={() => void step(order)}
                >
                  {next.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
