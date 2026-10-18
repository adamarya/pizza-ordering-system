// Loads the demo data into an empty database. Used on the shared test environment when the web
// app setting SEED_DEMO_DATA is "true" (S1-06). It never touches a database that already has
// store settings, so real or edited data is never overwritten. Demo accounts are not created here,
// because their passwords are published in the public repository.
import { getPrisma, disconnect } from '../db.js';
import { seedDemoData } from './demoData.js';

const prisma = getPrisma();
try {
  if ((await prisma.storeSettings.count()) === 0) {
    await seedDemoData(prisma, { accounts: false });
    console.log('Empty database: loaded the demo menu (no demo accounts on this site).');
  } else {
    console.log('Database already has data: demo seed skipped.');
  }
} finally {
  await disconnect();
}
