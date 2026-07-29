#!/usr/bin/env node
/**
 * Dependency heatmap and new-package wiring guard.
 *
 * Two measured signals per package in packages/:
 *   D = declared dependents (workspace package.json files listing it)
 *   I = external source files importing it (the package's own files excluded)
 *
 * Usage:
 *   node scripts/dependency-heatmap.mjs [--json] [--root <path>]
 *   node scripts/dependency-heatmap.mjs --assert-new-packages-wired --base <git-ref>
 *
 * The scanner intentionally uses Node filesystem APIs instead of shell grep. It
 * fails closed on malformed manifests rather than silently reporting I=0.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOTS = ['apps', 'packages', 'services'];
const SKIPPED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
]);
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function toRepoPath(root, path) {
  return relative(root, path).split('\\').join('/');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${path}: ${detail}`);
  }
}

function walk(root, visitor) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(path, visitor);
      continue;
    }
    if (entry.isFile()) visitor(path);
  }
}

function workspaceManifests(root) {
  const manifests = [];
  const rootManifest = join(root, 'package.json');
  if (existsSync(rootManifest)) manifests.push({ path: rootManifest, pkg: readJson(rootManifest) });

  for (const workspaceRoot of WORKSPACE_ROOTS) {
    walk(join(root, workspaceRoot), (path) => {
      if (path.endsWith('/package.json') || path.endsWith('\\package.json')) {
        manifests.push({ path, pkg: readJson(path) });
      }
    });
  }
  return manifests;
}

function packageDefinitions(root) {
  const packagesRoot = join(root, 'packages');
  if (!existsSync(packagesRoot)) throw new Error(`Missing packages directory: ${packagesRoot}`);

  const definitions = [];
  const names = new Map();
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const manifestPath = join(packagesRoot, entry.name, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const pkg = readJson(manifestPath);
    if (typeof pkg.name !== 'string' || pkg.name.trim() === '') {
      throw new Error(`Package manifest has no valid name: ${manifestPath}`);
    }
    if (names.has(pkg.name)) {
      throw new Error(`Duplicate workspace package name ${pkg.name}: ${names.get(pkg.name)} and ${manifestPath}`);
    }
    names.set(pkg.name, manifestPath);
    definitions.push({ dir: entry.name, name: pkg.name });
  }
  return definitions.sort((a, b) => a.name.localeCompare(b.name));
}

function sourceFiles(root) {
  const files = [];
  for (const workspaceRoot of WORKSPACE_ROOTS) {
    walk(join(root, workspaceRoot), (path) => {
      if (path.endsWith('.d.ts')) return;
      if (SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) files.push(path);
    });
  }
  return files;
}

function importedSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

function score(D, I) {
  if (D >= 8 || I >= 50) return 'CRITICAL';
  if (D >= 3 || I >= 10) return 'HIGH';
  if (D === 2 || (I >= 4 && I <= 9)) return 'MEDIUM';
  if (D === 1 || (I >= 1 && I <= 3)) return 'LOW';
  return 'DEAD';
}

function analyze(root) {
  const definitions = packageDefinitions(root);
  const manifests = workspaceManifests(root);
  const dependents = new Map(definitions.map(({ name }) => [name, new Set()]));
  const importers = new Map(definitions.map(({ name }) => [name, new Set()]));

  for (const { path, pkg } of manifests) {
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    for (const { name } of definitions) {
      if (pkg.name !== name && dependencies[name]) {
        dependents.get(name).add(pkg.name ?? toRepoPath(root, path));
      }
    }
  }

  for (const file of sourceFiles(root)) {
    const repoPath = toRepoPath(root, file);
    const specifiers = importedSpecifiers(readFileSync(file, 'utf8'));
    for (const specifier of specifiers) {
      const definition = definitions.find(
        ({ name }) => specifier === name || specifier.startsWith(`${name}/`),
      );
      if (!definition || repoPath.startsWith(`packages/${definition.dir}/`)) continue;
      importers.get(definition.name).add(repoPath);
    }
  }

  const results = definitions.map(({ dir, name }) => {
    const D = dependents.get(name).size;
    const I = importers.get(name).size;
    return { dir, name, D, I, score: score(D, I) };
  });
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, DEAD: 4 };
  results.sort((a, b) => order[a.score] - order[b.score] || b.D - a.D || b.I - a.I || a.name.localeCompare(b.name));
  return results;
}

function newPackageDirectories(root, baseRef) {
  let output;
  try {
    output = execFileSync(
      'git',
      ['diff', '--name-status', '--diff-filter=A', `${baseRef}...HEAD`, '--', 'packages'],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to compare new packages against ${baseRef}: ${detail}`);
  }

  const directories = new Set();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const path = line.split('\t').at(-1);
    const match = path?.match(/^packages\/([^/]+)\/package\.json$/);
    if (match) directories.add(match[1]);
  }
  return directories;
}

function assertNewPackagesWired(root, baseRef, results) {
  const newDirectories = newPackageDirectories(root, baseRef);
  const unwired = results.filter(({ dir, I }) => newDirectories.has(dir) && I === 0);
  if (unwired.length > 0) {
    const details = unwired.map(({ name, dir, D }) => `  - ${name} (packages/${dir}, D=${D}, I=0)`).join('\n');
    throw new Error(
      `New workspace packages must include at least one real external source importer in the same change:\n${details}`,
    );
  }
  console.error(`[dependency-heatmap] ${newDirectories.size} new package(s) checked; all are externally imported.`);
}

function printableResults(results) {
  return results.map(({ name, D, I, score: packageScore }) => ({ name, D, I, score: packageScore }));
}

function printTable(results) {
  console.log('| Package | D (dependents) | I (import files) | Score |');
  console.log('|---------|----------------|------------------|-------|');
  for (const result of results) {
    console.log(`| ${result.name} | ${result.D} | ${result.I} | ${result.score} |`);
  }
  const counts = {};
  for (const result of results) counts[result.score] = (counts[result.score] ?? 0) + 1;
  console.log(`\nSummary: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(' · ')} (total ${results.length})`);
  const flagged = results.filter(({ D, I }) => D > 0 && I === 0);
  if (flagged.length > 0) {
    console.log('\nDeclared-but-never-imported (tech-debt signals):');
    for (const result of flagged) console.log(`  - ${result.name} (D=${result.D}, I=0)`);
  }
}

try {
  const root = resolve(argumentValue('--root') ?? DEFAULT_ROOT);
  const results = analyze(root);
  const assertWired = process.argv.includes('--assert-new-packages-wired') || process.argv.includes('--assert-no-new-dead');
  if (assertWired) {
    const baseRef = argumentValue('--base');
    if (!baseRef) throw new Error('--assert-new-packages-wired requires --base <git-ref>');
    assertNewPackagesWired(root, baseRef, results);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(printableResults(results), null, 2));
  else printTable(results);
} catch (error) {
  console.error(`[dependency-heatmap] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
