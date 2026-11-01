import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CartProvider, emptyCart } from '../cart/CartContext';
import { CheckoutPage } from './CheckoutPage';
import { OrderPlacedPage } from './OrderPlacedPage';

// Stripe's card fields run in Stripe's own frames; the card form has its own tests (CardPayment.test).
vi.mock('../payments/CardPayment', () => ({
  CardPayment: (p: { amountLabel: string; onPaid: (ref: string) => void }) => (
    <button type="button" onClick={() => p.onPaid('pi_test')}>
      Pay {p.amountLabel}
    </button>
  ),
}));

// Checkout page (S2-07 to S2-10). Server field errors are shown in words next to the fields, and the
// review screen shows only the server's quote.

const cart = {
  ...emptyCart,
  lines: [{ lineId: 'l1', menuItemId: 'p1', sizeId: 's1', crustId: 'c1', toppings: [], quantity: 2, instructions: '' }],
};
const quote = {
  lines: [{ index: 0, menuItemId: 'p1', name: 'Pepperoni Party', sizeLabel: 'Small', crustName: 'Hand Tossed', toppings: [], quantity: 2, instructions: '', unitPriceCents: 1000, extendedPriceCents: 2000, error: null }],
  subtotalCents: 2000, discountCents: 0, taxCents: 165, deliveryFeeCents: 0, tipCents: 300, totalCents: 2465,
  taxRateBps: 825, deliveryFeeTaxable: false, hasErrors: false,
};

function renderCheckout() {
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <CartProvider initial={cart}>
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-placed/:orderRef" element={<OrderPlacedPage />} />
          <Route path="/cart" element={<p>Cart page</p>} />
        </Routes>
      </CartProvider>
    </MemoryRouter>,
  );
}
const respond = (status: number, body: object) =>
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })));

beforeEach(() => sessionStorage.clear());

describe('CheckoutPage', () => {
  it('shows the server field messages next to the fields', async () => {
    respond(400, { error: 'Please check the highlighted details.', errors: { 'customer.email': 'Valid email address is required.' } });
    renderCheckout();
    await userEvent.click(screen.getByRole('button', { name: 'Review your order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please check the highlighted details.');
    const email = screen.getByRole('textbox', { name: 'Email address' });
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Valid email address is required.');
  });

  it('shows the server-priced review and moves on to payment', async () => {
    respond(200, {
      review: {
        fulfillment: 'PICKUP',
        requestedTime: null,
        customer: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '303-555-1234' },
        deliveryAddress: null,
        quote,
      },
    });
    renderCheckout();
    await userEvent.type(screen.getByRole('textbox', { name: 'First name' }), 'Jane');
    await userEvent.click(screen.getByRole('button', { name: 'Review your order' }));
    expect(screen.getByText('$24.65')).toBeInTheDocument();
    const sent = JSON.parse((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body);
    expect(sent).toMatchObject({ fulfillment: 'PICKUP', lines: [{ menuItemId: 'p1', quantity: 2 }], customer: { firstName: 'Jane' } });
    expect(sent.lines[0]).not.toHaveProperty('unitPriceCents');
  });
});

// Order placement and payment (S2-13, S2-14): the review button places the order with the validated
// request and the total shown, then the card form opens; paying clears the cart.
const reviewBody = {
  review: {
    fulfillment: 'PICKUP',
    requestedTime: null,
    customer: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '303-555-1234' },
    deliveryAddress: null,
    quote,
  },
};
type Call = [string, { body: string; headers: Record<string, string> }];
function routeFetch(orders: [number, object][]) {
  const queue = [...orders];
  const mock = vi.fn((url: string) => {
    const [status, body] = url === '/api/orders' ? queue.shift()! : [200, reviewBody];
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  });
  vi.stubGlobal('fetch', mock);
  return () => (mock.mock.calls as unknown as Call[]).filter(([url]) => url === '/api/orders');
}
const placedBody = { orderRef: 'ref_abc123', orderNumber: 1042, totalCents: 2465, clientSecret: 'pi_test_secret_x' };

describe('CheckoutPage payment step', () => {
  it('places the order with the confirmed total, opens the card form, and clears the cart once paid', async () => {
    const orderCalls = routeFetch([[201, placedBody]]);
    renderCheckout();
    await userEvent.click(screen.getByRole('button', { name: 'Review your order' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));

    expect(await screen.findByRole('button', { name: 'Pay $24.65' })).toBeInTheDocument();
    expect(screen.getByText(/Order 1042/)).toBeInTheDocument();
    const [, init] = orderCalls()[0];
    expect(init.headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ fulfillment: 'PICKUP', confirmedTotalCents: 2465, customer: { firstName: '' } });
    expect(sent.lines[0]).not.toHaveProperty('unitPriceCents');

    // Going back and forward again reuses the placed order instead of placing a second one.
    await userEvent.click(screen.getByRole('button', { name: /back to review/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(orderCalls()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Pay $24.65' }));
    expect(await screen.findByRole('heading', { name: 'Thank you for your order' })).toBeInTheDocument();
    expect(screen.getByText(/order 1042/)).toBeInTheDocument();
    expect(screen.getByText('ref_abc123')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('pizza-cart-v1')!).lines).toHaveLength(0);
  });

  it('shows a changed total and asks again with a new key', async () => {
    const newQuote = { ...quote, taxCents: 170, totalCents: 2470 };
    const orderCalls = routeFetch([
      [409, { error: 'Your order total changed. Please review the updated order before paying.', quote: newQuote }],
      [201, { ...placedBody, totalCents: 2470 }],
    ]);
    renderCheckout();
    await userEvent.click(screen.getByRole('button', { name: 'Review your order' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your order total changed');
    expect(screen.getByText('$24.70')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review your order' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByRole('button', { name: 'Pay $24.70' })).toBeInTheDocument();
    const [first, second] = orderCalls().map(([, init]) => init);
    expect(JSON.parse(second.body).confirmedTotalCents).toBe(2470);
    expect(second.headers['Idempotency-Key']).not.toBe(first.headers['Idempotency-Key']);
  });

  it('returns to the details with field messages when the order is refused', async () => {
    routeFetch([[400, { error: 'Please check the highlighted details.', errors: { requestedTime: 'That time is outside our hours (11:00 AM to 10:00 PM).' } }]]);
    renderCheckout();
    await userEvent.click(screen.getByRole('button', { name: 'Review your order' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('That time is outside our hours (11:00 AM to 10:00 PM).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review your order' })).toBeInTheDocument();
  });
});
