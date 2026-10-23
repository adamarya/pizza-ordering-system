// Display helper only. Every amount arrives from the server as integer cents (Table 21);
// the browser formats it and never adds, multiplies, or rounds money itself.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatCents = (cents: number) => usd.format(cents / 100);
