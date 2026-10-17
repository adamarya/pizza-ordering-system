// Production entry point used by `npm start`.
// In production it applies pending database migrations before starting the API, so a deployment
// and its schema changes go live together (S1-06). In development it starts the API directly.
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
    const require = createRequire(import.meta.url);
    const prismaCli = require.resolve('prisma/build/index.js');
    console.log('Applying database migrations...');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], {
      stdio: 'inherit',
      cwd: serverDir,
    });
  }
}

await import(pathToFileURL(path.join(serverDir, 'dist', 'index.js')).href);
