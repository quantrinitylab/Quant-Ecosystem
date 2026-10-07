/**
 * Property-based tests for the engine wiring inventory invariants (Task 2.3).
 *
 * Uses fast-check to assert the design's correctness properties over generated
 * wiring sets:
 *   - P1: `done ⟹ importer exists`
 *   - P3: cross-cutting engines have exactly one registration site
 *   - P4: dependency ordering (acyclic + dependencies never in a later stage)
 *
 * **Validates: Requirements 8.4, 5.5**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  type DoDResult,
  type EngineWiring,
  isDone,
  statusConsistentWithDoD,
  crossCuttingRegisteredOnce,
  registrationSiteCount,
  dependencyOrderValid,
  dependencyStagesMonotonic,
  isAcyclic,
  computeRegistrationOrder,
} from '../types';

const dodArb: fc.Arbitrary<DoDResult> = fc.record({
  importerExists: fc.boolean(),
  routeReachableAuthed: fc.boolean(),
  routeRejectsUnauthed: fc.boolean(),
  frontendConsumes: fc.boolean(),
  seamTested: fc.boolean(),
});

// A set of unique cross-cutting wirings built from unique engine ids.
const crossCuttingInventoryArb: fc.Arbitrary<EngineWiring[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 12 })
  .map((ids) =>
    ids.map(
      (id): EngineWiring => ({
        engine: `@quant/cc-${id}`,
        lane: 'cross-cutting',
        targets: ['server-core'],
        stage: 1,
        dependsOn: [],
        status: 'pending',
      }),
    ),
  );

// A randomly-shaped but well-formed dependency graph: edges only point to
// earlier-indexed nodes (so the graph is acyclic) AND only to nodes whose stage
// is <= the dependent's stage (so it is stage-monotonic by construction).
const wellFormedDagArb: fc.Arbitrary<EngineWiring[]> = fc
  .array(
    fc.record({
      stage: fc.integer({ min: 0, max: 6 }),
      depBits: fc.array(fc.boolean(), { maxLength: 12 }),
    }),
    { minLength: 1, maxLength: 10 },
  )
  .map((nodes) => {
    const inv: EngineWiring[] = nodes.map((nd, i) => ({
      engine: `@quant/node-${i}`,
      lane: 'per-app',
      targets: ['appx'],
      stage: nd.stage,
      dependsOn: [],
      status: 'pending',
    }));
    nodes.forEach((nd, i) => {
      const cur = inv[i];
      if (!cur) return;
      for (let j = 0; j < i; j++) {
        const dep = inv[j];
        if (!dep) continue;
        if (nd.depBits[j] === true && dep.stage <= cur.stage) {
          cur.dependsOn.push(dep.engine);
        }
      }
    });
    return inv;
  });

describe('wiring invariants (property-based)', () => {
  describe('P1 — done implies importer exists', () => {
    it('isDone(dod) always implies dod.importerExists', () => {
      fc.assert(
        fc.property(dodArb, (dod) => {
          if (isDone(dod)) {
            expect(dod.importerExists).toBe(true);
          }
        }),
      );
    });

    it('a wiring is only status-consistent as `done` when every DoD field holds', () => {
      fc.assert(
        fc.property(dodArb, (dod) => {
          const gated: EngineWiring = {
            engine: '@quant/x',
            lane: 'per-app',
            targets: ['appx'],
            stage: 2,
            dependsOn: [],
            status: isDone(dod) ? 'done' : 'pending',
          };
          expect(statusConsistentWithDoD(gated, dod)).toBe(true);
        }),
      );
    });

    it('detects an inconsistent `done` wiring with no importer', () => {
      const dod: DoDResult = {
        importerExists: false,
        routeReachableAuthed: true,
        routeRejectsUnauthed: true,
        frontendConsumes: true,
        seamTested: true,
      };
      const w: EngineWiring = {
        engine: '@quant/x',
        lane: 'per-app',
        targets: ['appx'],
        stage: 2,
        dependsOn: [],
        status: 'done',
      };
      expect(statusConsistentWithDoD(w, dod)).toBe(false);
    });
  });

  describe('P3 — cross-cutting engines register exactly once', () => {
    it('a unique set of cross-cutting wirings has one registration site each', () => {
      fc.assert(
        fc.property(crossCuttingInventoryArb, (inv) => {
          expect(crossCuttingRegisteredOnce(inv)).toBe(true);
          for (const w of inv) {
            expect(registrationSiteCount(inv, w.engine)).toBe(1);
          }
        }),
      );
    });

    it('detects a duplicated cross-cutting registration', () => {
      fc.assert(
        fc.property(crossCuttingInventoryArb, (inv) => {
          const first = inv[0];
          if (!first) return;
          const withDup = [...inv, { ...first }];
          expect(registrationSiteCount(withDup, first.engine)).toBe(2);
          expect(crossCuttingRegisteredOnce(withDup)).toBe(false);
        }),
      );
    });

    it('detects a cross-cutting engine also wired per-app', () => {
      fc.assert(
        fc.property(crossCuttingInventoryArb, (inv) => {
          const first = inv[0];
          if (!first) return;
          const withPerApp: EngineWiring[] = [
            ...inv,
            { ...first, lane: 'per-app', targets: ['appx'] },
          ];
          expect(crossCuttingRegisteredOnce(withPerApp)).toBe(false);
        }),
      );
    });
  });

  describe('P4 — dependency ordering', () => {
    it('a well-formed graph is acyclic, stage-monotonic, and order places deps first', () => {
      fc.assert(
        fc.property(wellFormedDagArb, (inv) => {
          expect(dependencyOrderValid(inv)).toBe(true);

          const order = computeRegistrationOrder(inv);
          const indexOf = new Map(order.map((w, idx) => [w.engine, idx]));
          for (const w of inv) {
            const dependentIdx = indexOf.get(w.engine);
            expect(dependentIdx).toBeDefined();
            for (const dep of w.dependsOn) {
              const depIdx = indexOf.get(dep);
              // Every in-inventory dependency is registered before its dependent.
              if (depIdx !== undefined) {
                expect(depIdx).toBeLessThan(dependentIdx as number);
              }
            }
          }
        }),
      );
    });

    it('detects a back-edge into a later stage as invalid ordering', () => {
      const inv: EngineWiring[] = [
        {
          engine: '@quant/early',
          lane: 'per-app',
          targets: ['appx'],
          stage: 1,
          dependsOn: ['@quant/late'],
          status: 'pending',
        },
        {
          engine: '@quant/late',
          lane: 'per-app',
          targets: ['appx'],
          stage: 3,
          dependsOn: [],
          status: 'pending',
        },
      ];
      expect(dependencyStagesMonotonic(inv)).toBe(false);
      expect(dependencyOrderValid(inv)).toBe(false);
    });

    it('detects a dependency cycle', () => {
      const inv: EngineWiring[] = [
        {
          engine: '@quant/a',
          lane: 'per-app',
          targets: ['appx'],
          stage: 2,
          dependsOn: ['@quant/b'],
          status: 'pending',
        },
        {
          engine: '@quant/b',
          lane: 'per-app',
          targets: ['appx'],
          stage: 2,
          dependsOn: ['@quant/a'],
          status: 'pending',
        },
      ];
      expect(isAcyclic(inv)).toBe(false);
      expect(dependencyOrderValid(inv)).toBe(false);
    });
  });
});
