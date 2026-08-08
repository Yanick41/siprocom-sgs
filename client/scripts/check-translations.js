#!/usr/bin/env node
/**
 * Fails if the FR and EN translation files have drifted apart.
 *
 * The bilingual requirement is only as good as its weakest key: a missing
 * translation silently falls back to French for an English user. This guard
 * turns that into a build failure instead. See IMPLEMENTATION_PLAN.md §11 test 10.
 *
 * Usage: npm run i18n:check
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');
const REFERENCE = 'fr'; // French is the source of truth
const TARGETS = ['en'];

/** Flattens { a: { b: 1 } } → ["a.b"] */
function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value, path)
      : [path];
  });
}

function loadNamespace(locale, file) {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, file), 'utf8'));
}

let errorCount = 0;
const report = (message) => {
  console.error(`  ✗ ${message}`);
  errorCount += 1;
};

const referenceFiles = readdirSync(join(LOCALES_DIR, REFERENCE)).filter((f) => f.endsWith('.json'));

for (const target of TARGETS) {
  const targetFiles = new Set(readdirSync(join(LOCALES_DIR, target)));
  console.log(`\nChecking ${REFERENCE} → ${target}`);

  for (const file of referenceFiles) {
    const ns = file.replace('.json', '');

    if (!targetFiles.has(file)) {
      report(`${target}/${file} is missing entirely`);
      continue;
    }

    const referenceKeys = new Set(flatten(loadNamespace(REFERENCE, file)));
    const targetKeys = new Set(flatten(loadNamespace(target, file)));

    const missing = [...referenceKeys].filter((k) => !targetKeys.has(k));
    const extra = [...targetKeys].filter((k) => !referenceKeys.has(k));

    for (const key of missing) report(`${ns}:${key} missing in ${target}`);
    for (const key of extra) report(`${ns}:${key} exists in ${target} but not in ${REFERENCE}`);

    if (!missing.length && !extra.length) {
      console.log(`  ✓ ${ns} (${referenceKeys.size} keys)`);
    }
  }
}

if (errorCount > 0) {
  console.error(`\n${errorCount} translation problem(s) found.\n`);
  process.exit(1);
}
console.log('\nAll translation files are in sync.\n');
