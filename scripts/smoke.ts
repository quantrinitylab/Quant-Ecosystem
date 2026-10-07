/**
 * Smoke test script - verifies the project builds and runs basic checks.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname ?? '.', '..');

interface SmokeCheck {
  name: string;
  command: string;
}

const smokeChecks: SmokeCheck[] = [
  { name: 'TypeScript compilation', command: 'pnpm typecheck' },
  { name: 'Build', command: 'pnpm build' },
  { name: 'Tests', command: 'pnpm test' },
  { name: 'Lint', command: 'pnpm lint' },
];

function main(): void {
  console.log('Quant Ecosystem - Smoke Test\n');

  let allPassed = true;

  for (const check of smokeChecks) {
    try {
      console.log(`Running: ${check.name}...`);
      execSync(check.command, { cwd: rootDir, stdio: 'pipe' });
      console.log(`  \u2714 ${check.name} passed`);
    } catch {
      console.log(`  \u2718 ${check.name} failed`);
      allPassed = false;
    }
  }

  console.log('');
  if (allPassed) {
    console.log('All smoke checks passed!');
  } else {
    console.log('Some smoke checks failed.');
    process.exit(1);
  }
}

main();
