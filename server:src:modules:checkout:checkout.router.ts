import { Router, Request, Response } from 'express';
import { checkoutSchema } from './checkout.schema';

export const checkoutRouter = Router();

// Store configuration
const STORE_HOURS = { openHour: 11, closeHour: 22 }; // 11:00 AM - 10:00 PM
const ALLOWED_DELIVERY_PREFIXES = ['100', '101', '102', 'SW1', 'W1', 'NW1']; // Adjust to your area
const PROMO_DISCOUNTS: Record<string, number> = {
  CRUST15: 0.15,
  CRUST20: 0.20,
};

checkoutRouter.post('/api/checkout/review', (req: Request, res: Response) => {
  const result = checkoutSchema.safeParse(req.body);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join('.');
      fieldErrors[field] = issue.message;
    }
    return res.status(400).json({
      success: false,
      errors: fieldErrors,
    });
  }

  const data = result.data;
  const errors: Record<string, string> = {};

  // 1. Validate store hours against requested time
  const reqDate = new Date(data.requestedTime);
  const hour = isNaN(reqDate.getTime()) ? new Date().getHours() : reqDate.getHours();
  if (hour < STORE_HOURS.openHour || hour >= STORE_HOURS.closeHour) {
    errors['requestedTime'] = `Requested time must be within opening hours (11:00 AM – 10:00 PM).`;
  }

  // 2. Validate delivery zone
  if (data.fulfillmentType === 'delivery' && data.deliveryAddress) {
    const cleanZip = data.deliveryAddress.postalCode.trim().toUpperCase();
    const isCovered = ALLOWED_DELIVERY_PREFIXES.some(prefix => cleanZip.startsWith(prefix));
    if (!isCovered) {
      errors['deliveryAddress.postalCode'] = `We do not deliver to postal code ${cleanZip}. Available for pickup only.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  // 3. Server-side repricing
  const subtotal = data.cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const deliveryFee = data.fulfillmentType === 'delivery' ? 3.99 : 0.00;
  
  let discount = 0;
  if (data.promoCode && PROMO_DISCOUNTS[data.promoCode.toUpperCase()]) {
    discount = +(subtotal * PROMO_DISCOUNTS[data.promoCode.toUpperCase()]).toFixed(2);
  }

  const tax = +((subtotal - discount) * 0.0825).toFixed(2);
  const total = +(subtotal - discount + deliveryFee + tax + data.tipAmount).toFixed(2);

  return res.status(200).json({
    success: true,
    review: {
      customer: data.customer,
      fulfillmentType: data.fulfillmentType,
      requestedTime: data.requestedTime,
      deliveryAddress: data.deliveryAddress || null,
      cartItems: data.cartItems,
      pricing: {
        subtotal: +subtotal.toFixed(2),
        discount,
        deliveryFee,
        tax,
        tip: +data.tipAmount.toFixed(2),
        total,
      },
    },
  });
});
