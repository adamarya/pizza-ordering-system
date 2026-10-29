import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const confirmPayment = vi.fn();
const getStripe = vi.fn();

vi.mock('./stripe', () => ({ getStripe: () => getStripe() }));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: ({ onReady }: { onReady: () => void }) => {
    queueMicrotask(onReady);
    return <div data-testid="stripe-card-fields">Stripe card fields</div>;
  },
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
}));

import { CardPayment } from './CardPayment';

const props = { clientSecret: 'pi_unit_secret_unit', amountLabel: '$52.69', returnPath: '/order/ref', onPaid: vi.fn() };

describe('CardPayment (S2-13)', () => {
  beforeEach(() => {
    confirmPayment.mockReset();
    props.onPaid.mockReset();
    getStripe.mockResolvedValue({});
  });

  it('says plainly when online payment is unavailable', async () => {
    getStripe.mockResolvedValue(null);
    render(<CardPayment {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available right now/);
  });

  it('shows the hosted card fields and the server total on the pay button', async () => {
    render(<CardPayment {...props} />);
    expect(await screen.findByTestId('stripe-card-fields')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay $52.69' })).toBeEnabled());
  });

  it('reports a declined card in text and lets the customer try again', async () => {
    confirmPayment.mockResolvedValue({ error: { message: 'Your card was declined.' } });
    render(<CardPayment {...props} />);
    const pay = await screen.findByRole('button', { name: 'Pay $52.69' });
    await waitFor(() => expect(pay).toBeEnabled());
    await userEvent.click(pay);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined.');
    expect(screen.getByRole('button', { name: 'Pay $52.69' })).toBeEnabled();
    expect(props.onPaid).not.toHaveBeenCalled();
  });

  it('hands back the payment reference once Stripe accepts the payment', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { id: 'pi_unit_1', status: 'succeeded' } });
    render(<CardPayment {...props} />);
    const pay = await screen.findByRole('button', { name: 'Pay $52.69' });
    await waitFor(() => expect(pay).toBeEnabled());
    await userEvent.click(pay);
    await waitFor(() => expect(props.onPaid).toHaveBeenCalledWith('pi_unit_1'));
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect: 'if_required',
        confirmParams: { return_url: `${window.location.origin}/order/ref` },
      }),
    );
  });
});
