import { z } from 'zod';

// Request contract for POST /api/cart/quote (Table 22). Validated on the server for every call:
// up to 30 lines, quantity 1 to 20, special instructions up to 200 characters.
export const quoteRequestSchema = z
  .object({
    fulfillment: z.enum(['PICKUP', 'DELIVERY']),
    tip: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('PERCENT'), percent: z.number().int().min(0).max(100) }),
        z.object({ type: z.literal('AMOUNT'), cents: z.number().int().min(0).max(100_000) }),
      ])
      .optional(),
    lines: z
      .array(
        z
          .object({
            menuItemId: z.string().uuid(),
            sizeId: z.string().uuid(),
            crustId: z.string().uuid().optional(),
            toppings: z
              .array(
                z.object({ toppingId: z.string().uuid(), placement: z.enum(['WHOLE', 'LEFT', 'RIGHT']) }).strict(),
              )
              .max(20)
              .optional(),
            quantity: z.number().int().min(1).max(20),
            instructions: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
