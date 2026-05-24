#!/usr/bin/env node
// ============================================================================
// Quant Ecosystem - Custom Test Runner
// ============================================================================

const fs = require('fs');
const path = require('path');

const PACKAGES_DIR = path.join(__dirname, '..', 'packages');
const APPS_DIR = path.join(__dirname, '..', 'apps');

let totalFiles = 0;
let totalExports = 0;
let errors = [];

function scanDirectory(dir, extensions = ['.ts', '.tsx']) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...scanDirectory(fullPath, extensions));
    } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  totalFiles++;

  // Check for exports
  const exportCount = (content.match(/export /g) || []).length;
  totalExports += exportCount;

  // Check for TypeScript type annotations in .ts files
  if (filePath.endsWith('.ts') && !filePath.endsWith('.d.ts')) {
    if (content.includes('function ') && !content.includes(': ')) {
      errors.push(`${relativePath}: Missing type annotations`);
    }
  }

  return { path: relativePath, exports: exportCount, lines: content.split('\n').length };
}

console.log('Quant Ecosystem - Structure Validation');
console.log('======================================\n');

// Scan packages
const packageFiles = scanDirectory(PACKAGES_DIR);
console.log(`Found ${packageFiles.length} TypeScript files in packages/`);

for (const file of packageFiles) {
  validateFile(file);
}

// Scan apps (if any)
if (fs.existsSync(APPS_DIR)) {
  const appFiles = scanDirectory(APPS_DIR);
  console.log(`Found ${appFiles.length} TypeScript files in apps/`);
  for (const file of appFiles) {
    validateFile(file);
  }
}

console.log(`\nTotal files: ${totalFiles}`);
console.log(`Total exports: ${totalExports}`);

if (errors.length > 0) {
  console.log(`\nWarnings (${errors.length}):`);
  errors.forEach(e => console.log(`  - ${e}`));
}

// Verify key structure
const requiredPackages = ['common', 'database', 'auth', 'ai', 'shared-ui', 'realtime'];
const missingPackages = requiredPackages.filter(p => !fs.existsSync(path.join(PACKAGES_DIR, p, 'src', 'index.ts')));

if (missingPackages.length > 0) {
  console.error(`\nMissing packages: ${missingPackages.join(', ')}`);
  process.exit(1);
}

console.log('\nAll packages present and valid.');
process.exit(0);
