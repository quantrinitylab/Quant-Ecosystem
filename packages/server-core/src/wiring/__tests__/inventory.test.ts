/**
 * Unit tests for the checked-in engine wiring inventory (Task 2.1) and the
 * DoD-1 import-graph evaluator (Task 2.2).
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 5.1, 5.5**
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  ENGINE_INVENTORY,
  crossCuttingEngines,
  perAppEngines,
  deferredEngines,
} from '../inventory';
import {
  validateInventory,
  stageInRange,
  targetsValidForLane,
  DEFERRED_SCAFFOLDS,
  CROSS_CUTTING_TARGET,
} from '../types';
import {
  moduleImportsSpecifier,
  evaluateImporter,
  findConsumersWithDependency,
  isTestModule,
} from '../dod-evaluator';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

describe('engine wiring inventory', () => {
  it('passes every structural invariant (lanes, targets, stages, ordering)', () => {
    expect(validateInventory(ENGINE_INVENTORY)).toEqual([]);
  });

  it('records a substantial reconciliation of the orphaned engines', () => {
    // The design references ~68 orphaned engines; the reconciled inventory covers
    // them (excluding foundation substrate / tooling / non-packages).
    expect(ENGINE_INVENTORY.length).toBeGreaterThanOrEqual(68);
    expect(ENGINE_INVENTORY.filter((w) => w.lane !== 'deferred').length).toBeGreaterThanOrEqual(60);
  });

  it('assigns exactly one lane per engine with valid stage and targets (Req 6.1-6.3)', () => {
    for (const w of ENGINE_INVENTORY) {
      expect(['cross-cutting', 'per-app', 'deferred']).toContain(w.lane);
      expect(stageInRange(w)).toBe(true);
      expect(targetsValidForLane(w)).toBe(true);
    }
  });

  it('targets cross-cutting engines at server-core only (Req 6.2)', () => {
    for (const w of crossCuttingEngines()) {
      expect(w.targets).toEqual([CROSS_CUTTING_TARGET]);
    }
  });

  it('targets per-app engines at least one app (and never server-core) (Req 6.2)', () => {
    for (const w of perAppEngines()) {
      expect(w.targets.length).toBeGreaterThanOrEqual(1);
      expect(w.targets).not.toContain(CROSS_CUTTING_TARGET);
    }
  });

  it('marks the five thin scaffolds deferred with a reason (Req 6.4)', () => {
    const deferredNames = new Set(deferredEngines().map((w) => w.engine));
    for (const scaffold of DEFERRED_SCAFFOLDS) {
      expect(deferredNames.has(scaffold)).toBe(true);
    }
    for (const w of deferredEngines()) {
      expect(w.status).toBe('deferred');
      expect(w.reason && w.reason.length).toBeTruthy();
    }
  });

  it('includes the cross-cutting engines named by the design', () => {
    const names = new Set(ENGINE_INVENTORY.map((w) => w.engine));
    for (const named of [
      '@quant/api-client',
      '@quant/identity-permissions',
      '@quant/teams',
      '@quant/observability',
      '@quant/feature-flags',
      '@quant/audit',
      '@quant/organizations',
      '@quant/notifications',
    ]) {
      expect(names.has(named)).toBe(true);
    }
  });

  it('includes the deepest per-app agent engines targeting quantai', () => {
    const quantaiEngines = perAppEngines()
      .filter((w) => w.targets.includes('quantai'))
      .map((w) => w.engine);
    for (const named of ['@quant/agent-runtime', '@quant/agent-swarm', '@quant/code-agent']) {
      expect(quantaiEngines).toContain(named);
    }
  });
});

describe('DoD-1 import-graph evaluator', () => {
  describe('moduleImportsSpecifier', () => {
    it('matches static, named, dynamic and require imports', () => {
      expect(
        moduleImportsSpecifier("import { x } from '@quant/notifications';", '@quant/notifications'),
      ).toBe(true);
      expect(moduleImportsSpecifier("import '@quant/notifications';", '@quant/notifications')).toBe(
        true,
      );
      expect(
        moduleImportsSpecifier("const m = require('@quant/notifications')", '@quant/notifications'),
      ).toBe(true);
      expect(
        moduleImportsSpecifier("await import('@quant/notifications/sub')", '@quant/notifications'),
      ).toBe(true);
    });

    it('does not match an unrelated or prefix-colliding specifier', () => {
      expect(
        moduleImportsSpecifier(
          "import { x } from '@quant/notifications-extra';",
          '@quant/notifications',
        ),
      ).toBe(false);
      expect(
        moduleImportsSpecifier("import { x } from '@quant/other';", '@quant/notifications'),
      ).toBe(false);
      expect(
        moduleImportsSpecifier(
          '// just a comment mentioning @quant/notifications',
          '@quant/notifications',
        ),
      ).toBe(false);
    });
  });

  it('classifies test/mocks modules as non-importers', () => {
    expect(isTestModule(path.join('apps', 'quantai', 'x.test.ts'))).toBe(true);
    expect(isTestModule(path.join('packages', 'server-core', 'src', '__tests__', 'a.ts'))).toBe(
      true,
    );
    expect(isTestModule(path.join('packages', 'server-core', 'src', 'app.ts'))).toBe(false);
  });

  it('confirms a genuinely-wired substrate import passes DoD-1 (@quant/database)', () => {
    // server-core/src/plugins/prisma.ts imports @quant/database (non-test) and the
    // package lists it in dependencies — a real positive control for the evaluator.
    const evidence = evaluateImporter('@quant/database', REPO_ROOT, ['packages/server-core']);
    expect(evidence.importers.length).toBeGreaterThan(0);
    expect(evidence.consumerPackages.length).toBeGreaterThan(0);
    expect(evidence.importerExists).toBe(true);
  });

  it('reports an unwired engine as failing DoD-1', () => {
    const evidence = evaluateImporter('@quant/co-presence', REPO_ROOT, ['packages/server-core']);
    expect(evidence.importerExists).toBe(false);
  });

  it('finds the consumer package that declares a dependency', () => {
    const consumers = findConsumersWithDependency('@quant/database', REPO_ROOT);
    expect(consumers.some((c) => c.includes('server-core'))).toBe(true);
  });
});
