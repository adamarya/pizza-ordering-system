// Loads the demo data into an empty database. Used on the shared test environment when the web
// app setting SEED_DEMO_DATA is "true" (S1-06). It runs only when every seeded table is empty, and
// it never deletes anything (reset: false), so real or edited data, and the orders that Sprint 2
// adds, can never be overwritten. Demo accounts are not created here,
// because their passwords are published in the public repository.
import { getPrisma, disconnect } from '../db.js';
import { demoTablesEmpty, seedDemoData } from './demoData.js';

const prisma = getPrisma();
try {
  if (await demoTablesEmpty(prisma)) {
    await seedDemoData(prisma, { accounts: false, reset: false });
    console.log('Empty database: loaded the demo menu (no demo accounts on this site).');
  } else {
    console.log('Database already has data: demo seed skipped.');
  }
} finally {
  await disconnect();
}
