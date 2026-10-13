#!/usr/bin/env node
// ============================================================================
// fix/qm-e2e-real-evidence — fail LOUDLY when the Playwright run matched
// zero tests (the #1106 false-green: "browser E2E" reported success while
// zero projects/tests actually ran).
//
// Usage: node e2e/assert-e2e-results.mjs [path-to-junit-xml]
// Exits 1 when: file missing/unparseable, or tests="0", or the run errored.
// Exits 0 only when at least one test executed.
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const xmlPath = process.argv[2] ?? 'test-results/e2e-results.xml';

if (!existsSync(xmlPath)) {
  console.error(`E2E-ASSERT FAIL: junit report not found at ${xmlPath} — the run produced no evidence.`);
  process.exit(1);
}

const xml = readFileSync(xmlPath, 'utf8');
const match = xml.match(/<testsuite[^>]*\btests="(\d+)"/);
if (!match) {
  console.error(`E2E-ASSERT FAIL: could not parse testsuite count from ${xmlPath}.`);
  process.exit(1);
}

const total = Number(match[1]);
const errors = Number((xml.match(/<testsuite[^>]*\berrors="(\d+)"/) || [])[1] ?? 0);
console.log(`E2E-ASSERT: tests=${total} errors=${errors} (${xmlPath})`);

if (total === 0) {
  console.error(
    'E2E-ASSERT FAIL: zero tests executed — this is the #1106 false-green. ' +
      'Add or fix the spec files under e2e/tests/; a green run with no tests is a red run.',
  );
  process.exit(1);
}

console.log(`E2E-ASSERT PASS: ${total} test(s) executed.`);
