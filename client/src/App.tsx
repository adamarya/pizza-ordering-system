import { NavLink, Route, Routes } from 'react-router-dom';
import { CartProvider, useCart } from './cart/CartContext';
import { HealthBadge } from './components/HealthBadge';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ItemPage } from './pages/ItemPage';
import { MenuPage } from './pages/MenuPage';

// Shared page shell and navigation (S1-11, PB-15), with the Sprint 1 screens:
//   /menu           Menu page (S1-14, S1-16)
//   /menu/:itemId   Item configuration (S1-15, S1-19, S1-20, S1-22)
//   /cart           Cart screen (S1-24)
export function App() {
  return (
    <CartProvider>
      <Shell />
    </CartProvider>
  );
}

function Shell() {
  const { cart } = useCart();
  const count = cart.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <NavLink to="/" className="brand" aria-label="Crust and Co. home">
          CRUST <span className="ampersand">&amp;</span> CO.
        </NavLink>
        <nav aria-label="Main">
          <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/cart" aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
            Cart{count > 0 && <span className="cart-count">{count}</span>}
          </NavLink>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/menu/:itemId" element={<ItemPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <HealthBadge />
      </footer>
    </div>
  );
}

function Home() {
  return (
    <section className="page hero">
      <h1>Fresh pizza, made to order</h1>
      <p>Browse the menu, build your pizza, and see your exact total before you pay.</p>
      <NavLink className="button" to="/menu">
        View the menu
      </NavLink>
    </section>
  );
}

function NotFound() {
  return (
    <section className="page">
      <h1>Page not found</h1>
      <p>
        <NavLink to="/">Return to the home page</NavLink>
      </p>
    </section>
  );
}
