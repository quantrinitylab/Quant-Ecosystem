// ============================================================================
// AI Memory - Types
// ============================================================================

import { z } from 'zod';

export type MemoryCategory =
  | 'people'
  | 'places'
  | 'projects'
  | 'preferences'
  | 'skills'
  | 'goals'
  | 'schedules'
  | 'routines';

export type ExportFormat = 'json' | 'markdown' | 'csv';

export interface MemoryAccess {
  accessedAt: number;
  reason: string;
  requestingApp: string;
}

export interface MemoryEntry {
  id: string;
  userId: string;
  category: MemoryCategory;
  content: string;
  source: string;
  sourceApp: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  accessLog: MemoryAccess[];
  explanation: string;
  accessScopes: string[];
  writeSignal: 'explicit' | 'digest-approved' | 'pending-review';
  status: 'active' | 'pending';
  tags: string[];
}

export const MemoryEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  category: z.enum([
    'people',
    'places',
    'projects',
    'preferences',
    'skills',
    'goals',
    'schedules',
    'routines',
  ]),
  content: z.string(),
  source: z.string(),
  sourceApp: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number().optional(),
  accessLog: z.array(
    z.object({
      accessedAt: z.number(),
      reason: z.string(),
      requestingApp: z.string(),
    }),
  ),
  explanation: z.string(),
  accessScopes: z.array(z.string()),
  writeSignal: z.enum(['explicit', 'digest-approved', 'pending-review']),
  status: z.enum(['active', 'pending']),
  tags: z.array(z.string()),
});

export const MemoryExportSchema = z.object({
  version: z.string(),
  exportedAt: z.number(),
  userId: z.string(),
  entries: z.array(MemoryEntrySchema),
});

export interface MemoryExportData {
  version: string;
  exportedAt: number;
  userId: string;
  entries: MemoryEntry[];
}
