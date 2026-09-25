/**
 * Quant Desktop Sovereign Architecture Types
 */

export type AppId = 'quantmail' | 'codehub' | 'quantdrive' | 'quantchat' | 'quantube' | 'quantai';

export interface QuantAppDefinition {
  id: AppId;
  name: string;
  tagline: string;
  defaultPort: number;
  route: string;
  icon: string;
  accentColor: string;
  badge?: string;
  description: string;
  features: string[];
}

export type VfsSyncState = 'SYNCHRONIZED' | 'SYNCING' | 'OFFLINE_PLACEHOLDER' | 'ERROR';

export interface VfsTelemetry {
  status: VfsSyncState;
  mountPoint: string;
  statusText: string;
  virtualSizeBytes: number;
  physicalDiskSizeBytes: number;
  dedupRatio: number;
  cachedChunksCount: number;
  totalChunksCount: number;
  chunkAlgorithm: 'FastCDC-64KB Gear CAS';
  lastSyncTimestamp: number;
}

export type CommandCategory = 'Apps' | 'VFS Storage' | 'Window' | 'System';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  shortcut?: string;
  icon?: string;
  keywords?: string[];
  action: () => void;
}
