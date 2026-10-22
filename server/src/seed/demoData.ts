// Demo data for local development and the shared test environment.
// Written by Paul Banda for S1-04; moved here from prisma/seed.ts so the compiled server can also
// load it on the Azure test site (see seedIfEmpty.ts). Synthetic data only.
import { hash } from '@node-rs/argon2';
import type { PrismaClient } from '@prisma/client';

// Demo-only passwords for local testing. The repo is public, so never reuse a real password here.
const MANAGER_PASSWORD = 'Manager-Demo-1!';
const STAFF_PASSWORD = 'Staff-Demo-1!';

/**
 * Replaces all catalog, settings, and account rows with the demo data. Demo accounts use the
 * published passwords above, so they are created only for local development and tests; the
 * public test site passes { accounts: false }.
 */
export async function seedDemoData(prisma: PrismaClient, options: { accounts?: boolean } = {}) {
  const withAccounts = options.accounts ?? true;
  // 1. Clear old data first, children before parents, so running the seed twice never duplicates rows.
  await prisma.itemSize.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.crust.deleteMany();
  await prisma.topping.deleteMany();
  await prisma.storeSettings.deleteMany();
  await prisma.userAccount.deleteMany();

  // 2. Store settings. Money is in cents, tax in basis points (825 = 8.25%).
  await prisma.storeSettings.create({
    data: {
      name: 'Crust & Co.',
      description: 'Fresh pizza, made to order.',
      streetAddress: '123 Main Street',
      phone: '555-0100',
      email: 'hello@crustandco.example',
      openingHours: {
        monday: '11:00 AM – 9:00 PM',
        tuesday: '11:00 AM – 9:00 PM',
        wednesday: '11:00 AM – 9:00 PM',
        thursday: '11:00 AM – 9:00 PM',
        friday: '11:00 AM – 10:00 PM',
        saturday: '12:00 PM – 10:00 PM',
        sunday: '12:00 PM – 8:00 PM',
      },
      taxRateBps: 825,
      deliveryFeeCents: 399,
      deliveryFeeTaxable: false, // Table 21: the delivery fee is not taxed by default
      deliveryRadiusKm: 8,
      menuVersion: 1,
    },
  });

  // 3. Options that pizzas can offer.
  const handTossed = await prisma.crust.create({ data: { name: 'Hand Tossed', surchargeCents: 0 } });
  const thin = await prisma.crust.create({ data: { name: 'Thin Crust', surchargeCents: 0 } });
  const stuffed = await prisma.crust.create({ data: { name: 'Stuffed Crust', surchargeCents: 250 } });
  const crusts = [handTossed, thin, stuffed];

  const toppingNames = ['Pepperoni', 'Mushrooms', 'Green Peppers', 'Onions', 'Jalapeños', 'Extra Cheese'];
  const toppings = [];
  for (const name of toppingNames) {
    toppings.push(await prisma.topping.create({ data: { name, priceCents: 125 } }));
  }

  // 4. Categories.
  const pizzas = await prisma.category.create({ data: { name: 'Pizzas', displayOrder: 1 } });
  const sides = await prisma.category.create({ data: { name: 'Sides', displayOrder: 2 } });
  const drinks = await prisma.category.create({ data: { name: 'Drinks', displayOrder: 3 } });

  // 5. Pizzas: three sizes, every crust, every topping.
  const pizzaSizes = [
    { label: 'Small', priceCents: 1000, displayOrder: 1 },
    { label: 'Medium', priceCents: 1400, displayOrder: 2 },
    { label: 'Large', priceCents: 1800, displayOrder: 3 },
  ];
  const pizzaList = [
    { name: 'Classic Margherita', description: 'Tomato sauce, fresh mozzarella, basil.', isAvailable: true },
    { name: 'Pepperoni Party', description: 'Pepperoni, mozzarella, house sauce.', isAvailable: true },
    // Unavailable on purpose, so the menu can show an unavailable item (S1-16).
    { name: 'Spicy Garden (Seasonal)', description: 'Jalapeños, bell peppers, chili oil.', isAvailable: false },
  ];
  let order = 1;
  for (const p of pizzaList) {
    await prisma.menuItem.create({
      data: {
        name: p.name,
        description: p.description,
        isPizza: true,
        isAvailable: p.isAvailable,
        displayOrder: order++,
        categoryId: pizzas.id,
        sizes: { create: pizzaSizes },
        crusts: { connect: crusts.map((c) => ({ id: c.id })) },
        toppings: { connect: toppings.map((t) => ({ id: t.id })) },
      },
    });
  }

  // 6. Sides and drinks: one size each.
  const simpleItems = [
    { name: 'Garlic Knots', categoryId: sides.id, priceCents: 599 },
    { name: 'Caesar Salad', categoryId: sides.id, priceCents: 799 },
    { name: 'Fountain Drink', categoryId: drinks.id, priceCents: 249 },
    { name: 'Bottled Water', categoryId: drinks.id, priceCents: 199 },
  ];
  for (const s of simpleItems) {
    await prisma.menuItem.create({
      data: {
        name: s.name,
        categoryId: s.categoryId,
        displayOrder: order++,
        sizes: { create: [{ label: 'Regular', priceCents: s.priceCents, displayOrder: 1 }] },
      },
    });
  }

  // 7. One manager and one staff account. Only the hash is stored, never the password.
  if (!withAccounts) return;
  await prisma.userAccount.create({
    data: { username: 'manager', passwordHash: await hash(MANAGER_PASSWORD), role: 'MANAGER' },
  });
  await prisma.userAccount.create({
    data: { username: 'staff', passwordHash: await hash(STAFF_PASSWORD), role: 'STAFF' },
  });

}
