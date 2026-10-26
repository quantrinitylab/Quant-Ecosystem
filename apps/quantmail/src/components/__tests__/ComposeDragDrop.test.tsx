import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Wiring assertions for compose drag-and-drop (fix/qm-compose-drag-drop).
 *
 * Static markup cannot show event handlers or the drag overlay (it only
 * renders while files hover), so — following EmailComposerComposeP1s —
 * these tests assert on the component source: both attachment-capable
 * composers must carry the full drag lifecycle on their root element and
 * render a drop overlay, and both must decide through the shared
 * decideAttachmentFiles helper so drop admits exactly what the picker
 * admits. ThreadComposer is deliberately NOT asserted here: it has no
 * attachment channel at all (text-only send path), so there is nothing
 * a drop could attach to — adding attachments there would be a new
 * feature, not this fix.
 */
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const DRAG_HANDLERS = ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop'];

describe('compose drag-and-drop wiring', () => {
  it.each([
    ['EmailComposer', '../EmailComposer.tsx'],
    ['DockedComposer', '../DockedComposer.tsx'],
  ])('%s wires the full drag lifecycle on its root and renders a drop overlay', (_name, rel) => {
    const src = read(rel);
    for (const handler of DRAG_HANDLERS) {
      expect(src).toContain(handler);
    }
    expect(src).toContain('data-testid="composer-drop-overlay"');
    expect(src).toContain('Drop files to attach');
    expect(src).toContain('decideAttachmentFiles');
    expect(src).toContain('dragCarriesFiles');
    expect(src).toContain("dropEffect = 'copy'");
  });

  it('the full composer body placeholder promise is now backed by a real drop handler', () => {
    const src = read('../EmailComposer.tsx');
    expect(src).toContain('drag and drop files');
    expect(src).toContain('handleComposerDrop');
  });

  it('drop handlers refuse to hijack non-file drags', () => {
    for (const rel of ['../EmailComposer.tsx', '../DockedComposer.tsx']) {
      const src = read(rel);
      expect(src).toContain('if (!dragCarriesFiles(e.dataTransfer)) return;');
    }
  });

  it('drop handlers prevent the browser navigating away to the dropped file', () => {
    for (const rel of ['../EmailComposer.tsx', '../DockedComposer.tsx']) {
      const src = read(rel);
      // The drop handler's first statement must be preventDefault.
      expect(src).toMatch(/handleComposerDrop = \(e: React\.DragEvent\) => \{\s*e\.preventDefault\(\);/);
    }
  });
});
