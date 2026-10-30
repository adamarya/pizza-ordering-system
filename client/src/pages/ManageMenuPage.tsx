import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatCents } from '../lib/money';
import {
  NotSignedIn,
  centsToDollars,
  dollarsToCents,
  fetchAdminMenu,
  fetchMe,
  setAvailability,
  setCrustSurcharge,
  setItemRetired,
  setSizePrice,
  setToppingPrice,
  type AdminMenu,
  type Me,
} from '../lib/staffApi';
import './ManageMenuPage.css';

// Menu maintenance screen (S2-27, S2-28; PB-10) for the API in #20. The manager changes prices,
// marks items available or unavailable, and retires or restores them. Store staff see the same
// list but can only switch availability during a shift. The server enforces both rules; this page
// only hides the controls a role cannot use. Customers see a change on their next menu load.

type Load = { state: 'loading' } | { state: 'signed-out' } | { state: 'error'; message: string } | { state: 'ready'; me: Me; menu: AdminMenu };

export function ManageMenuPage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      const menu = await fetchAdminMenu();
      setLoad({ state: 'ready', me, menu });
    } catch (err) {
      if (err instanceof NotSignedIn) setLoad({ state: 'signed-out' });
      else setLoad({ state: 'error', message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.state === 'loading') return <section className="page"><h1>Manage the menu</h1><p>Loading…</p></section>;
  if (load.state === 'signed-out') {
    return (
      <section className="page">
        <h1>Manage the menu</h1>
        <p role="alert">Please sign in as the manager or a staff member to manage the menu.</p>
        <p>
          <Link className="button" to="/sign-in?next=/manage/menu">
            Staff sign-in
          </Link>
        </p>
      </section>
    );
  }
  if (load.state === 'error') {
    return <section className="page"><h1>Manage the menu</h1><p role="alert" className="error-text">{load.message}</p></section>;
  }

  const { me, menu } = load;
  const isManager = me.user.role === 'MANAGER';

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setStatus(null);
    try {
      await work();
      setStatus({ kind: 'ok', text: `${done} Customers see it on their next menu load.` });
      await refresh();
    } catch (err) {
      if (err instanceof NotSignedIn) setLoad({ state: 'signed-out' });
      else setStatus({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page manage-menu">
      <h1>Manage the menu</h1>
      <p className="muted">
        Signed in as {me.user.username} ({isManager ? 'manager' : 'staff'}).{' '}
        {isManager
          ? 'You can change prices, switch availability, and retire or restore items.'
          : 'Staff can switch availability during a shift; prices and retiring items stay with the manager.'}
      </p>
      <p role={status?.kind === 'error' ? 'alert' : 'status'} className={status?.kind === 'error' ? 'error-text' : 'manage-ok'}>
        {status?.text ?? ''}
      </p>

      {menu.categories.map((category) => (
        <section key={category.id} className="manage-section" aria-labelledby={`cat-${category.id}`}>
          <h2 id={`cat-${category.id}`}>
            {category.name}
            {category.isRetired && <span className="manage-badge">Retired category</span>}
          </h2>
          {category.menuItems.length === 0 && <p className="muted">No items.</p>}
          {category.menuItems.map((item) => (
            <article key={item.id} className="card manage-item" aria-label={item.name}>
              <div className="manage-item-head">
                <h3>{item.name}</h3>
                {!item.isAvailable && <span className="manage-badge">Unavailable</span>}
                {item.isRetired && <span className="manage-badge manage-badge-retired">Retired</span>}
              </div>
              <ul className="manage-sizes">
                {item.sizes.map((size) => (
                  <li key={size.id}>
                    {isManager ? (
                      <PriceForm
                        label={`${item.name}, ${size.label}`}
                        shortLabel={size.label}
                        cents={size.priceCents}
                        disabled={busy}
                        onSave={(cents) => run(() => setSizePrice(me, size.id, cents), `${item.name} ${size.label} is now ${formatCents(cents)}.`)}
                        onInvalid={() => setStatus({ kind: 'error', text: 'Enter a price like 12.99, with no more than two decimal places.' })}
                      />
                    ) : (
                      <span>{size.label}: {formatCents(size.priceCents)}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="manage-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy || item.isRetired}
                  onClick={() => run(() => setAvailability(me, 'item', item.id, !item.isAvailable), `${item.name} is now ${item.isAvailable ? 'unavailable' : 'available'}.`)}
                >
                  {item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                </button>
                {isManager && (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => run(() => setItemRetired(me, item.id, !item.isRetired), `${item.name} is now ${item.isRetired ? 'back on the menu' : 'retired'}.`)}
                  >
                    {item.isRetired ? 'Restore to menu' : 'Retire item'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}

      <section className="manage-section" aria-labelledby="crusts-heading">
        <h2 id="crusts-heading">Crusts</h2>
        <ul className="manage-options">
          {menu.crusts.map((crust) => (
            <li key={crust.id} className="card">
              <strong>{crust.name}</strong>
              {!crust.isAvailable && <span className="manage-badge">Unavailable</span>}
              {isManager ? (
                <PriceForm
                  label={`${crust.name} surcharge`}
                  shortLabel="Surcharge"
                  cents={crust.surchargeCents}
                  disabled={busy}
                  onSave={(cents) => run(() => setCrustSurcharge(me, crust.id, cents), `${crust.name} surcharge is now ${formatCents(cents)}.`)}
                  onInvalid={() => setStatus({ kind: 'error', text: 'Enter a price like 2.50, with no more than two decimal places.' })}
                />
              ) : (
                <span> +{formatCents(crust.surchargeCents)}</span>
              )}
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() => run(() => setAvailability(me, 'crust', crust.id, !crust.isAvailable), `${crust.name} is now ${crust.isAvailable ? 'unavailable' : 'available'}.`)}
              >
                {crust.isAvailable ? 'Mark unavailable' : 'Mark available'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="manage-section" aria-labelledby="toppings-heading">
        <h2 id="toppings-heading">Toppings</h2>
        <ul className="manage-options">
          {menu.toppings.map((topping) => (
            <li key={topping.id} className="card">
              <strong>{topping.name}</strong>
              {!topping.isAvailable && <span className="manage-badge">Unavailable</span>}
              {isManager ? (
                <PriceForm
                  label={`${topping.name} price`}
                  shortLabel="Price"
                  cents={topping.priceCents}
                  disabled={busy}
                  onSave={(cents) => run(() => setToppingPrice(me, topping.id, cents), `${topping.name} is now ${formatCents(cents)}.`)}
                  onInvalid={() => setStatus({ kind: 'error', text: 'Enter a price like 1.25, with no more than two decimal places.' })}
                />
              ) : (
                <span> {formatCents(topping.priceCents)}</span>
              )}
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() => run(() => setAvailability(me, 'topping', topping.id, !topping.isAvailable), `${topping.name} is now ${topping.isAvailable ? 'unavailable' : 'available'}.`)}
              >
                {topping.isAvailable ? 'Mark unavailable' : 'Mark available'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function PriceForm(props: {
  label: string;
  shortLabel: string;
  cents: number;
  disabled: boolean;
  onSave: (cents: number) => void;
  onInvalid: () => void;
}) {
  const [text, setText] = useState(centsToDollars(props.cents));
  useEffect(() => setText(centsToDollars(props.cents)), [props.cents]);
  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = dollarsToCents(text);
    if (cents === null) return props.onInvalid();
    if (cents !== props.cents) props.onSave(cents);
  }
  return (
    <form className="manage-price" onSubmit={submit}>
      <label>
        <span>{props.shortLabel} $</span>
        <input aria-label={`${props.label} price in dollars`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit" className="button-secondary" disabled={props.disabled}>
        Save
      </button>
    </form>
  );
}
