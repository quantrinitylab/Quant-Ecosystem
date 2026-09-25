import { VfsManifestManager } from '../vfs/manifest';
import { LruChunkCacheTs } from '../vfs/cache';
import type { VfsTelemetry, VfsSyncState } from '../types';

export class DesktopVfsService {
  private static instance: DesktopVfsService;
  private manifest: VfsManifestManager;
  private lruCache: LruChunkCacheTs;
  private syncState: VfsSyncState = 'SYNCHRONIZED';
  private listeners: Set<(telemetry: VfsTelemetry) => void> = new Set();

  private constructor() {
    this.manifest = new VfsManifestManager('G:\\');
    this.lruCache = new LruChunkCacheTs(1024 * 1024 * 1024); // 1GB L1 cache
    this.seedInitialPlaceholders();
  }

  public static getInstance(): DesktopVfsService {
    if (!DesktopVfsService.instance) {
      DesktopVfsService.instance = new DesktopVfsService();
    }
    return DesktopVfsService.instance;
  }

  private seedInitialPlaceholders(): void {
    // Seed initial representative workspace virtual placeholders
    this.manifest.registerPlaceholder(
      'dataset-ml-weights-01',
      'G:\\QuantAI\\models\\quant-7b-q4.gguf',
      4.2 * 1024 * 1024 * 1024, // 4.2 GB
      [{ hash: 'cas_chunk_f8a9e201b4c3', offset: 0, length: 65536 }],
    );

    this.manifest.registerPlaceholder(
      'codehub-repo-pack-01',
      'G:\\CodeHub\\quant-ecosystem\\objects.pack',
      1.8 * 1024 * 1024 * 1024, // 1.8 GB
      [{ hash: 'cas_chunk_b3c2d1e0f9a8', offset: 0, length: 65536 }],
    );

    this.manifest.registerPlaceholder(
      'quantube-master-video-01',
      'G:\\QuanTube\\renders\\keynote-4k.mp4',
      6.5 * 1024 * 1024 * 1024, // 6.5 GB
      [{ hash: 'cas_chunk_9944aabbccdd', offset: 0, length: 65536 }],
    );

    this.manifest.registerPlaceholder(
      'quantdrive-archive-01',
      'G:\\QuantDrive\\Documents\\Financials-2026.pdf',
      24 * 1024 * 1024, // 24 MB
      [{ hash: 'cas_chunk_112233445566', offset: 0, length: 65536 }],
    );

    // Pin one entry to reflect active cache hydration
    this.manifest.markCached('quantdrive-archive-01');
    this.manifest.markPinned('quantdrive-archive-01');
  }

  public getTelemetry(): VfsTelemetry {
    const entries = this.manifest.listPlaceholders();
    let totalVirtualBytes = 0;
    let totalPhysicalBytes = 0;
    let cachedChunks = 0;
    let totalChunks = 0;

    for (const entry of entries) {
      totalVirtualBytes += entry.virtualSizeBytes;
      totalPhysicalBytes += entry.physicalDiskSizeBytes;
      totalChunks += entry.chunks.length || 1;
      if (entry.state === 'CACHED' || entry.state === 'PINNED') {
        cachedChunks += entry.chunks.length || 1;
      }
    }

    // Baseline deduplication multiplier for FastCDC 64KB CAS Gear
    const dedupRatio =
      totalPhysicalBytes > 0
        ? Number((totalVirtualBytes / Math.max(totalPhysicalBytes, 1)).toFixed(1))
        : 4.8;

    return {
      status: this.syncState,
      mountPoint: this.manifest.getMountPoint(),
      statusText: this.formatStatusText(this.syncState),
      virtualSizeBytes: totalVirtualBytes,
      physicalDiskSizeBytes: totalPhysicalBytes,
      dedupRatio,
      cachedChunksCount: cachedChunks,
      totalChunksCount: Math.max(totalChunks, 48),
      chunkAlgorithm: 'FastCDC-64KB Gear CAS',
      lastSyncTimestamp: Date.now(),
    };
  }

  private formatStatusText(state: VfsSyncState): string {
    switch (state) {
      case 'SYNCHRONIZED':
        return 'VFS: Synchronized - 64KB Gear CAS';
      case 'SYNCING':
        return 'VFS: Syncing CAS Blocks (FastCDC 64KB)...';
      case 'OFFLINE_PLACEHOLDER':
        return 'VFS: Standby (0-byte Placeholders Ready)';
      case 'ERROR':
        return 'VFS: Bridge Warning - Drive Resync Required';
    }
  }

  public setSyncState(state: VfsSyncState): void {
    this.syncState = state;
    this.notify();
  }

  public triggerFastCdcReindex(): Promise<void> {
    this.setSyncState('SYNCING');
    return new Promise((resolve) => {
      setTimeout(() => {
        this.setSyncState('SYNCHRONIZED');
        resolve();
      }, 1200);
    });
  }

  public flushL1Cache(): void {
    this.lruCache = new LruChunkCacheTs(1024 * 1024 * 1024);
    this.notify();
  }

  public subscribe(listener: (telemetry: VfsTelemetry) => void): () => void {
    this.listeners.add(listener);
    listener(this.getTelemetry());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const telemetry = this.getTelemetry();
    for (const listener of this.listeners) {
      listener(telemetry);
    }
  }
}

export const vfsService = DesktopVfsService.getInstance();
