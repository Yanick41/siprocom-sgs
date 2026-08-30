'use strict';

/**
 * Blocks a commit that carries a secret: `npm run check:secrets`
 * Installed as a pre-commit hook by `npm run hooks:install`.
 *
 * .gitignore only protects paths that match a pattern it already knows. It does
 * nothing about a connection string pasted into a README, a token hardcoded in
 * a script, or an env file named something nobody anticipated. This inspects
 * what is actually staged.
 *
 * Two passes:
 *   1. Generic patterns - tokens, private keys, connection strings with a
 *      password in them.
 *   2. The literal values sitting in this machine's env files. That is the
 *      decisive check: it cannot be fooled by an unusual format, and it catches
 *      a real secret copied anywhere at all.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

const PATTERNS = [
  [/postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i, 'PostgreSQL connection string with a password'],
  [/\bnpg_[A-Za-z0-9]{12,}/, 'Neon database password'],
  [/\bre_[A-Za-z0-9]{20,}/, 'Resend API key'],
  [/\bsk_(live|test)_[A-Za-z0-9]{16,}/, 'Stripe secret key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bghp_[A-Za-z0-9]{30,}/, 'GitHub personal access token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'Private key'],
  [/\bJWT_SECRET\s*=\s*["']?[A-Fa-f0-9]{32,}/, 'JWT secret with a real value'],
];

/**
 * Documented placeholders must not fail the check they exist to illustrate.
 *
 * `${VAR}` is in the list because docker-compose.yml builds its DATABASE_URL by
 * interpolation, and the connection-string pattern matched it on the first
 * commit that happened to touch the file. Nothing was leaking: the password is
 * `${POSTGRES_PASSWORD}`, resolved from the environment at run time. A shell or
 * compose interpolation is exactly as much a placeholder as `<YOUR_KEY>`.
 */
const PLACEHOLDER = /(user:pass|CHANGEME|<[^>]+>|\$\{[^}]*\}|xxx|example\.com|YOUR_|\.\.\.|…)/i;

/**
 * Values that live in .env but are not secrets, and legitimately appear in
 * source as defaults: loopback URLs, timezones, log levels, durations.
 *
 * Without this the check flagged `http://localhost:5280` written as a dev
 * fallback in config/env.js - technically a match on a .env value, and
 * completely harmless. A guard that cries wolf gets bypassed with --no-verify,
 * which costs more than the false positive it was protecting against.
 */
const NOT_A_SECRET =
  /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?|(true|false)|[a-z]{2,3}|\d+[hmsd]?|(debug|info|warn|error)|[A-Za-z]+\/[A-Za-z_]+|SIPROCOM.*)$/i;

/**
 * Every env file on this machine, discovered rather than listed.
 *
 * A fixed list missed .env.production.local the moment it was created - the
 * file holding the newest and most sensitive secrets was the one not scanned.
 * Anything named .env* now counts, except the committed examples.
 */
function envFiles() {
  const found = [];
  for (const dir of ['', 'server', 'client']) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.startsWith('.env') || name.includes('example')) continue;
      const file = path.join(full, name);
      if (fs.statSync(file).isFile()) found.push(file);
    }
  }
  return found;
}

/** Every literal secret currently configured on this machine. */
function localSecrets() {
  const values = new Set();

  for (const full of envFiles()) {
    if (!fs.existsSync(full)) continue;

    // Split on \r?\n, not \n. A .env written by a Windows editor is CRLF, and
    // JS `.` never matches \r, so the KEY=VALUE regex below failed on every
    // line but the last one in the file. This pass, the decisive one, was
    // silently checking nothing on Windows: it reported "0 local values
    // checked" while sitting next to a .env full of live credentials.
    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (!match) continue;

      const value = match[2].trim().replace(/^["']|["']$/g, '');
      // Short values produce false positives ("true", "8h", "fr").
      if (value.length < 12 || PLACEHOLDER.test(value) || NOT_A_SECRET.test(value)) continue;

      // A URL carrying no credentials is a public address, not a secret: the
      // front-end domain legitimately appears in code and comments. Only the
      // credential parts of a connection string are worth tracking.
      let isPublicUrl = false;
      try {
        const url = new URL(value);
        if (url.password) {
          values.add(decodeURIComponent(url.password));
          if (url.hostname.length >= 12) values.add(url.hostname);
        } else {
          isPublicUrl = true;
        }
      } catch {
        /* not a URL */
      }

      if (!isPublicUrl) values.add(value);
    }
  }
  return [...values];
}

function stagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

const findings = [];
const secrets = localSecrets();

for (const file of stagedFiles()) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;

  // package-lock is huge and machine-generated; scanning it only adds noise.
  if (/package-lock\.json$|\.(png|jpg|jpeg|gif|pdf|ico|woff2?)$/i.test(file)) continue;

  let content;
  try {
    content = fs.readFileSync(full, 'utf8');
  } catch {
    continue; // binary
  }

  content.split(/\r?\n/).forEach((line, index) => {
    if (PLACEHOLDER.test(line)) return;

    for (const [pattern, label] of PATTERNS) {
      if (pattern.test(line)) findings.push({ file, line: index + 1, label });
    }
    for (const secret of secrets) {
      if (line.includes(secret)) {
        findings.push({ file, line: index + 1, label: 'a value from your local .env' });
      }
    }
  });
}

if (findings.length === 0) {
  console.log(`  No secret in the staged changes (${secrets.length} local values checked).`);
  process.exit(0);
}

console.error('\n  \x1b[31mCommit blocked - a secret is staged:\x1b[0m\n');
for (const f of [...new Map(findings.map((f) => [`${f.file}:${f.line}`, f])).values()]) {
  console.error(`    ${f.file}:${f.line}  -  ${f.label}`);
}
console.error(`
  Remove it, or add the file to .gitignore and unstage it:
    git restore --staged <file>

  If this is a placeholder and not a real secret, make that obvious in the text
  (user:pass, <YOUR_KEY>, CHANGEME) and it will pass.
`);
process.exit(1);
