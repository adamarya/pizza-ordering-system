import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { safeNext } from '../lib/authApi';
import { SignInPage } from './SignInPage';

// Staff sign-in (S2-03). The server checks the password and sets the HttpOnly session cookie (#18);
// these tests check what the page sends, what it shows, and where it goes afterwards.

type Call = [string, RequestInit | undefined];
function serve(opts: { signedIn?: boolean; login?: [number, object] }) {
  const mock = vi.fn((url: string) => {
    const reply = (status: number, body: object) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
    if (url === '/api/auth/me') {
      return opts.signedIn
        ? reply(200, { user: { id: 'u1', username: 'adam.manager', role: 'MANAGER' }, csrfToken: 'csrf-9' })
        : reply(401, { error: 'Please sign in.' });
    }
    if (url === '/api/auth/login') return reply(...(opts.login ?? [401, { error: 'Incorrect username or password.' }]));
    return reply(204, {});
  });
  vi.stubGlobal('fetch', mock);
  return (path: string) => (mock.mock.calls as unknown as Call[]).filter(([url]) => url === path);
}
function open(url = '/sign-in') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/manage/menu" element={<h1>Menu screen</h1>} />
        <Route path="/staff/orders" element={<h1>Queue screen</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SignInPage', () => {
  it('asks for both fields before sending anything', async () => {
    const calls = serve({});
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your username and password.');
    expect(calls('/api/auth/login')).toHaveLength(0);
  });

  it("shows the server's message for a failed sign-in and clears the password", async () => {
    serve({});
    open();
    await userEvent.type(await screen.findByLabelText('Username'), 'someone');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('signs in and goes to the page it was sent from', async () => {
    const calls = serve({ login: [200, { user: { id: 'u1', username: 'kitchen', role: 'STAFF' }, csrfToken: 'c' }] });
    open('/sign-in?next=/staff/orders');
    await userEvent.type(await screen.findByLabelText('Username'), 'kitchen');
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Queue screen' })).toBeInTheDocument();
    expect(JSON.parse(calls('/api/auth/login')[0][1]!.body as string)).toEqual({ username: 'kitchen', password: 'a-good-password-1' });
  });

  it('lets a signed-in member sign out with the CSRF token', async () => {
    const calls = serve({ signedIn: true });
    open();
    expect(await screen.findByText('adam.manager')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    const [, init] = calls('/api/auth/logout')[0];
    expect((init!.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-9');
  });
});

describe('safeNext', () => {
  it('only returns to paths on this site', () => {
    expect(safeNext('/staff/orders')).toBe('/staff/orders');
    expect(safeNext('//evil.example')).toBe('/manage/menu');
    expect(safeNext('https://evil.example')).toBe('/manage/menu');
    expect(safeNext('/\\evil.example')).toBe('/manage/menu');
    expect(safeNext(null)).toBe('/manage/menu');
  });
});
