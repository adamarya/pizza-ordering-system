// One-command local demo: `npm run demo` from the repository root.
//
// Runs the built application on this computer with no PostgreSQL installation and no .env file.
// It starts a private PostgreSQL 16 server from the embedded-postgres package (data kept in
// .demo-db/ at the repository root), applies the migrations, loads the demo menu if the database
// is empty, and serves the site and the API together at http://localhost:3000.
// Press Ctrl+C to stop; the database is shut down with the app. Delete .demo-db/ to start over.
//
// Requires `npm ci` (development dependencies included) and `npm run build` (the Build folder of
// the CS492_GP2 submission already contains the built files).
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(serverDir, '..');
const dataDir = path.join(rootDir, '.demo-db');
const dbPort = Number(process.env.DEMO_DB_PORT ?? 54329);
const appPort = Number(process.env.PORT ?? 3000);

for (const built of [path.join(serverDir, 'dist', 'index.js'), path.join(rootDir, 'client', 'dist', 'index.html')]) {
  if (!fs.existsSync(built)) {
    console.error(`Missing ${path.relative(rootDir, built)}. Run "npm run build" first.`);
    process.exit(1);
  }
}

// The Prisma client is generated from the schema on this computer, so it matches this platform.
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'generate', '--schema', path.join(serverDir, 'prisma', 'schema.prisma')], {
  stdio: 'inherit',
  cwd: serverDir,
  env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
});

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: dbPort,
  user: 'pizza',
  password: 'pizza',
  persistent: true,
  onLog: () => {},
});

const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (firstRun) {
  console.log('Creating the local demo database (first run only)...');
  await pg.initialise();
}
await pg.start();
if (firstRun) await pg.createDatabase('pizza');

let stopping = false;
const shutdown = async (code) => {
  if (stopping) return;
  stopping = true;
  try {
    await pg.stop();
  } catch {
    // The database may already be down.
  }
  process.exit(code);
};

const app = spawn(process.execPath, [path.join(serverDir, 'scripts', 'start.mjs')], {
  stdio: 'inherit',
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(appPort),
    SEED_DEMO_DATA: 'true',
    DATABASE_URL: `postgresql://pizza:pizza@localhost:${dbPort}/pizza?schema=public`,
  },
});

console.log(`\nCrust & Co. is starting at http://localhost:${appPort} (press Ctrl+C to stop)\n`);
app.on('exit', (code) => shutdown(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.kill(signal);
    shutdown(0);
  });
}
