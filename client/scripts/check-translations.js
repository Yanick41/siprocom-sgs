/**
 * Validates the French translation files: `npm run i18n:check`
 *
 * It used to compare French against English and fail on any key present in one
 * and missing from the other. With a single language that comparison is gone,
 * but the check is not pointless: a malformed JSON file breaks the whole app at
 * load, and an empty string renders as a blank label that no one notices until
 * a user asks what the field is for.
 *
 * Kept rather than deleted — if a second language is ever added, the comparison
 * comes back here.
 */

import fs from 'node:fs';
import path from 'node:path';

const LOCALES = path.resolve(import.meta.dirname, '..', 'src', 'i18n', 'locales', 'fr');

/** Flattens nested objects to dotted paths so an empty leaf is reportable. */
function flatten(object, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, full));
    } else {
      out[full] = value;
    }
  }
  return out;
}

const problems = [];
let total = 0;

console.log('\nChecking French translations\n');

for (const file of fs.readdirSync(LOCALES).filter((f) => f.endsWith('.json'))) {
  const full = path.join(LOCALES, file);
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    problems.push(`${file}: invalid JSON — ${error.message.split('\n')[0]}`);
    continue;
  }

  const flat = flatten(parsed);
  const empty = Object.entries(flat)
    .filter(([, value]) => typeof value === 'string' && value.trim() === '')
    .map(([key]) => key);

  total += Object.keys(flat).length;
  for (const key of empty) problems.push(`${file}: "${key}" is empty`);

  console.log(`  ${empty.length === 0 ? '✓' : '✗'} ${file.replace('.json', '')} (${Object.keys(flat).length} keys)`);
}

console.log('');

if (problems.length) {
  problems.forEach((p) => console.error(`  ${p}`));
  console.error(`\n${problems.length} problem(s).\n`);
  process.exit(1);
}

console.log(`All ${total} translation keys are valid.\n`);
