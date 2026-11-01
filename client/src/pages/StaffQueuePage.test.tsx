import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StaffQueuePage } from './StaffQueuePage';

// Staff order queue (S2-22, S2-23). The server enforces roles, CSRF and the allowed steps (#26, #32);
// these tests check that the page lists orders in the order given, offers only the next step, and
// sends the right request.

const order = (n: number, status: string, extra: object = {}) => ({
  orderNumber: n,
  status,
  fulfillment: 'PICKUP',
  requestedTime: null,
  createdAt: '2026-10-31T15:00:00.000Z',
  customerName: `Customer ${n}`,
  lines: [
    {
      itemName: 'Pepperoni Party',
      sizeLabel: 'Large',
      crustName: 'Thin',
      quantity: 2,
      instructions: 'no onions',
      toppings: [{ name: 'Mushrooms', placement: 'LEFT' }],
    },
  ],
  ...extra,
});

type Call = [string, RequestInit | undefined];
function serve(opts: { signedIn?: boolean; orders?: object[]; moveStatus?: number } = {}) {
  const { signedIn = true, orders = [order(11, 'RECEIVED'), order(12, 'IN_PROGRESS'), order(13, 'READY')], moveStatus = 200 } = opts;
  const mock = vi.fn((url: string, init?: RequestInit) => {
    const reply = (status: number, body: object) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
    if (url === '/api/auth/me') {
      return signedIn
        ? reply(200, { user: { id: 'u1', username: 'test-staff', role: 'STAFF' }, csrfToken: 'csrf-123' })
        : reply(401, { error: 'Please sign in.' });
    }
    if (url === '/api/staff/orders') return signedIn ? reply(200, { orders }) : reply(401, { error: 'Please sign in.' });
    if (init?.method === 'POST') {
      return moveStatus === 200
        ? reply(200, { order: { orderNumber: 11, status: 'IN_PROGRESS' } })
        : reply(moveStatus, { error: 'Someone else just changed this order. Reload the queue.' });
    }
    return reply(404, {});
  });
  vi.stubGlobal('fetch', mock);
  return () => (mock.mock.calls as unknown as Call[]).filter(([, init]) => init?.method === 'POST');
}
const open = () => render(<MemoryRouter><StaffQueuePage /></MemoryRouter>);

describe('StaffQueuePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for sign-in when there is no session', async () => {
    serve({ signedIn: false });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in/i);
    expect(screen.getByRole('link', { name: 'Staff sign-in' })).toHaveAttribute('href', '/sign-in?next=/staff/queue');
  });

  it('lists open orders in the order the server sent, with lines, toppings and notes', async () => {
    serve();
    open();
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Order 11', 'Order 12', 'Order 13']);
    expect(screen.getAllByText(/2 × Pepperoni Party/)).toHaveLength(3);
    expect(screen.getAllByText('Mushrooms (left half)')).toHaveLength(3);
    expect(screen.getAllByText('Note: no onions')).toHaveLength(3);
    expect(screen.getByText('Status: Received')).toBeInTheDocument();
    expect(screen.getByText('Status: In progress')).toBeInTheDocument();
    expect(screen.getByText('Status: Ready')).toBeInTheDocument();
  });

  it('offers only the next step for each status', async () => {
    serve();
    open();
    expect(await screen.findByRole('button', { name: 'Start: order 11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready: order 12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark completed: order 13' })).toBeInTheDocument();
  });

  it('says so when there are no open orders', async () => {
    serve({ orders: [] });
    open();
    expect(await screen.findByText('No open orders right now.')).toBeInTheDocument();
  });

  it('sends the next status with the CSRF token and confirms it', async () => {
    const posts = serve();
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Start: order 11' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const [url, init] = posts()[0];
    expect(url).toBe('/api/staff/orders/11/status');
    expect(init?.body).toBe(JSON.stringify({ status: 'IN_PROGRESS' }));
    expect((init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-123');
    expect(await screen.findByText('Order 11 is now in progress.')).toBeInTheDocument();
  });

  it('shows the server message when the change is refused', async () => {
    serve({ moveStatus: 409 });
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Start: order 11' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else just changed this order');
  });
});
