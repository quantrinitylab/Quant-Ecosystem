// ============================================================================
// Editor wiring guard (P0-5).
//
// Why source-level assertions: in this extract the editor page module
// cannot be imported by the test runner — it pulls @quant/shared-ui,
// @quant/brand and framer-motion, which the extract's module graph cannot
// resolve (the same documented limit that excludes backend/app.ts from
// scoped tsc; its behaviour is runtime-proven in a full checkout). The
// behaviour-bearing pieces ARE unit-tested for real: the save machine
// (editor-save-machine.test.ts), the document helpers
// (editor-document.test.ts), and the backend round-trip
// (project-state.*.test.ts). This file pins the page-level wiring those
// pieces plug into, so the P0-5 regressions the teardown recorded —
// unreachable editor, 'default' project id, phantom `.tracks` hydration,
// the fake useProject hook, two components named AssetLibrary — cannot
// silently return.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), 'utf8');

describe('editor wiring (P0-5)', () => {
  const editor = read('src/pages/editor.tsx');

  it('loads state via useProjectState and hydrates from the document (no phantom .tracks cast)', () => {
    expect(editor).toContain('useProjectState');
    expect(editor).toContain('hydrateFromProjectState');
    expect(editor).not.toContain('tracks?: Track[]');
    expect(editor).not.toContain('useProjectById');
  });

  it("takes the project id from the router query — the 'default' fallback is gone", () => {
    expect(editor).toContain('router.query.projectId');
    expect(editor).not.toContain("= 'default'");
    expect(editor).not.toContain('useProject(');
  });

  it('saves through useEditorSave with visible status + conflict actions', () => {
    expect(editor).toContain('useEditorSave');
    expect(editor).toContain('save-status');
    expect(editor).toContain("resolveConflict('reload')");
    expect(editor).toContain("resolveConflict('overwrite')");
    expect(editor).toContain('Offline — kept in this browser');
  });

  it('mounts the shared AssetLibrary panel (aliased) with the project id', () => {
    expect(editor).toContain("AssetLibraryPanel from '../components/AssetLibrary'");
    expect(editor).toContain('projectId={projectId}');
  });

  it('the gallery and the project manager both link into the editor', () => {
    expect(read('src/pages/projects-gallery.tsx')).toContain('/editor?projectId=');
    expect(read('src/pages/projects.tsx')).toContain('/editor?projectId=');
  });

  it('the fake useProject hook is deleted', () => {
    expect(existsSync(join(APP_ROOT, 'src/hooks/useProject.ts'))).toBe(false);
  });

  it('exactly one component is named AssetLibrary (the shared panel)', () => {
    const assetsPage = read('src/pages/assets.tsx');
    expect(assetsPage).toContain('const AssetsPageLibrary');
    expect(assetsPage).toContain('export default AssetsPageLibrary');
    expect(assetsPage).not.toMatch(/const AssetLibrary[:=]/);
    expect(read('src/components/AssetLibrary.tsx')).toContain('const AssetLibrary');
  });
});
