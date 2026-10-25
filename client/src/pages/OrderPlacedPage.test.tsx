import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CartProvider, emptyCart } from '../cart/CartContext';
import { OrderPlacedPage } from './OrderPlacedPage';

// S2-21 (post, redirect, get): the order is placed by one POST from the review screen, and the
// customer then lands on this page with a plain GET. Refreshing or revisiting it, or returning here
// from Stripe, never places or pays for an order again.
const cart = {
  ...emptyCart,
  lines: [{ lineId: 'l1', menuItemId: 'p1', sizeId: 's1', toppings: [], quantity: 1, instructions: '' }],
};

function open(url: string) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={[url]}>
      <CartProvider initial={cart}>
        <Routes>
          <Route path="/order-placed/:orderRef" element={<OrderPlacedPage />} />
        </Routes>
      </CartProvider>
    </MemoryRouter>,
  );
  return fetchMock;
}

beforeEach(() => sessionStorage.clear());

describe('OrderPlacedPage', () => {
  it('can be refreshed or revisited without sending anything to the server', () => {
    const fetchMock = open('/order-placed/ref_abc123');
    expect(screen.getByRole('heading', { name: 'Thank you for your order' })).toBeInTheDocument();
    expect(screen.getByText('ref_abc123')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the cart when Stripe returns after a successful redirect payment', () => {
    open('/order-placed/ref_abc123?redirect_status=succeeded');
    expect(JSON.parse(sessionStorage.getItem('pizza-cart-v1')!).lines).toHaveLength(0);
  });

  it('keeps the cart and says so when a redirect payment failed', () => {
    open('/order-placed/ref_abc123?redirect_status=failed');
    expect(screen.getByRole('alert')).toHaveTextContent('Your cart is saved');
    expect(JSON.parse(sessionStorage.getItem('pizza-cart-v1')!).lines).toHaveLength(1);
  });
});
