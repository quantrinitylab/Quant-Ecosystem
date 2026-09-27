import type React from 'react';

/**
 * Quant Desktop Sovereign Architecture Types
 */

export type AppId = 'quantmail' | 'codehub' | 'quantdrive' | 'quantchat' | 'quantube' | 'quantai';

export type DesktopTab = 'dashboard' | 'overview' | AppId;

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

export type CommandCategory = 'Apps' | 'VFS Storage' | 'Window' | 'System' | 'Audio Room' | 'Gifts';

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

/**
 * Live Audio Room Stage Information for Desktop Quick Actions & Dock
 */
export interface AudioRoomStageInfo {
  id: string;
  title: string;
  topic?: string;
  hostName: string;
  hostAvatar?: string;
  speakersCount: number;
  listenersCount: number;
  isLive: boolean;
  activeSpeaker?: string;
  tags?: string[];
}

/**
 * Virtual Gift Item for Desktop Quick Actions & Shortie Economy
 */
export interface VirtualGiftItem {
  id: string;
  name: string;
  costCoins: number;
  icon: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

/**
 * Nexsas Bento KPI Metric Card Props
 */
export interface KpiMetricCardProps {
  title: string;
  value: string | number;
  change: number; // e.g. 14.2 for +14.2%, -3.1 for -3.1%
  changeLabel?: string;
  timePeriod?: string;
  sparklineData?: number[];
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Nexsas Bento Feature Grid Item
 */
export interface BentoItem {
  id: string;
  title: string;
  description: string;
  span?: '1x1' | '2x1' | '1x2' | '2x2';
  badge?: string;
  icon?: React.ReactNode;
  preview?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * Nexsas FAQ Accordion Item
 */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}
