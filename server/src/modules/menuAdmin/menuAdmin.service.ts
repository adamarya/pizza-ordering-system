import { Prisma, type PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import type {
  availabilitySchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  crustCreateSchema,
  crustUpdateSchema,
  itemCreateSchema,
  itemUpdateSchema,
  sizeCreateSchema,
  sizeUpdateSchema,
  toppingCreateSchema,
  toppingUpdateSchema,
} from './menuAdmin.schema.js';

// Menu maintenance (S2-27, S2-28). Every change runs in one transaction with an increase of
// StoreSettings.menuVersion. GET /api/menu answers with an ETag built from menuVersion and
// Cache-Control: no-cache, so the next menu load after a change gets the new menu: a change
// reaches customers on their next page load, well inside the one minute S2-28 allows.
//
// Nothing here deletes a menu row. Retiring hides an item or category from customers, and order
// lines keep their own copy of the name, size, crust, toppings, and prices (Figure 6), so past
// orders read exactly as they were placed, and a price change applies to new orders only.

type Tx = Prisma.TransactionClient;
export class NotFound extends Error {}
export class BadRequest extends Error {}

const bump = (tx: Tx) => tx.storeSettings.updateMany({ data: { menuVersion: { increment: 1 } } });

async function change<T>(prisma: PrismaClient, work: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      const result = await work(tx);
      await bump(tx);
      return result;
    });
  } catch (err) {
    // P2025: the row to update does not exist. P2003: a referenced category does not exist.
    if (err instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2003'].includes(err.code)) throw new NotFound();
    throw err;
  }
}

const itemInclude = {
  sizes: { orderBy: { displayOrder: 'asc' } },
  crusts: { select: { id: true, name: true } },
  toppings: { select: { id: true, name: true } },
} satisfies Prisma.MenuItemInclude;

/** Everything, including retired and unavailable rows, for the manager and staff screens. */
export async function getAdminMenu(prisma: PrismaClient) {
  const [store, categories, crusts, toppings] = await Promise.all([
    prisma.storeSettings.findFirst({ select: { menuVersion: true } }),
    prisma.category.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { menuItems: { orderBy: { displayOrder: 'asc' }, include: itemInclude } },
    }),
    prisma.crust.findMany({ orderBy: { name: 'asc' } }),
    prisma.topping.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return { menuVersion: store?.menuVersion ?? 0, categories, crusts, toppings };
}

export const createCategory = (p: PrismaClient, d: z.infer<typeof categoryCreateSchema>) =>
  change(p, (tx) => tx.category.create({ data: d }));
export const updateCategory = (p: PrismaClient, id: string, d: z.infer<typeof categoryUpdateSchema>) =>
  change(p, (tx) => tx.category.update({ where: { id }, data: d }));

export const createItem = (p: PrismaClient, d: z.infer<typeof itemCreateSchema>) =>
  change(p, (tx) =>
    tx.menuItem.create({
      data: {
        name: d.name,
        description: d.description,
        isPizza: d.isPizza,
        displayOrder: d.displayOrder,
        category: { connect: { id: d.categoryId } },
        sizes: { create: d.sizes },
        crusts: { connect: d.crustIds.map((id) => ({ id })) },
        toppings: { connect: d.toppingIds.map((id) => ({ id })) },
      },
      include: itemInclude,
    }),
  );

export const updateItem = (p: PrismaClient, id: string, d: z.infer<typeof itemUpdateSchema>) =>
  change(p, async (tx) => {
    const current = await tx.menuItem.findUnique({ where: { id }, select: { isPizza: true } });
    if (!current) throw new NotFound();
    const { crustIds, toppingIds, categoryId, ...fields } = d;
    if (!current.isPizza && ((crustIds?.length ?? 0) > 0 || (toppingIds?.length ?? 0) > 0)) {
      throw new BadRequest('Only pizzas take crusts and toppings.');
    }
    return tx.menuItem.update({
      where: { id },
      data: {
        ...fields,
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
        ...(crustIds ? { crusts: { set: crustIds.map((c) => ({ id: c })) } } : {}),
        ...(toppingIds ? { toppings: { set: toppingIds.map((t) => ({ id: t })) } } : {}),
      },
      include: itemInclude,
    });
  });

export const addSize = (p: PrismaClient, menuItemId: string, d: z.infer<typeof sizeCreateSchema>) =>
  change(p, (tx) => tx.itemSize.create({ data: { ...d, menuItem: { connect: { id: menuItemId } } } }));
export const updateSize = (p: PrismaClient, id: string, d: z.infer<typeof sizeUpdateSchema>) =>
  change(p, (tx) => tx.itemSize.update({ where: { id }, data: d }));

export const createCrust = (p: PrismaClient, d: z.infer<typeof crustCreateSchema>) =>
  change(p, (tx) => tx.crust.create({ data: d }));
export const updateCrust = (p: PrismaClient, id: string, d: z.infer<typeof crustUpdateSchema>) =>
  change(p, (tx) => tx.crust.update({ where: { id }, data: d }));

export const createTopping = (p: PrismaClient, d: z.infer<typeof toppingCreateSchema>) =>
  change(p, (tx) => tx.topping.create({ data: d }));
export const updateTopping = (p: PrismaClient, id: string, d: z.infer<typeof toppingUpdateSchema>) =>
  change(p, (tx) => tx.topping.update({ where: { id }, data: d }));

export const setAvailability = (p: PrismaClient, d: z.infer<typeof availabilitySchema>) =>
  change(p, async (tx) => {
    const data = { isAvailable: d.isAvailable };
    if (d.kind === 'item') await tx.menuItem.update({ where: { id: d.id }, data });
    else if (d.kind === 'crust') await tx.crust.update({ where: { id: d.id }, data });
    else await tx.topping.update({ where: { id: d.id }, data });
    return { kind: d.kind, id: d.id, isAvailable: d.isAvailable };
  });
