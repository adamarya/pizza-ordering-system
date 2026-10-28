// First-manager command (S2-03). Run once, on purpose, to give a new database someone who can sign
// in. It lives under src/ so the build compiles it into dist/, which is what the Azure deploy ships:
// the deployed site has production packages only, so it cannot run TypeScript directly.
//
//   Azure SSH console:  cd /home/site/wwwroot/server && MANAGER_USERNAME=<name> npm run create-manager
//   Local development:  MANAGER_USERNAME=<name> npm run create-manager:dev
//
// The username comes from MANAGER_USERNAME. The password comes from MANAGER_PASSWORD if it is set
// (for scripted use); otherwise the command asks for it without showing what is typed, so it never
// lands in the shell history. Nothing comes from code or the seed, because this repository is
// public. The command prints the username only, never the password.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { PrismaClient } from '@prisma/client';
import { createFirstManager } from '../modules/auth/firstManager.js';

/** Reads one line from the terminal without echoing it. */
function askHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const username = process.env.MANAGER_USERNAME;
let password = process.env.MANAGER_PASSWORD;
if (username && !password) {
  if (!process.stdin.isTTY) {
    console.error('Set MANAGER_PASSWORD, or run this in a terminal so it can ask for the password.');
    process.exit(1);
  }
  password = await askHidden('Password for the new manager (12 to 128 characters, not shown): ');
  const again = await askHidden('Type it again: ');
  if (password !== again) {
    console.error('The two passwords did not match. Nothing was changed.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();
try {
  const result = await createFirstManager(prisma, { username, password });
  if (result.kind === 'created') {
    console.log(`Manager account created for "${result.username}".`);
  } else if (result.kind === 'manager-exists') {
    console.error('A manager account already exists. Nothing was changed.');
    process.exitCode = 1;
  } else {
    console.error(result.reason);
    process.exitCode = 1;
  }
} catch {
  console.error('Could not create the manager account. Check that DATABASE_URL reaches the database.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
