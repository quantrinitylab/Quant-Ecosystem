// ============================================================================
// AI Memory - Async Store Port
//
// The async counterpart to AIMemoryStore's sync API. Same operations, Promise
// results — the shape durable backends (Prisma/Postgres) implement. The
// in-memory AIMemoryStore keeps its sync API for tests and zero-DB
// environments; AsyncAIMemoryStoreAdapter (async-adapter.ts) bridges it to
// this port so MemoryService has ONE code path regardless of backend.
// ============================================================================

import type { MemoryEntry, MemoryCategory, MemoryAccess } from './types';

export interface CreateMemoryInput {
  userId: string;
  category: MemoryCategory;
  content: string;
  source: string;
  sourceApp: string;
  explanation: string;
  writeSignal: 'explicit' | 'digest-approved' | 'pending-review';
  accessScopes: string[];
  tags: string[];
  expiresAt?: number;
  status: 'active' | 'pending';
}

export interface UpdateMemoryInput {
  content?: string;
  category?: MemoryCategory;
  tags?: string[];
  explanation?: string;
}

export interface MemoryStorePort {
  create(entry: CreateMemoryInput): Promise<MemoryEntry>;
  createCandidate(
    entry: Omit<CreateMemoryInput, 'writeSignal' | 'status'>,
  ): Promise<MemoryEntry>;
  approveCandidate(id: string): Promise<MemoryEntry | undefined>;
  rejectCandidate(id: string): Promise<boolean>;
  getPendingCandidates(userId: string): Promise<MemoryEntry[]>;
  purgeByTag(userId: string, tag: string): Promise<number>;
  get(id: string): Promise<MemoryEntry | undefined>;
  update(id: string, updates: UpdateMemoryInput): Promise<MemoryEntry | undefined>;
  delete(id: string): Promise<boolean>;
  searchByCategory(userId: string, category: MemoryCategory): Promise<MemoryEntry[]>;
  searchByContent(userId: string, query: string): Promise<MemoryEntry[]>;
  logAccess(id: string, access: MemoryAccess): Promise<boolean>;
  getUserMemories(userId: string): Promise<MemoryEntry[]>;
  deleteUserMemories(userId: string): Promise<number>;
  getAccessLog(id: string): Promise<MemoryAccess[]>;
}
