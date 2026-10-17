import type { PrismaClient } from '@prisma/client';
import type { CatalogItem, StoreRates } from '../cart/pricing.js';

// Read-only catalog queries (PB-03, PB-04). Retired categories and items are never returned to
// customers; unavailable ones are returned with their flag so the menu shows them as unavailable.

const itemInclude = {
  sizes: { orderBy: { displayOrder: 'asc' as const } },
  crusts: { orderBy: { name: 'asc' as const } },
  toppings: { orderBy: { name: 'asc' as const } },
};

type ItemRow = Awaited<ReturnType<typeof loadItemRow>>;
async function loadItemRow(prisma: PrismaClient, id: string) {
  return prisma.menuItem.findUnique({ where: { id }, include: { ...itemInclude, category: true } });
}

function toPublicItem(item: NonNullable<ItemRow> | Omit<NonNullable<ItemRow>, 'category'>) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    imageKey: item.imageKey,
    isPizza: item.isPizza,
    isAvailable: item.isAvailable,
    sizes: item.sizes.map((s) => ({ id: s.id, label: s.label, priceCents: s.priceCents })),
    crusts: item.isPizza
      ? item.crusts.map((c) => ({ id: c.id, name: c.name, surchargeCents: c.surchargeCents, isAvailable: c.isAvailable }))
      : [],
    toppings: item.isPizza
      ? item.toppings.map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents, isAvailable: t.isAvailable }))
      : [],
  };
}

export async function getStoreSettings(prisma: PrismaClient) {
  return prisma.storeSettings.findFirst();
}

export async function getMenu(prisma: PrismaClient) {
  const [store, categories] = await Promise.all([
    getStoreSettings(prisma),
    prisma.category.findMany({
      where: { isRetired: false },
      orderBy: { displayOrder: 'asc' },
      include: {
        menuItems: { where: { isRetired: false }, orderBy: { displayOrder: 'asc' }, include: itemInclude },
      },
    }),
  ]);
  if (!store) return null;
  return {
    store: {
      name: store.name,
      taxRateBps: store.taxRateBps,
      deliveryFeeCents: store.deliveryFeeCents,
      deliveryFeeTaxable: store.deliveryFeeTaxable,
    },
    menuVersion: store.menuVersion,
    categories: categories.map((c) => ({ id: c.id, name: c.name, items: c.menuItems.map(toPublicItem) })),
  };
}

export async function getMenuItem(prisma: PrismaClient, id: string) {
  const item = await loadItemRow(prisma, id);
  if (!item || item.isRetired || item.category.isRetired) return null;
  return toPublicItem(item);
}

/** Loads exactly the items a quote refers to, in the shape the pricing service expects. */
export async function loadCatalogForQuote(prisma: PrismaClient, itemIds: string[]) {
  const rows = await prisma.menuItem.findMany({
    where: { id: { in: [...new Set(itemIds)] } },
    include: { ...itemInclude, category: true },
  });
  const map = new Map<string, CatalogItem>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      name: r.name,
      isPizza: r.isPizza,
      isAvailable: r.isAvailable,
      isRetired: r.isRetired || r.category.isRetired,
      sizes: r.sizes,
      crusts: r.crusts,
      toppings: r.toppings,
    });
  }
  return map;
}

export function toRates(store: { taxRateBps: number; deliveryFeeCents: number; deliveryFeeTaxable: boolean }): StoreRates {
  return {
    taxRateBps: store.taxRateBps,
    deliveryFeeCents: store.deliveryFeeCents,
    deliveryFeeTaxable: store.deliveryFeeTaxable,
  };
}
