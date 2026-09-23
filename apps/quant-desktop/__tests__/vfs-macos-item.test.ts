import { describe, it, expect } from 'vitest';
import { VfsManifestManager } from '../src/vfs/manifest.js';

describe('Task W35-09: macOS FileProvider Replicated Extension Architecture', () => {
  it('maps VFS entries to macOS NSFileProviderItem specifications', () => {
    const vfs = new VfsManifestManager('~/Library/CloudStorage/QuantDrive-Enterprise');
    expect(vfs.getMountPoint()).toContain('CloudStorage');

    const folder = vfs.registerPlaceholder('fld_01', 'Projects', 0, [], true);
    const file = vfs.registerPlaceholder('fil_01', 'Projects/spec.pdf', 1048576, [
      { hash: 'b'.repeat(64), offset: 0, length: 65536 },
    ]);

    // Folder type identifier mapping
    expect(folder.isDir).toBe(true);
    expect(folder.name).toBe('Projects');

    // File type identifier and download badge mapping
    expect(file.isDir).toBe(false);
    expect(file.state).toBe('OFFLINE');
    expect(file.virtualSizeBytes).toBe(1048576);
    expect(file.physicalDiskSizeBytes).toBe(0);

    // When downloaded/cached, badge changes
    vfs.markCached('fil_01');
    const updated = vfs.getEntry('fil_01');
    expect(updated?.state).toBe('CACHED');
    expect(updated?.physicalDiskSizeBytes).toBe(1048576);
  });
});
