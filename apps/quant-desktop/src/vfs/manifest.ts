/**
 * Desktop VFS File Manifest & Placeholder Bridge
 *
 * Manages virtual drive representation for Windows ProjFS (G:\) and macOS FileProvider.
 * Offline files are registered as placeholders consuming 0 bytes local disk.
 */

export interface VfsManifestChunk {
  hash: string;
  offset: number;
  length: number;
}

export interface VfsFileEntry {
  id: string;
  path: string;
  name: string;
  isDir: boolean;
  virtualSizeBytes: number;
  physicalDiskSizeBytes: number; // 0 for offline files
  state: 'OFFLINE' | 'HYDRATING' | 'CACHED' | 'PINNED';
  chunks: VfsManifestChunk[];
  modifiedTimestamp: number;
}

export class VfsManifestManager {
  private entries = new Map<string, VfsFileEntry>();
  private mountPoint: string;

  constructor(mountPoint = 'G:\\') {
    this.mountPoint = mountPoint;
  }

  public registerPlaceholder(
    id: string,
    path: string,
    virtualSizeBytes: number,
    chunks: VfsManifestChunk[] = [],
    isDir = false,
  ): VfsFileEntry {
    const name = path.split(/[/\\]/).pop() || id;

    const entry: VfsFileEntry = {
      id,
      path,
      name,
      isDir,
      virtualSizeBytes,
      physicalDiskSizeBytes: 0, // Consumes 0 bytes local disk when offline!
      state: 'OFFLINE',
      chunks,
      modifiedTimestamp: Date.now(),
    };

    this.entries.set(id, entry);
    return entry;
  }

  public getEntry(id: string): VfsFileEntry | undefined {
    return this.entries.get(id);
  }

  public markHydrating(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.state = 'HYDRATING';
    }
  }

  public markCached(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.state = 'CACHED';
      entry.physicalDiskSizeBytes = entry.virtualSizeBytes;
    }
  }

  public markPinned(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.state = 'PINNED';
      entry.physicalDiskSizeBytes = entry.virtualSizeBytes;
    }
  }

  public listPlaceholders(): VfsFileEntry[] {
    return Array.from(this.entries.values());
  }

  public getMountPoint(): string {
    return this.mountPoint;
  }

  public clear(): void {
    this.entries.clear();
  }
}
