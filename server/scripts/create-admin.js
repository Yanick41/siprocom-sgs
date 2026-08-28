'use strict';

/**
 * Creates the first administrator on a fresh database.
 *
 *   node scripts/create-admin.js --email a@b.com --name "Nom" --password "…"
 *
 * This exists because the alternative - adding the row by hand in Prisma Studio
 * - means hashing the password in a separate step and pasting it into a form,
 * which is exactly how a plaintext password ends up in a database.
 *
 * Safe on a live database: it creates or updates one row and touches nothing
 * else. Unlike the seed, it never deletes anything.
 */

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { role: 'ADMIN', locale: 'fr' };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'force') { args.force = true; continue; }
    if (['email', 'name', 'password', 'role', 'locale'].includes(key)) args[key] = argv[++i];
  }
  return args;
}

/**
 * Rejects what an attacker tries first. Deliberately not a complexity ruleset:
 * length is what actually resists guessing, and arbitrary character rules push
 * people towards "Password1!" and a sticky note.
 */
function checkPassword(password) {
  const problems = [];
  if (!password || password.length < 12) problems.push('at least 12 characters');
  if (/^[a-z]+$/i.test(password || '')) problems.push('not letters alone');
  const common = ['password', 'siprocom2026!', 'azerty', 'qwerty', '123456', 'admin'];
  if (common.includes((password || '').toLowerCase())) problems.push('not a well-known password');
  return problems;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.email || !args.name || !args.password) {
    console.log(`
Create the first administrator

  node scripts/create-admin.js --email admin@siprocom.com --name "Nom Prénom" --password "…"

  --role    ADMIN (default) | MAGASINIER | ACHATS | DIRECTION
  --locale  fr (default) | en
  --force   required to overwrite an account that already exists

The password is hashed with bcrypt before it reaches the database and is never
stored or logged in clear.
`);
    return;
  }

  const email = args.email.trim().toLowerCase();
  const problems = checkPassword(args.password);
  if (problems.length) {
    console.error(`\n  Password rejected - it must be: ${problems.join(', ')}.\n`);
    process.exitCode = 1;
    return;
  }

  const target = await prisma.$queryRaw`SELECT current_database() AS db`;
  const password = await bcrypt.hash(args.password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });

  /**
   * A typo in the email must not quietly take over somebody's account.
   *
   * Updating is a real use - it is how a forgotten administrator password gets
   * reset - but it also resets the role, re-enables a disabled account and
   * replaces the password, and it used to do all three without saying so. One
   * wrong character and the colleague whose address you actually typed is
   * locked out of their own account and silently promoted.
   *
   * So the update path is still there, it just has to be asked for.
   */
  if (existing && !args.force) {
    console.error(`
  ${email} already exists: ${existing.name}, role ${existing.role}.

  Continuing would replace their password, set their role to ${args.role} and
  re-enable the account. If that is what you want, say so:

    ... --email ${email} --force

  If you meant to create a new account, check the address for a typo.
`);
    process.exitCode = 1;
    return;
  }

  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: { name: args.name, role: args.role, locale: args.locale, isActive: true, password },
      })
    : await prisma.user.create({
        data: { email, name: args.name, role: args.role, locale: args.locale, password },
      });

  console.log(`
  ${existing ? 'Updated' : 'Created'} in database "${target[0].db}":

    ${user.name}
    ${user.email}
    role ${user.role}

  Sign in with the password you passed. It was hashed, not stored.
`);
}

main()
  .catch((error) => {
    console.error('\n  Failed:', error.message.split('\n')[0], '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
