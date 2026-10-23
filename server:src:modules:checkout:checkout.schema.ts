import { z } from 'zod';

export const deliveryAddressSchema = z.object({
  street: z.string().min(3, 'Street address is required'),
  city: z.string().min(2, 'City is required'),
  postalCode: z.string().regex(/^[A-Za-z0-9\s-]{3,10}$/, 'Valid postal/zip code required'),
  unitOrApt: z.string().optional(),
});

export const cartItemSchema = z.object({
  id: z.string().or(z.number()),
  name: z.string(),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
});

export const checkoutSchema = z.object({
  fulfillmentType: z.enum(['pickup', 'delivery']),
  requestedTime: z.string().min(1, 'Requested fulfillment time is required'),
  customer: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().min(7, 'A valid phone number is required'),
  }),
  deliveryAddress: deliveryAddressSchema.optional(),
  cartItems: z.array(cartItemSchema).min(1, 'Cart cannot be empty'),
  promoCode: z.string().optional(),
  tipAmount: z.number().min(0).default(0),
}).superRefine((data, ctx) => {
  if (data.fulfillmentType === 'delivery' && !data.deliveryAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Delivery address is required for delivery orders',
      path: ['deliveryAddress'],
    });
  }
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

