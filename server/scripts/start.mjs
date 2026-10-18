// Production entry point used by `npm start`.
// In production it applies pending database migrations before starting the API, so a deployment
// and its schema changes go live together (S1-06). In development it starts the API directly.
//
// On Azure the deployed files are read-only, so every Prisma engine must already be in the
// package (the deploy job checks this). If a migration still fails, the error is logged and the
// API starts anyway: /health then reports the database as down instead of the site returning an
// opaque 503, which makes the problem visible in the log stream and to the deploy smoke test.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = path.join(serverDir, 'prisma', 'schema.prisma');

if (process.env.NODE_ENV === 'production') {
  const hasModels = /^model\s/m.test(fs.readFileSync(schema, 'utf8'));
  if (hasModels) {
    let migrated = false;
    try {
      const require = createRequire(import.meta.url);
      const prismaCli = require.resolve('prisma/build/index.js');
      console.log('Applying database migrations...');
      execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], {
        stdio: 'inherit',
        cwd: serverDir,
        env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      });
      migrated = true;
    } catch (err) {
      console.error('Database migration failed; starting the API so /health can report it.', err.message);
    }
    // The test environment opts in to demo data with the web app setting SEED_DEMO_DATA=true.
    // It loads the menu only into an empty database and never creates demo accounts there.
    if (migrated && process.env.SEED_DEMO_DATA === 'true') {
      try {
        await import(pathToFileURL(path.join(serverDir, 'dist', 'seed', 'seedIfEmpty.js')).href);
      } catch (err) {
        console.error('Demo data could not be loaded.', err.message);
      }
    }
  }
}

await import(pathToFileURL(path.join(serverDir, 'dist', 'index.js')).href);
