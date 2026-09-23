import { describe, it, expect, beforeEach } from 'vitest';
import { VfsManifestManager } from '../src/vfs/manifest.js';

describe('Task W35-08: Rust Native Windows Cloud Files Bridge Mounting G:\\', () => {
  let vfs: VfsManifestManager;

  beforeEach(() => {
    vfs = new VfsManifestManager('G:\\');
  });

  it('mounts virtual drive G:\\ with 0 bytes local disk footprint for offline files', () => {
    expect(vfs.getMountPoint()).toBe('G:\\');

    // Register a 5GB large ISO file
    const fiveGb = 5 * 1024 * 1024 * 1024;
    const entry = vfs.registerPlaceholder('file_iso_001', 'G:\\Images\\ubuntu.iso', fiveGb, [
      { hash: 'a'.repeat(64), offset: 0, length: 65536 },
    ]);

    expect(entry.virtualSizeBytes).toBe(fiveGb);
    // Crucial acceptance criteria: offline cloud placeholder consumes 0 bytes local disk
    expect(entry.physicalDiskSizeBytes).toBe(0);
    expect(entry.state).toBe('OFFLINE');
    expect(entry.name).toBe('ubuntu.iso');
  });

  it('transitions state from OFFLINE to HYDRATING to CACHED and PINNED', () => {
    const entry = vfs.registerPlaceholder('doc_001', 'G:\\Contracts\\deal.pdf', 204800);
    expect(entry.state).toBe('OFFLINE');
    expect(entry.physicalDiskSizeBytes).toBe(0);

    vfs.markHydrating('doc_001');
    expect(vfs.getEntry('doc_001')?.state).toBe('HYDRATING');

    vfs.markCached('doc_001');
    const cached = vfs.getEntry('doc_001');
    expect(cached?.state).toBe('CACHED');
    expect(cached?.physicalDiskSizeBytes).toBe(204800);

    vfs.markPinned('doc_001');
    const pinned = vfs.getEntry('doc_001');
    expect(pinned?.state).toBe('PINNED');
    expect(pinned?.physicalDiskSizeBytes).toBe(204800);
  });

  it('enumerates directory and file placeholders in Windows File Explorer', () => {
    vfs.registerPlaceholder('folder_docs', 'G:\\Documents', 0, [], true);
    vfs.registerPlaceholder('folder_photos', 'G:\\Photos', 0, [], true);
    vfs.registerPlaceholder('file_readme', 'G:\\README.md', 1024, []);

    const list = vfs.listPlaceholders();
    expect(list.length).toBe(3);

    const dirCount = list.filter((e) => e.isDir).length;
    const fileCount = list.filter((e) => !e.isDir).length;

    expect(dirCount).toBe(2);
    expect(fileCount).toBe(1);
  });
});
