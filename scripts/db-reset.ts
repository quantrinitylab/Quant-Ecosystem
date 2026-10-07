/**
 * DB Reset script - drops and recreates the database, then seeds it.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname ?? '.', '..');
const databaseDir = resolve(rootDir, 'packages/database');

function main(): void {
  console.log('Quant Ecosystem - Database Reset\n');

  try {
    console.log('Step 1: Resetting database schema...');
    execSync('npx prisma db push --force-reset', {
      cwd: databaseDir,
      stdio: 'inherit',
    });

    console.log('\nStep 2: Running seed...');
    execSync('npx prisma db seed', {
      cwd: databaseDir,
      stdio: 'inherit',
    });

    console.log('\nDatabase reset complete!');
  } catch (error) {
    console.error('Database reset failed:', error);
    process.exit(1);
  }
}

main();
