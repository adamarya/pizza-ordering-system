// Seed script (S1-04): resets the database to the demo menu, one manager account, and one staff
// account. Run with `npm run db:seed`. The data itself lives in src/seed/demoData.ts.
import { PrismaClient } from '@prisma/client';
import { seedDemoData } from '../src/seed/demoData.js';

const prisma = new PrismaClient();

seedDemoData(prisma)
  .then(() => console.log('Seeded: settings, 3 categories, 7 menu items, 3 crusts, 6 toppings, 2 accounts'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
