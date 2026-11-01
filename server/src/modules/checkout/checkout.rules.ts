import { CHECKOUT_SETTINGS, isWithinStoreHours } from './checkout.settings.js';
import type { DeliveryAddress } from './checkout.schema.js';

// Store rules for a checkout (S2-08, S2-09): the requested time is inside store hours and at least
// the lead time ahead, and a delivery address is inside the delivery area. Shared by
// POST /api/checkout/validate and POST /api/orders, so an order cannot skip a rule the review
// screen enforced. Returns field messages keyed by path; an empty object means the rules pass.
export function checkoutRuleErrors(
  data: { fulfillment: 'PICKUP' | 'DELIVERY'; requestedTime?: string; deliveryAddress?: DeliveryAddress },
  now: Date = new Date(),
): Record<string, string> {
  const errors: Record<string, string> = {};

  // Empty means as soon as possible, which needs the store to be open now.
  const when = data.requestedTime ? new Date(data.requestedTime) : now;
  if (data.requestedTime && when.getTime() < now.getTime() + CHECKOUT_SETTINGS.leadMinutes * 60_000) {
    errors.requestedTime = `Please choose a time at least ${CHECKOUT_SETTINGS.leadMinutes} minutes from now.`;
  } else if (!isWithinStoreHours(when)) {
    errors.requestedTime = 'That time is outside our hours (11:00 AM to 10:00 PM).';
  }

  if (data.fulfillment === 'DELIVERY' && data.deliveryAddress) {
    const zip = data.deliveryAddress.zipCode.slice(0, 5);
    if (!(CHECKOUT_SETTINGS.deliveryZipCodes as readonly string[]).includes(zip)) {
      errors['deliveryAddress.zipCode'] = `We don't deliver to ${zip} yet. Pickup is available.`;
    }
  }
  return errors;
}
