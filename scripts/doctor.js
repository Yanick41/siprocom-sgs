'use strict';

/**
 * Pre-flight check: `npm run doctor`
 *
 * Diagnoses the things that actually stop the project from starting — a busy
 * port, an unreachable database, a missing secret — and says what to do about
 * each one. The alternative is reading a stack trace from whichever of the two
 * servers happened to crash first.
 */

const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const CLIENT = path.join(ROOT, 'client');

let failures = 0;
let warnings = 0;

const ok = (msg, detail = '') => console.log(`  \x1b[32m✓\x1b[0m ${msg}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
const warn = (msg, fix) => {
  warnings += 1;
  console.log(`  \x1b[33m!\x1b[0m ${msg}`);
  if (fix) console.log(`      \x1b[90m→ ${fix}\x1b[0m`);
};
const fail = (msg, fix) => {
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  if (fix) console.log(`      \x1b[90m→ ${fix}\x1b[0m`);
};

/**
 * Resolves true when something is already listening on the port.
 *
 * Connects rather than trying to bind. Binding is unreliable here: the API
 * listens on :: and Vite on ::1, and on Windows a bind to 127.0.0.1 succeeds
 * against both — so the bind test reported busy ports as free. Both loopback
 * stacks are probed because a server on ::1 is invisible from 127.0.0.1.
 */
const canConnect = (port, host) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });

const portInUse = async (port) =>
  (await canConnect(port, '127.0.0.1')) || (await canConnect(port, '::1'));

function parseEnv(file) {
  if (!fs.existsSync(file)) return null;
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  console.log('\n\x1b[1mSIPROCOM SGS — diagnostic\x1b[0m\n');

  // ---- Node ---------------------------------------------------------------
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) ok('Node.js', `v${process.versions.node}`);
  else fail(`Node.js v${process.versions.node} is too old`, 'Install Node.js 20 or newer');

  // ---- Dependencies -------------------------------------------------------
  const serverDeps = fs.existsSync(path.join(SERVER, 'node_modules'));
  const clientDeps = fs.existsSync(path.join(CLIENT, 'node_modules'));
  if (serverDeps && clientDeps) ok('Dependencies installed');
  else fail('Dependencies missing', 'npm run setup');

  // ---- server/.env --------------------------------------------------------
  const envPath = path.join(SERVER, '.env');
  const env = parseEnv(envPath);

  if (!env) {
    fail('server/.env is missing', 'cp server/.env.example server/.env, then fill DATABASE_URL and JWT_SECRET');
  } else {
    ok('server/.env found');

    if (!env.DATABASE_URL || env.DATABASE_URL.includes('CHANGEME')) {
      fail('DATABASE_URL is not set', 'Set it in server/.env');
    } else {
      ok('DATABASE_URL set');
    }

    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      fail(
        'JWT_SECRET missing or too short',
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
    } else {
      ok('JWT_SECRET set', `${env.JWT_SECRET.length} chars`);
    }
  }

  // ---- Ports --------------------------------------------------------------
  for (const [port, name] of [
    [4000, 'API'],
    [5280, 'client'],
  ]) {
    if (await portInUse(port)) {
      warn(`Port ${port} (${name}) is already in use`, 'npm run stop — or close the other terminal');
    } else {
      ok(`Port ${port} free`, name);
    }
  }

  // ---- Database -----------------------------------------------------------
  if (env?.DATABASE_URL && serverDeps) {
    try {
      const script = `
        const { PrismaClient } = require('@prisma/client');
        const p = new PrismaClient();
        p.$queryRaw\`SELECT 1\`
          .then(() => Promise.all([p.user.count(), p.product.count(), p.stockMovement.count()]))
          .then(([u, pr, m]) => { console.log(JSON.stringify({ users: u, products: pr, movements: m })); })
          .catch((e) => { console.log(JSON.stringify({ error: e.message.split('\\n')[0] })); })
          .finally(() => p.$disconnect());
      `;
      const raw = execFileSync(process.execPath, ['-e', script], {
        cwd: SERVER,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 20_000,
      });
      const result = JSON.parse(raw.trim().split('\n').pop());

      if (result.error) {
        if (/does not exist|P1003/i.test(result.error)) {
          fail('Database does not exist yet', 'npm run db:setup');
        } else if (/authentication|P1000/i.test(result.error)) {
          fail('Database rejected the credentials', 'Check the password in DATABASE_URL (server/.env)');
        } else if (/reach|P1001|ECONNREFUSED/i.test(result.error)) {
          fail('Database unreachable', 'Start PostgreSQL, then re-run this check');
        } else if (/table|relation|P2021/i.test(result.error)) {
          fail('Tables missing — migrations not applied', 'npm run db:setup');
        } else {
          fail(`Database error: ${result.error}`);
        }
      } else {
        ok('Database reachable');
        if (result.users === 0) {
          warn('No user account exists — you will not be able to sign in', 'npm run db:seed');
        } else {
          ok('Demo data present', `${result.users} users · ${result.products} products · ${result.movements} movements`);
        }
      }
    } catch (error) {
      fail(`Could not run the database check: ${error.message.split('\n')[0]}`);
    }
  }

  // ---- Verdict ------------------------------------------------------------
  console.log('');
  if (failures > 0) {
    console.log(`\x1b[31m${failures} problem(s) to fix\x1b[0m before the project will start.\n`);
    process.exitCode = 1;
  } else if (warnings > 0) {
    console.log(`\x1b[33m${warnings} warning(s)\x1b[0m — \x1b[1mnpm run dev\x1b[0m should still work.\n`);
  } else {
    console.log('Everything checks out. Start with \x1b[1mnpm run dev\x1b[0m\n');
    console.log('  Client   \x1b[36mhttp://localhost:5280\x1b[0m');
    console.log('  API      \x1b[36mhttp://localhost:4000\x1b[0m\n');
    console.log('  Sign in  admin@siprocom.com / Siprocom2026!\n');
  }
}

main();
