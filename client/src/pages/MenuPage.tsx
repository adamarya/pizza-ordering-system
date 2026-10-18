import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchMenu, type Menu } from '../lib/api';
import { formatCents } from '../lib/money';

// Menu page (S1-14, S1-16, PB-03). Categories are a keyboard-operable tab list in the manager's
// display order. The selected category is kept in the address, so returning from an item's
// configuration screen lands the customer back where they were (S1-15). Unavailable items stay
// on the menu, labeled in text rather than by color alone, and cannot be selected.
export function MenuPage() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    fetchMenu().then(setMenu).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p role="alert">The menu could not be loaded. {error}</p>;
  if (!menu) return <p aria-live="polite">Loading the menu…</p>;
  if (menu.categories.length === 0) return <p>The menu is empty right now.</p>;

  const selectedId = params.get('category') ?? menu.categories[0].id;
  const selectedIndex = Math.max(0, menu.categories.findIndex((c) => c.id === selectedId));

  const select = (index: number) => {
    setParams({ category: menu.categories[index].id }, { replace: true });
    tabRefs.current[index]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const last = menu.categories.length - 1;
    if (e.key === 'ArrowRight') select(selectedIndex === last ? 0 : selectedIndex + 1);
    else if (e.key === 'ArrowLeft') select(selectedIndex === 0 ? last : selectedIndex - 1);
    else if (e.key === 'Home') select(0);
    else if (e.key === 'End') select(last);
    else return;
    e.preventDefault();
  };

  return (
    <section className="page">
      <h1>Menu</h1>
      <div role="tablist" aria-label="Menu categories" className="tabs" onKeyDown={onKeyDown}>
        {menu.categories.map((c, i) => (
          <button
            key={c.id}
            ref={(el) => (tabRefs.current[i] = el)}
            role="tab"
            id={`tab-${c.id}`}
            aria-selected={i === selectedIndex}
            aria-controls={`panel-${c.id}`}
            tabIndex={i === selectedIndex ? 0 : -1}
            className="tab"
            onClick={() => select(i)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Every tab's aria-controls points at a panel that exists; inactive panels are hidden. */}
      {menu.categories.map((category, i) => (
        <div
          key={category.id}
          role="tabpanel"
          id={`panel-${category.id}`}
          aria-labelledby={`tab-${category.id}`}
          hidden={i !== selectedIndex}
        >
          {category.items.length === 0 && <p className="muted">Nothing in this category right now.</p>}
          <ul className="menu-grid">
            {category.items.map((item) => (
              <li key={item.id} className={`menu-card${item.isAvailable ? '' : ' unavailable'}`}>
                <div className="menu-card-body">
                  <h2>{item.name}</h2>
                  {!item.isAvailable && <span className="badge-muted">Currently unavailable</span>}
                  {item.description && <p className="muted">{item.description}</p>}
                  <p className="sizes">
                    {item.sizes.map((s) => (
                      <span key={s.id}>
                        {item.sizes.length > 1 ? `${s.label} ` : ''}
                        {formatCents(s.priceCents)}
                      </span>
                    ))}
                  </p>
                </div>
                {item.isAvailable ? (
                  <Link className="button" to={`/menu/${item.id}`} aria-label={`${item.isPizza ? 'Build' : 'Add'} ${item.name}`}>
                    {item.isPizza ? 'Build your pizza' : 'Add to order'}
                  </Link>
                ) : (
                  <span className="button button-disabled" aria-hidden="true">
                    Unavailable
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
