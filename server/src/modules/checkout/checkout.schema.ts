import { z } from 'zod';
import { quoteRequestSchema } from '../cart/quote.schema.js';

// Checkout validation contract (S2-07, S2-08, S2-09; Table 25, POST /api/checkout/validate).
// Written by Emmanuella Ahinkrah. The customer and address rules are hers; the cart lines and tip
// use the same shape the cart already sends to /api/cart/quote, so the server prices checkout
// exactly as it prices the cart.

export const deliveryAddressSchema = z
  .object({
    street: z.string().trim().min(3, 'Street address is required.').max(120),
    city: z.string().trim().min(2, 'City is required.').max(60),
    state: z.string().trim().length(2, 'State must be a 2-letter abbreviation (e.g. CO).'),
    zipCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid 5-digit US ZIP code.'),
    unitOrApt: z.string().trim().max(30).optional(),
  })
  .strict();

export const customerDetailsSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required.').max(40),
    lastName: z.string().trim().min(1, 'Last name is required.').max(40),
    email: z.string().trim().max(254).email('Valid email address is required.'),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+().\-\s]{7,20}$/, 'Valid phone number is required.'),
  })
  .strict();

export const checkoutValidateRequestSchema = quoteRequestSchema
  .extend({
    // Empty means "as soon as possible".
    requestedTime: z.string().datetime({ offset: true, message: 'Please choose a valid date and time.' }).optional(),
    customer: customerDetailsSchema,
    deliveryAddress: deliveryAddressSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Your cart is empty.', path: ['lines'] });
    }
    if (data.fulfillment === 'DELIVERY' && !data.deliveryAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Delivery address is required for delivery orders.', path: ['deliveryAddress'] });
    }
  });

export type CheckoutValidateRequest = z.infer<typeof checkoutValidateRequestSchema>;
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;
