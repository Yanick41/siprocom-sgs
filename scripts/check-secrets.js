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
 *   1. Generic patterns — tokens, private keys, connection strings with a
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

/** Documented placeholders must not fail the check they exist to illustrate. */
const PLACEHOLDER = /(user:pass|CHANGEME|<[^>]+>|xxx|example\.com|YOUR_|\.\.\.|…)/i;

/** Every literal secret currently configured on this machine. */
function localSecrets() {
  const files = ['server/.env', 'server/.env.neon.local', '.env'];
  const values = new Set();

  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;

    for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (!match) continue;

      const value = match[2].trim().replace(/^["']|["']$/g, '');
      // Short values produce false positives ("true", "8h", "fr").
      if (value.length < 12 || PLACEHOLDER.test(value)) continue;

      values.add(value);

      // A URL also leaks through its password and host alone.
      try {
        const url = new URL(value);
        if (url.password && url.password.length >= 8) values.add(decodeURIComponent(url.password));
        if (url.hostname.length >= 12) values.add(url.hostname);
      } catch {
        /* not a URL */
      }
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

  content.split('\n').forEach((line, index) => {
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

console.error('\n  \x1b[31mCommit blocked — a secret is staged:\x1b[0m\n');
for (const f of [...new Map(findings.map((f) => [`${f.file}:${f.line}`, f])).values()]) {
  console.error(`    ${f.file}:${f.line}  —  ${f.label}`);
}
console.error(`
  Remove it, or add the file to .gitignore and unstage it:
    git restore --staged <file>

  If this is a placeholder and not a real secret, make that obvious in the text
  (user:pass, <YOUR_KEY>, CHANGEME) and it will pass.
`);
process.exit(1);
