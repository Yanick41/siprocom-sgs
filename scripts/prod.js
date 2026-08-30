'use strict';

/**
 * Runs one command against the production database: `npm run prod -- <cmd>`
 *
 *   npm run prod -- npm run create-admin -- --email … --name "…" --password "…"
 *   npm run prod -- npx prisma migrate deploy
 *   npm run prod -- npx prisma studio
 *
 * Development stays pointed at the local database because that is where test
 * data belongs. Reaching production is therefore something you type on purpose,
 * for one command, rather than a state `.env` is left in - which is how a seed
 * ends up wiping the real database.
 *
 * Credentials come from server/.env.neon.local, which is gitignored.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SERVER = path.resolve(__dirname, '..', 'server');
const CREDENTIALS = path.join(SERVER, '.env.neon.local');

const command = process.argv.slice(2);

if (command.length === 0) {
  console.log(`
Run one command against the production database:

  npm run prod -- npm run create-admin -- --email … --name "…" --password "…"
  npm run prod -- npx prisma migrate deploy
  npm run prod -- npx prisma studio
`);
  process.exit(0);
}

if (!fs.existsSync(CREDENTIALS)) {
  console.error(`\n  Missing ${path.relative(process.cwd(), CREDENTIALS)}\n
  Create it with the two Neon connection strings:
    DATABASE_URL="<pooled>"
    DIRECT_URL="<direct>"\n`);
  process.exit(1);
}

const env = { ...process.env };
for (const line of fs.readFileSync(CREDENTIALS, 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
}

// dotenv does not override variables already present, so these win over
// server/.env - which is exactly the point.
let host = 'unknown';
try {
  host = new URL(env.DATABASE_URL).hostname;
} catch {
  /* reported below by the command itself */
}

console.log(`\n  \x1b[33mProduction\x1b[0m - ${host}\n  $ ${command.join(' ')}\n`);

const result = spawnSync(command[0], command.slice(1), {
  cwd: SERVER,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
