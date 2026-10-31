import { z } from 'zod';

// Request contracts for menu maintenance (S2-27, S2-28; PB-10). Money is integer cents (Table 21),
// so a price is a whole number of cents, never a decimal. Unknown fields are rejected, so a request
// cannot set a column this module does not mean to change.
const name = z.string().trim().min(1, 'Please enter a name.').max(80);
const cents = z.number().int('Prices are whole cents.').min(0).max(1_000_000);
const displayOrder = z.number().int().min(0).max(10_000);
const id = z.string().uuid();

export const categoryCreateSchema = z.object({ name, displayOrder: displayOrder.default(0) }).strict();
export const categoryUpdateSchema = z
  .object({ name: name.optional(), displayOrder: displayOrder.optional(), isRetired: z.boolean().optional() })
  .strict();

const sizeInput = z.object({ label: z.string().trim().min(1).max(40), priceCents: cents, displayOrder: displayOrder.default(0) }).strict();

export const itemCreateSchema = z
  .object({
    categoryId: id,
    name,
    description: z.string().trim().max(500).optional(),
    isPizza: z.boolean().default(false),
    displayOrder: displayOrder.default(0),
    sizes: z.array(sizeInput).min(1, 'Add at least one size with a price.').max(10),
    crustIds: z.array(id).max(20).default([]),
    toppingIds: z.array(id).max(60).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.isPizza && (v.crustIds.length > 0 || v.toppingIds.length > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['isPizza'], message: 'Only pizzas take crusts and toppings.' });
    }
  });

export const itemUpdateSchema = z
  .object({
    categoryId: id.optional(),
    name: name.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    displayOrder: displayOrder.optional(),
    isRetired: z.boolean().optional(),
    crustIds: z.array(id).max(20).optional(),
    toppingIds: z.array(id).max(60).optional(),
  })
  .strict();

export const sizeCreateSchema = sizeInput;
export const sizeUpdateSchema = z
  .object({ label: z.string().trim().min(1).max(40).optional(), priceCents: cents.optional(), displayOrder: displayOrder.optional() })
  .strict();

export const crustCreateSchema = z.object({ name, surchargeCents: cents.default(0) }).strict();
export const crustUpdateSchema = z.object({ name: name.optional(), surchargeCents: cents.optional() }).strict();

export const toppingCreateSchema = z.object({ name, priceCents: cents }).strict();
export const toppingUpdateSchema = z.object({ name: name.optional(), priceCents: cents.optional() }).strict();

// The one change store staff may make during a shift (S2-28).
export const availabilitySchema = z
  .object({ kind: z.enum(['item', 'crust', 'topping']), id, isAvailable: z.boolean() })
  .strict();

export const idParam = id;
