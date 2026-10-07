// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 9.2 — QuantCode <-> mail-domain module-boundary test
// (Requirement 6.2)
// ============================================================================
//
// Requirement 6.2 (SRP boundary, design AD-2):
//   "THE mail domain SHALL NOT import QuantCode services, and THE QuantCode
//    module SHALL NOT import mail-domain services."
//
// This is a STATIC-ANALYSIS test: it does not boot the app or import any domain
// code. It reads the TypeScript sources of both domains off disk, strips
// comments (so the prose contracts in `modules/code/index.ts` — which *mention*
// `email/thread/folder` and `modules/code/services/*` — never produce false
// positives), extracts every import/export/`import()`/`require()` specifier via
// regex, resolves each *relative* specifier to an absolute on-disk path, and
// asserts that resolution never crosses the domain boundary in either
// direction:
//
//   Direction A (code -> mail):  no file under `modules/code/**` resolves an
//       import into `services/**` or `routes/**` (the mail domain).
//   Direction B (mail -> code):  no mail-domain file under `services/**` or
//       `routes/**` resolves an import into `modules/code/**`.
//
// Resolving specifiers to absolute paths (rather than substring-matching
// basenames) is what makes the check robust: the mail domain legitimately owns
// `ai-code-review.service.ts`, whose basename *contains* the QuantCode
// `review.service` substring, yet it must never be mistaken for a cross-import.
// A basename set is still derived dynamically and asserted as a defensive
// secondary signal so the test self-documents which files define each domain.
//
// The two domains may share only neutral, non-relative packages
// (`@quant/server-core`, `@prisma/client`, `zod`, `fastify`, ...); those are
// bare specifiers and are ignored by the resolution check by construction.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep, relative } from 'node:path';

const testDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(testDir, '..');

const CODE_MODULE_DIR = join(backendDir, 'modules', 'code');
const MAIL_SERVICES_DIR = join(backendDir, 'services');
const MAIL_ROUTES_DIR = join(backendDir, 'routes');

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/** Recursively collect non-declaration, non-test `.ts` source files in `dir`. */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // missing dir -> empty; existence is asserted separately
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.d.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.spec.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip `/* *​/` block comments and `//` line comments so prose that mentions
 * other-domain paths/identifiers cannot masquerade as a real import. Naive but
 * sufficient: import *specifiers* are relative/package paths that never contain
 * `//` or `/*`, so collapsing comments cannot corrupt a genuine import.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Extract every module specifier referenced by a source file. */
function extractSpecifiers(src: string): string[] {
  const code = stripComments(src);
  const specifiers: string[] = [];
  const patterns: RegExp[] = [
    /\bfrom\s*['"]([^'"]+)['"]/g, //      import ... from '...' / export ... from '...'
    /\bimport\s*['"]([^'"]+)['"]/g, //    side-effect import '...'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('...')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('...')
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      specifiers.push(m[1]);
    }
  }
  return specifiers;
}

/** True iff `target` is the directory `dir` itself or a path nested within it. */
function isInside(dir: string, target: string): boolean {
  return target === dir || target.startsWith(dir + sep);
}

interface Violation {
  file: string;
  specifier: string;
  resolvedInto: string;
}

/**
 * Scan `files`, resolving each relative specifier to an absolute path, and
 * report any whose resolution lands inside one of `forbiddenDirs`.
 */
function findCrossImports(files: string[], forbiddenDirs: string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const fileDir = dirname(file);
    for (const spec of extractSpecifiers(src)) {
      if (!spec.startsWith('.')) continue; // bare package specifier -> neutral
      const resolved = resolve(fileDir, spec);
      for (const forbidden of forbiddenDirs) {
        if (isInside(forbidden, resolved)) {
          violations.push({
            file: relative(backendDir, file),
            specifier: spec,
            resolvedInto: relative(backendDir, forbidden),
          });
        }
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// File sets (collected once)
// ---------------------------------------------------------------------------

const codeModuleFiles = collectTsFiles(CODE_MODULE_DIR);
const mailDomainFiles = [
  ...collectTsFiles(MAIL_SERVICES_DIR),
  ...collectTsFiles(MAIL_ROUTES_DIR),
];

// Dynamically-derived module basenames (defensive, self-documenting signal).
const mailServiceBasenames = collectTsFiles(MAIL_SERVICES_DIR).map((f) =>
  f.slice(f.lastIndexOf(sep) + 1, -3),
);
const quantCodeServiceBasenames = collectTsFiles(join(CODE_MODULE_DIR, 'services')).map((f) =>
  f.slice(f.lastIndexOf(sep) + 1, -3),
);

describe('QuantCode <-> mail-domain SRP boundary (Requirement 6.2)', () => {
  it('discovers source files in both domains (scan is not vacuous)', () => {
    expect(codeModuleFiles.length).toBeGreaterThan(0);
    expect(mailDomainFiles.length).toBeGreaterThan(0);
    // Sanity: the known QuantCode services are present under modules/code.
    expect(quantCodeServiceBasenames).toEqual(
      expect.arrayContaining([
        'pr.service',
        'review.service',
        'issue.service',
        'branch-protection.service',
      ]),
    );
    // Sanity: the mail domain owns the core mail services.
    expect(mailServiceBasenames).toEqual(
      expect.arrayContaining(['email.service', 'thread.service', 'folder.service', 'contact.service']),
    );
  });

  it('Direction A: no file under modules/code/** imports a mail-domain service or route', () => {
    const violations = findCrossImports(codeModuleFiles, [MAIL_SERVICES_DIR, MAIL_ROUTES_DIR]);
    expect(
      violations,
      `QuantCode module must not import the mail domain, but found:\n` +
        violations
          .map((v) => `  ${v.file}  ->  '${v.specifier}'  (into ${v.resolvedInto})`)
          .join('\n'),
    ).toEqual([]);
  });

  it('Direction B: no mail-domain file imports from the QuantCode module', () => {
    const violations = findCrossImports(mailDomainFiles, [CODE_MODULE_DIR]);
    expect(
      violations,
      `Mail domain must not import the QuantCode module, but found:\n` +
        violations
          .map((v) => `  ${v.file}  ->  '${v.specifier}'  (into ${v.resolvedInto})`)
          .join('\n'),
    ).toEqual([]);
  });

  it('defensive: no mail-domain file path-imports a QuantCode service basename, and vice versa', () => {
    // A path-segment regex built from the dynamically-derived basenames. Matching
    // a basename as a *path segment* (preceded by `/` and followed by quote/`/`/`.`)
    // avoids the `ai-code-review.service` vs `review.service` substring trap.
    const quantCodeSegmentRe = new RegExp(
      `/(?:${quantCodeServiceBasenames.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=['"/.])`,
    );
    const mailServiceSegmentRe = new RegExp(
      `/(?:${mailServiceBasenames.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=['"/.])`,
    );

    const mailImportingCode: string[] = [];
    for (const file of mailDomainFiles) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const spec of extractSpecifiers(code)) {
        if (spec.startsWith('.') && (spec.includes('/modules/code') || quantCodeSegmentRe.test('/' + spec))) {
          mailImportingCode.push(`${relative(backendDir, file)} -> '${spec}'`);
        }
      }
    }

    const codeImportingMail: string[] = [];
    for (const file of codeModuleFiles) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const spec of extractSpecifiers(code)) {
        // Only treat a mail-service basename as a violation when the specifier
        // escapes the code module (resolves outside modules/code).
        if (!spec.startsWith('.')) continue;
        const resolved = resolve(dirname(file), spec);
        if (!isInside(CODE_MODULE_DIR, resolved) && mailServiceSegmentRe.test('/' + spec)) {
          codeImportingMail.push(`${relative(backendDir, file)} -> '${spec}'`);
        }
      }
    }

    expect(mailImportingCode, mailImportingCode.join('\n')).toEqual([]);
    expect(codeImportingMail, codeImportingMail.join('\n')).toEqual([]);
  });
});
