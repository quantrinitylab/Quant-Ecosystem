/**
 * Doctor script - checks that the development environment is properly configured.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface Check {
  name: string;
  run: () => boolean;
  hint: string;
}

const rootDir = resolve(import.meta.dirname ?? '.', '..');

const checks: Check[] = [
  {
    name: 'Node.js >= 22',
    run: () => {
      const version = process.version;
      const major = parseInt(version.slice(1).split('.')[0] ?? '0', 10);
      return major >= 22;
    },
    hint: 'Install Node.js 22+ from https://nodejs.org',
  },
  {
    name: 'pnpm available',
    run: () => {
      try {
        execSync('pnpm --version', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },
    hint: 'Install pnpm: npm install -g pnpm@10',
  },
  {
    name: 'Docker available',
    run: () => {
      try {
        execSync('docker --version', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },
    hint: 'Install Docker Desktop: https://www.docker.com/products/docker-desktop/',
  },
  {
    name: 'Docker Compose available',
    run: () => {
      try {
        execSync('docker compose version', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },
    hint: 'Docker Compose is bundled with Docker Desktop',
  },
  {
    name: '.env file exists',
    run: () => {
      return existsSync(resolve(rootDir, '.env')) || existsSync(resolve(rootDir, '.env.local'));
    },
    hint: 'Copy .env.local.example to .env.local: cp .env.local.example .env.local',
  },
];

function main(): void {
  console.log('Quant Ecosystem - Doctor\n');
  let allPassed = true;

  for (const check of checks) {
    const passed = check.run();
    const icon = passed ? '\u2714' : '\u2718';
    console.log(`  ${icon} ${check.name}`);
    if (!passed) {
      console.log(`    Hint: ${check.hint}`);
      allPassed = false;
    }
  }

  console.log('');
  if (allPassed) {
    console.log('All checks passed! Your environment is ready.');
  } else {
    console.log('Some checks failed. Please fix the issues above.');
    process.exit(1);
  }
}

main();
