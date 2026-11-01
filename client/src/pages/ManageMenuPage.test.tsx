import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { centsToDollars, dollarsToCents } from '../lib/staffApi';
import { ManageMenuPage } from './ManageMenuPage';

// Menu maintenance screen (S2-27, S2-28). The server enforces roles and CSRF (#20, #25); these tests
// check that the page sends the right requests and shows each role only the controls it can use.

const menu = {
  menuVersion: 3,
  categories: [
    {
      id: 'c1',
      name: 'Pizzas',
      isRetired: false,
      menuItems: [
        {
          id: 'i1',
          name: 'Pepperoni Party',
          description: null,
          isPizza: true,
          isAvailable: true,
          isRetired: false,
          sizes: [{ id: 's1', label: 'Small', priceCents: 1099, displayOrder: 0 }],
        },
      ],
    },
  ],
  crusts: [{ id: 'cr1', name: 'Thin', surchargeCents: 0, isAvailable: true }],
  toppings: [{ id: 't1', name: 'Mushrooms', priceCents: 125, isAvailable: true }],
};

type Call = [string, RequestInit | undefined];
function serve(role: 'MANAGER' | 'STAFF' | null) {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    const reply = (status: number, body: object) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
    if (url === '/api/auth/me') {
      return role ? reply(200, { user: { id: 'u1', username: 'test-user', role }, csrfToken: 'csrf-123' }) : reply(401, { error: 'Please sign in.' });
    }
    if (url === '/api/admin/menu') return reply(200, menu);
    return reply(200, {});
  });
  vi.stubGlobal('fetch', mock);
  return () => (mock.mock.calls as unknown as Call[]).filter(([, init]) => init?.method === 'PATCH');
}
const open = () => render(<MemoryRouter><ManageMenuPage /></MemoryRouter>);

describe('ManageMenuPage', () => {
  it('asks the visitor to sign in when there is no session', async () => {
    serve(null);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in as the manager or a staff member/i);
    expect(screen.getByRole('link', { name: 'Staff sign-in' })).toHaveAttribute('href', '/sign-in?next=/manage/menu');
  });

  it('lets the manager change a price, sending whole cents and the CSRF token', async () => {
    const changes = serve('MANAGER');
    open();
    const price = await screen.findByRole('textbox', { name: 'Pepperoni Party, Small price in dollars' });
    expect(price).toHaveValue('10.99');
    await userEvent.clear(price);
    await userEvent.type(price, '12.5');
    await userEvent.click(within(screen.getByRole('article', { name: 'Pepperoni Party' })).getByRole('button', { name: 'Save' }));
    // The status line is always on the page, so wait for its text rather than for the element.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Pepperoni Party Small is now $12.50.'));
    const [url, init] = changes()[0];
    expect(url).toBe('/api/admin/sizes/s1');
    expect(JSON.parse(init!.body as string)).toEqual({ priceCents: 1250 });
    expect((init!.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-123');
  });

  it('refuses a price with more than two decimal places without sending anything', async () => {
    const changes = serve('MANAGER');
    open();
    const price = await screen.findByRole('textbox', { name: 'Pepperoni Party, Small price in dollars' });
    await userEvent.clear(price);
    await userEvent.type(price, '12.999');
    await userEvent.click(within(screen.getByRole('article', { name: 'Pepperoni Party' })).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/two decimal places/);
    expect(changes()).toHaveLength(0);
  });

  it('lets the manager retire an item', async () => {
    const changes = serve('MANAGER');
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Retire item' }));
    const [url, init] = changes()[0];
    expect(url).toBe('/api/admin/items/i1');
    expect(JSON.parse(init!.body as string)).toEqual({ isRetired: true });
  });

  it('shows staff prices as text and only the availability switches', async () => {
    const changes = serve('STAFF');
    open();
    expect(await screen.findByText('Small: $10.99')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retire item' })).toBeNull();
    const item = screen.getByRole('article', { name: 'Pepperoni Party' });
    await userEvent.click(within(item).getByRole('button', { name: 'Mark unavailable' }));
    const [url, init] = changes()[0];
    expect(url).toBe('/api/admin/availability');
    expect(JSON.parse(init!.body as string)).toEqual({ kind: 'item', id: 'i1', isAvailable: false });
  });
});

describe('dollar amounts', () => {
  it('reads typed amounts as whole cents without decimal arithmetic', () => {
    expect(dollarsToCents('12.99')).toBe(1299);
    expect(dollarsToCents('$12.5')).toBe(1250);
    expect(dollarsToCents('12')).toBe(1200);
    expect(dollarsToCents('0.07')).toBe(7);
    expect(dollarsToCents('12.999')).toBeNull();
    expect(dollarsToCents('-1')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
    expect(centsToDollars(1299)).toBe('12.99');
    expect(centsToDollars(7)).toBe('0.07');
  });
});
