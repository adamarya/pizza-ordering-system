import { NavLink, Route, Routes } from 'react-router-dom';
import { HealthBadge } from './components/HealthBadge';

// Shared page shell and navigation (S1-11, PB-15). Screens are added as routes:
//   /menu          Menu page (S1-14)                Aaron Aguirre
//   /menu/:itemId  Item configuration (S1-15, S1-19) Aaron Aguirre
//   /cart          Cart screen (S1-24)              Emmanuella Ahinkrah
export function App() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <NavLink to="/" className="brand">
          Pizza Restaurant
        </NavLink>
        <nav aria-label="Main">
          <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/cart">Cart</NavLink>
        </nav>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
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
    <section>
      <h1>Order online</h1>
      <p>Browse the menu, build your pizza, and see your total before you pay.</p>
      <NavLink className="button" to="/menu">
        View the menu
      </NavLink>
    </section>
  );
}

function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        <NavLink to="/">Return to the home page</NavLink>
      </p>
    </section>
  );
}
