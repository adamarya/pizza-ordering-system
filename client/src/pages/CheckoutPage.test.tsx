import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CartProvider, emptyCart } from '../cart/CartContext';
import { CheckoutPage } from './CheckoutPage';

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
    await userEvent.click(screen.getByRole('button', { name: 'Review order' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Review order' }));
    expect(await screen.findByRole('heading', { name: 'Review your order' })).toBeInTheDocument();
    expect(screen.getByText('$24.65')).toBeInTheDocument();
    const sent = JSON.parse((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body);
    expect(sent).toMatchObject({ fulfillment: 'PICKUP', lines: [{ menuItemId: 'p1', quantity: 2 }], customer: { firstName: 'Jane' } });
    expect(sent.lines[0]).not.toHaveProperty('unitPriceCents');
    await userEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(screen.getByRole('heading', { name: 'Payment' })).toBeInTheDocument();
  });
});
