import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

describe('App shell', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });

  it('renders the main navigation with menu and cart links', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Menu' })[0]).toHaveAttribute('href', '/menu');
    expect(screen.getByRole('link', { name: 'Cart, 0 items' })).toHaveAttribute('href', '/cart');
    expect(screen.getByRole('link', { name: 'Our Store' })).toHaveAttribute('href', '/store');
    expect(screen.getByRole('link', { name: 'Gallery' })).toHaveAttribute('href', '/gallery');
    expect(screen.getByRole('link', { name: 'Store Settings' })).toHaveAttribute('href', '/store/settings');
  });

  it('offers a skip link to the main content for keyboard users', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });
});
