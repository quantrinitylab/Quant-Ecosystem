// @vitest-environment node
// ============================================================================
// Phase Q: Codebase Hygiene & Architectural Invariant Suite (Tasks Q08 & Q09)
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase Q: Codebase Hygiene & Architectural Invariants', () => {
  const backendRoutesDir = path.resolve(__dirname, '../routes');
  const frontendServicesDir = path.resolve(__dirname, '../../src/services');

  it('ensures no empty catch blocks exist in core backend route files (Task Q08)', () => {
    const routeFiles = fs
      .readdirSync(backendRoutesDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    const emptyCatchRegex = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
    const violations: Array<{ file: string; matchCount: number }> = [];

    for (const file of routeFiles) {
      const fullPath = path.join(backendRoutesDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(emptyCatchRegex);
      if (matches && matches.length > 0) {
        violations.push({ file, matchCount: matches.length });
      }
    }

    expect(
      violations,
      `Found empty catch blocks in backend routes: ${JSON.stringify(violations)}`,
    ).toEqual([]);
  });

  it('ensures deleted in-memory mock services do not exist in src/services (Task K01-K04, Q09)', () => {
    const bannedFrontendServices = [
      'undo-send.service.ts',
      'email-templates.service.ts',
      'email-snooze.service.ts',
      'signature-builder.service.ts',
      'smart-inbox.service.ts',
    ];

    const foundBanned: string[] = [];
    for (const service of bannedFrontendServices) {
      const fullPath = path.join(frontendServicesDir, service);
      if (fs.existsSync(fullPath)) {
        foundBanned.push(service);
      }
    }

    expect(
      foundBanned,
      `Banned browser mock services should not exist in src/services: ${foundBanned.join(', ')}`,
    ).toEqual([]);
  });

  it('ensures routes-config patterns are all valid compiled regular expressions (Task R01, R04)', async () => {
    const { ALLOWED_BACKEND_ROUTES } = await import('../lib/routes-config');
    expect(ALLOWED_BACKEND_ROUTES.length).toBeGreaterThan(20);

    for (const route of ALLOWED_BACKEND_ROUTES) {
      expect(route.pattern).toBeInstanceOf(RegExp);
      expect(route.methods.length).toBeGreaterThan(0);
      for (const m of route.methods) {
        expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).toContain(m);
      }
    }
  });
});
