import { z } from 'zod';

// Delivery address schema using US ZIP codes
export const deliveryAddressSchema = z.object({
  street: z.string().trim().min(3, 'Street address is required'),
  city: z.string().trim().min(2, 'City is required'),
  state: z.string().trim().length(2, 'State must be a 2-letter abbreviation (e.g. CO)'),
  zipCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid 5-digit US ZIP code'),
  unitOrApt: z.string().trim().optional(),
});

// Reuse the exact line structure from quotes (browser price is NEVER accepted)
export const checkoutCartLineSchema = z.object({
  menuItemId: z.string().min(1, 'Menu item ID is required'),
  sizeId: z.string().min(1, 'Size ID is required'),
  crustId: z.string().optional(),
  toppingIds: z.array(z.string()).default([]),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  specialInstructions: z.string().max(250).optional(),
});

export const customerDetailsSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email address is required'),
  phone: z.string().trim().regex(/^\+?[\d\s-]{10,15}$/, 'Valid phone number is required (at least 10 digits)'),
});

export const checkoutReviewRequestSchema = z.object({
  fulfillmentType: z.enum(['pickup', 'delivery']),
  requestedTime: z.string().datetime({ message: 'Requested time must be a valid ISO 8601 string' }),
  customer: customerDetailsSchema,
  deliveryAddress: deliveryAddressSchema.optional(),
  items: z.array(checkoutCartLineSchema).min(1, 'Cart cannot be empty'),
  tipCents: z.number().int().min(0, 'Tip cannot be negative').default(0),
}).superRefine((data, ctx) => {
  if (data.fulfillmentType === 'delivery' && !data.deliveryAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Delivery address is required for delivery orders',
      path: ['deliveryAddress'],
    });
  }
});

export type CheckoutReviewRequest = z.infer<typeof checkoutReviewRequestSchema>;
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;


