import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CartProvider, emptyCart } from '../cart/CartContext';
import { CartPage } from './CartPage';
import { MenuPage } from './MenuPage';

const menu = {
  store: { name: 'Crust & Co.', taxRateBps: 825, deliveryFeeCents: 399, deliveryFeeTaxable: false },
  menuVersion: 1,
  categories: [
    {
      id: 'cat-pizza',
      name: 'Pizzas',
      items: [
        { id: 'p1', name: 'Pepperoni Party', description: null, isPizza: true, isAvailable: true, sizes: [{ id: 's1', label: 'Small', priceCents: 1000 }], crusts: [], toppings: [] },
        { id: 'p2', name: 'Spicy Garden', description: null, isPizza: true, isAvailable: false, sizes: [{ id: 's2', label: 'Small', priceCents: 1000 }], crusts: [], toppings: [] },
      ],
    },
    { id: 'cat-drinks', name: 'Drinks', items: [] },
  ],
};

const quote = {
  lines: [{ index: 0, name: 'Pepperoni Party', sizeLabel: 'Small', crustName: 'Hand Tossed', toppings: [{ name: 'Mushrooms', placement: 'LEFT' }], quantity: 2, instructions: '', unitPriceCents: 1063, extendedPriceCents: 2126, error: null }],
  subtotalCents: 2126, discountCents: 0, taxCents: 175, deliveryFeeCents: 0, tipCents: 319, totalCents: 2620,
  taxRateBps: 825, deliveryFeeTaxable: false, hasErrors: false,
};

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes('/api/cart/quote') ? quote : menu) }),
    ),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mockApi();
});

describe('MenuPage', () => {
  it('lists categories as tabs and labels an unavailable item in text', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('tab', { name: 'Pizzas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Build Pepperoni Party' })).toHaveAttribute('href', '/menu/p1');
    expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Build Spicy Garden' })).toBeNull();
  });

  it('gives every tab a panel that exists, showing only the selected one', async () => {
    const { container } = render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    const tabs = await screen.findAllByRole('tab');
    for (const tab of tabs) {
      const panel = container.querySelector(`#${tab.getAttribute('aria-controls')}`);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
      expect((panel as HTMLElement).hidden).toBe(tab.getAttribute('aria-selected') !== 'true');
    }
  });

  it('moves between categories with the arrow keys', async () => {
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );
    const pizzas = await screen.findByRole('tab', { name: 'Pizzas' });
    pizzas.focus();
    await userEvent.keyboard('{ArrowRight}');
    const drinks = screen.getByRole('tab', { name: 'Drinks' });
    expect(drinks).toHaveAttribute('aria-selected', 'true');
    expect(drinks).toHaveFocus();
    expect(screen.getByText('Nothing in this category right now.')).toBeVisible();
  });
});

describe('CartPage', () => {
  const cart = {
    ...emptyCart,
    lines: [{ lineId: 'l1', menuItemId: 'p1', sizeId: 's1', crustId: 'c1', toppings: [{ toppingId: 't1', placement: 'LEFT' as const }], quantity: 2, instructions: '' }],
  };

  it('shows the server quote and enables demo order creation when the quote is valid', async () => {
    render(
      <MemoryRouter initialEntries={['/cart']}>
        <CartProvider initial={cart}>
          <Routes>
            <Route path="/cart" element={<CartPage />} />
          </Routes>
        </CartProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('$26.20')).toBeInTheDocument();
    const summary = screen.getByRole('complementary', { name: 'Order summary' });
    expect(within(summary).getByText('$21.26')).toBeInTheDocument();
    expect(within(summary).getByText('Tax (8.25%)')).toBeInTheDocument();
    expect(screen.getByText(/Mushrooms \(left half\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place demo order' })).toBeEnabled();
  });

  it('shows an empty cart message with a way back to the menu', () => {
    render(
      <MemoryRouter>
        <CartProvider initial={emptyCart}>
          <CartPage />
        </CartProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the menu' })).toHaveAttribute('href', '/menu');
  });
});
