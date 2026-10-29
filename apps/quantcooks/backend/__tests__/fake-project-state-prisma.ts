// ============================================================================
// Composed fake for the P0-5 state methods (ProjectService.saveProjectState
// / getProjectState / duplicate-with-state).
//
// The state save spans two delegates — EditProject (version-checked
// updateMany) and EditLayer (projection rebuild) — inside one transaction.
// This fake composes the two established single-delegate fakes over their
// shared stores and adds `$transaction` as SEQUENTIAL execution over those
// stores. Documented honestly, per the P0-5 spec §2.3: this is not truly
// atomic (a throw mid-transaction does not roll back earlier writes). The
// fake-level tests therefore assert outcomes and the version gate — never
// rollback under injected mid-transaction faults; a rollback test belongs
// to the real-DB smoke in P0-6 (§3.4).
// ============================================================================

import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeEditLayerPrisma } from './fake-edit-layer-prisma';

export function createFakeProjectStatePrisma() {
  const project = createFakeEditProjectPrisma();
  const layer = createFakeEditLayerPrisma();

  const composed = {
    editProject: project.editProject,
    editLayer: layer.editLayer,
    projectRows: project.rows,
    layerRows: layer.rows,
    async $transaction<T>(
      fn: (tx: {
        editProject: typeof project.editProject;
        editLayer: typeof layer.editLayer;
      }) => Promise<T>,
    ): Promise<T> {
      return fn({ editProject: project.editProject, editLayer: layer.editLayer });
    },
  };

  return composed;
}

export type FakeProjectStatePrisma = ReturnType<typeof createFakeProjectStatePrisma>;
