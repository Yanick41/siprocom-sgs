'use strict';

/**
 * Installs the pre-commit hook: `npm run hooks:install`
 *
 * Git hooks live in .git/hooks, which is not versioned — so a fresh clone has
 * no protection until this is run. It is therefore wired into `postinstall`
 * rather than left as a step in the README that nobody performs.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HOOKS = path.join(ROOT, '.git', 'hooks');

if (!fs.existsSync(HOOKS)) {
  // A tarball or a Docker build context has no .git — not an error.
  console.log('  No .git/hooks directory — skipping hook installation.');
  process.exit(0);
}

const hook = `#!/bin/sh
# SIPROCOM SGS — installed by scripts/install-hooks.js
# Blocks a commit carrying a secret. Bypass with --no-verify only when you are
# certain, and know that the history is what ends up on a remote.
node "$(git rev-parse --show-toplevel)/scripts/check-secrets.js" || exit 1
`;

const target = path.join(HOOKS, 'pre-commit');
fs.writeFileSync(target, hook, { mode: 0o755 });

console.log('  pre-commit hook installed — staged secrets will block a commit.');
