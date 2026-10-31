import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describeLine } from '../lib/orderApi';
import { OrderConfirmationPage } from './OrderConfirmationPage';
import { OrderStatusPage } from './OrderStatusPage';

// Order confirmation (S2-18) and status (S2-20) pages, reading GET /api/orders/status/:reference.

const REF = 'AbCdEfGhIjKlMnOpQrStUv';
const order = {
  orderNumber: 1042,
  createdAt: '2026-10-31T18:00:00.000Z',
  requestedTime: null,
  status: 'IN_PROGRESS',
  fulfillment: 'PICKUP',
  subtotalCents: 2000,
  discountCents: 0,
  taxCents: 165,
  deliveryFeeCents: 0,
  tipCents: 300,
  totalCents: 2465,
  paymentStatus: 'PAID',
  card: { brand: 'visa', last4: '4242' },
  lines: [
    { position: 0, name: 'Pepperoni Party', size: 'Medium', crust: 'Thin', toppings: [{ name: 'Mushrooms', placement: 'LEFT' }], quantity: 1, instructions: 'Well done', unitPriceCents: 2000, extendedPriceCents: 2000 },
  ],
};

function serve(status: number, body: object) {
  const mock = vi.fn(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }));
  vi.stubGlobal('fetch', mock);
  return mock;
}
function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/order/confirmation/:reference" element={<OrderConfirmationPage />} />
        <Route path="/order/status/:reference" element={<OrderStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrderConfirmationPage', () => {
  it('shows the number, contents, total, and how it was paid', async () => {
    const mock = serve(200, order);
    open(`/order/confirmation/${REF}`);
    expect(await screen.findByText('1042')).toBeInTheDocument();
    expect(screen.getByText('Medium, Thin crust, Mushrooms (left half)')).toBeInTheDocument();
    expect(screen.getByText('Instructions: Well done')).toBeInTheDocument();
    expect(screen.getByText('$24.65')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Paid by visa ending in 4242.');
    expect(screen.getByRole('link', { name: 'Track your order' })).toHaveAttribute('href', `/order/status/${REF}`);
    expect(mock).toHaveBeenCalledWith(`/api/orders/status/${REF}`);
  });

  it('says so when the payment failed and offers the cart', async () => {
    serve(200, { ...order, status: 'PAYMENT_FAILED', paymentStatus: 'FAILED', card: null });
    open(`/order/confirmation/${REF}`);
    expect(await screen.findByRole('heading', { name: 'Your order was not placed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to cart' })).toBeInTheDocument();
  });

  it("shows the server's message for an unknown reference", async () => {
    serve(404, { error: 'We could not find that order. Please check the link.' });
    open(`/order/confirmation/${REF}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not find that order.');
  });
});

describe('OrderStatusPage', () => {
  it('marks the current step in words, not color alone', async () => {
    serve(200, order);
    open(`/order/status/${REF}`);
    const current = await screen.findByText('Current');
    expect(current.closest('li')).toHaveAttribute('aria-current', 'step');
    expect(current.closest('li')).toHaveTextContent('In progress');
  });

  it('explains a payment still being confirmed instead of showing the steps', async () => {
    serve(200, { ...order, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', card: null });
    open(`/order/status/${REF}`);
    expect(await screen.findByRole('status')).toHaveTextContent('still confirming your payment');
    expect(screen.queryByRole('list', { name: 'Order progress' })).toBeNull();
  });
});

it('describes a line with its size, crust, and half toppings', () => {
  expect(describeLine({ ...order.lines[0], crust: null, toppings: [{ name: 'Olives', placement: 'WHOLE' }] } as never)).toBe('Medium, Olives');
});
