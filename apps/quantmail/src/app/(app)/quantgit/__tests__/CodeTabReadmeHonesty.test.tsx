import { describe, it, expect, vi } from 'vitest';
import { resolveReadmeEditAction } from '../components/CodeTab';
import type { FileNode } from '../types';

// QM-SCREEN-013 R4 — the README preview's Edit button must never fire a
// success-sounding toast for an action that did nothing. When the repo has
// no README.md, the edit action must open the real blob editor (so the file
// is created via the real onCommitBlob path) and must NOT fire the old
// dead-control toast 'Opening README.md in editor...'.

describe('QM-SCREEN-013 R4: resolveReadmeEditAction (README editor honesty)', () => {
  it('opens the real editor for the existing README and fires no toast', () => {
    const readmeFile: FileNode = {
      name: 'README.md',
      path: 'README.md',
      type: 'file',
    };
    const openBlobEditor = vi.fn(() => Promise.resolve());
    const showToast = vi.fn();

    resolveReadmeEditAction({ readmeFile, openBlobEditor, showToast });

    expect(openBlobEditor).toHaveBeenCalledTimes(1);
    expect(openBlobEditor).toHaveBeenCalledWith(readmeFile);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('with no README.md, opens the editor to create it — never the dead-control toast', () => {
    const openBlobEditor = vi.fn(() => Promise.resolve());
    const showToast = vi.fn();

    resolveReadmeEditAction({
      readmeFile: undefined,
      openBlobEditor,
      showToast,
    });

    expect(openBlobEditor).toHaveBeenCalledTimes(1);
    const createdFile = openBlobEditor.mock.calls[0][0] as FileNode;
    expect(createdFile.path).toBe('README.md');
    expect(createdFile.name).toBe('README.md');
    expect(createdFile.type).toBe('file');

    const firedToasts = showToast.mock.calls.map((c) => c[0] as string);
    expect(firedToasts).not.toContain('Opening README.md in editor...');
    // Any toast fired must be honest about what is happening, never a
    // success-sounding one for an action that did nothing.
    for (const toast of firedToasts) {
      expect(toast.toLowerCase()).not.toMatch(/opening .* in editor\.{3}/);
    }
  });
});
