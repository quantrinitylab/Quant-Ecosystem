/**
 * Env Check script - validates that required environment variables are set.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname ?? '.', '..');

function parseEnvExample(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const vars: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        vars.push(trimmed.slice(0, eqIndex));
      }
    }
  }

  return vars;
}

function main(): void {
  console.log('Quant Ecosystem - Environment Variable Check\n');

  const examplePath = resolve(rootDir, '.env.local.example');
  const requiredVars = parseEnvExample(examplePath);

  if (requiredVars.length === 0) {
    console.log('No .env.local.example found. Nothing to check.');
    return;
  }

  let missingCount = 0;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value === undefined || value === '') {
      console.log(`  \u2718 ${varName} - not set`);
      missingCount++;
    } else {
      console.log(`  \u2714 ${varName}`);
    }
  }

  console.log('');
  if (missingCount === 0) {
    console.log('All environment variables are set.');
  } else {
    console.log(`${missingCount} variable(s) are not set. Some features may not work.`);
    console.log('Copy .env.local.example to .env.local and fill in values.');
  }
}

main();
