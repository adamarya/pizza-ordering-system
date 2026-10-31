import { NavLink, Route, Routes } from 'react-router-dom';
import { CartProvider, useCart } from './cart/CartContext';
import { HealthBadge } from './components/HealthBadge';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ItemPage } from './pages/ItemPage';
import { ManageMenuPage } from './pages/ManageMenuPage';
import { MenuPage } from './pages/MenuPage';
import { OrderPlacedPage } from './pages/OrderPlacedPage';
import { StorePage } from './pages/StorePage';
import { GalleryPage } from './pages/GalleryPage';
import { SignInPage } from './pages/SignInPage';

// Shared page shell and navigation (S1-11, PB-15), with the Sprint 1 screens:
//   /menu           Menu page (S1-14, S1-16)
//   /menu/:itemId   Item configuration (S1-15, S1-19, S1-20, S1-22)
//   /cart           Cart screen (S1-24)
//   /checkout       Checkout, review, and card payment (S2-07 to S2-10, S2-13, S2-14)
//   /order-placed/:orderRef  Thank-you page after payment, linking to the order confirmation (S2-18)
//   /manage/menu    Menu maintenance for the manager and staff (S2-27, S2-28)
//   /sign-in        Staff and manager sign-in (S2-03)
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
          <NavLink to="/store">Our Store</NavLink>
          <NavLink to="/gallery">Gallery</NavLink>
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
          <Route path="/store" element={<StorePage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/manage/menu" element={<ManageMenuPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-placed/:orderRef" element={<OrderPlacedPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
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
