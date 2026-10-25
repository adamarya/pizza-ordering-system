import { expect, test, type Page } from '@playwright/test';

// S2-17 (PB-07): the payment path end to end against the Stripe sandbox, with Stripe's published
// test cards (https://docs.stripe.com/testing). No real card number is ever used, and the site
// refuses live keys. Each test places one sandbox order through the real pages: menu, item, cart,
// checkout details, review, and Stripe's card fields.
//
// What each card proves:
//   4242 4242 4242 4242  pays; the thank-you page shows; Stripe's signed webhook marks the order
//                        RECEIVED and paid (checked through GET /api/orders/status/:reference)
//   4000 0000 0000 0002  is declined; the page says so and keeps the customer on the card form
//   4000 0027 6000 3184  asks for 3-D Secure; completing the challenge pays the order
const CARDS = {
  success: '4242424242424242',
  declined: '4000000000000002',
  threeDSecure: '4000002760003184',
};

/** Tomorrow at 6:00 PM, inside store hours, as the datetime-local field expects it. */
function tomorrowAtSix() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
}

async function fillCheckoutAndReachPayment(page: Page) {
  await page.goto('/menu');
  await page.getByRole('link', { name: /Pepperoni Party/ }).first().click();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.goto('/cart');
  await page.getByRole('button', { name: /continue to checkout/i }).click();

  await page.getByLabel('First name').fill('Sandbox');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email address').fill('sandbox-tester@example.com');
  await page.getByLabel('Phone number').fill('303-555-0100');
  await page.getByLabel(/requested date and time/i).fill(tomorrowAtSix());
  await page.getByRole('button', { name: /review/i }).click();
  await expect(page.getByRole('heading', { name: /review your order/i })).toBeVisible();
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await expect(page.getByRole('button', { name: /^Pay \$/ })).toBeVisible({ timeout: 30_000 });
}

/** Types into Stripe's Payment Element, which lives in Stripe's own frame. */
async function enterCard(page: Page, number: string) {
  const card = page.frameLocator('iframe[title="Secure payment input frame"]').first();
  await card.getByPlaceholder(/1234 1234 1234 1234/).fill(number);
  await card.getByPlaceholder(/MM \/ YY/).fill('12 / 34');
  await card.getByPlaceholder(/CVC/).fill('123');
  const zip = card.getByPlaceholder(/ZIP|12345/);
  if (await zip.count()) await zip.fill('80202');
}

/** Polls the order status until the webhook has run, or the time runs out. */
async function waitForStatus(page: Page, reference: string, wanted: { status: string; paymentStatus: string }) {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/orders/status/${reference}`);
        if (!res.ok()) return `HTTP ${res.status()}`;
        const body = await res.json();
        return `${body.status}/${body.paymentStatus}`;
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBe(`${wanted.status}/${wanted.paymentStatus}`);
}

const referenceFrom = (url: string) => /\/order-placed\/([A-Za-z0-9_-]{22})/.exec(url)?.[1] ?? '';

test('a successful test card pays, and the webhook marks the order received', async ({ page }) => {
  await fillCheckoutAndReachPayment(page);
  await enterCard(page, CARDS.success);
  await page.getByRole('button', { name: /^Pay \$/ }).click();
  await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 30_000 });
  const reference = referenceFrom(page.url());
  expect(reference).not.toBe('');
  await waitForStatus(page, reference, { status: 'RECEIVED', paymentStatus: 'PAID' });
});

test('a declined test card is refused, and the customer stays on the card form', async ({ page }) => {
  await fillCheckoutAndReachPayment(page);
  await enterCard(page, CARDS.declined);
  await page.getByRole('button', { name: /^Pay \$/ }).click();
  await expect(page.getByRole('alert')).toContainText(/declined/i, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Pay \$/ })).toBeEnabled();
  expect(page.url()).toContain('/checkout');
});

test('a 3-D Secure test card pays after the challenge is completed', async ({ page }) => {
  await fillCheckoutAndReachPayment(page);
  await enterCard(page, CARDS.threeDSecure);
  await page.getByRole('button', { name: /^Pay \$/ }).click();
  // Stripe's sandbox challenge opens in nested frames with a "Complete" button.
  const challenge = page
    .frameLocator('iframe[name^="__privateStripeFrame"][src*="three-ds"], iframe[src*="authorize"]')
    .first()
    .frameLocator('iframe')
    .first();
  await challenge.getByRole('button', { name: /complete/i }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 30_000 });
  await waitForStatus(page, referenceFrom(page.url()), { status: 'RECEIVED', paymentStatus: 'PAID' });
});
