// Seed script (S1-04): loads a representative menu, one manager account, and one staff account
// with synthetic data only. Run with `npm run db:seed`.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed: no models yet. Catalog seed data is added with S1-04 and S1-13.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
