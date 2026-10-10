// ============================================================================
// ai-chat tool confirmations — pending store for destructive native tool calls
// ============================================================================
//
// When the model calls a confirmation-gated tool (permissionTier >= 2, e.g.
// create_repository / commit_file) from POST /ai/chat, the chat turn does NOT
// execute it. Instead a pending confirmation is recorded here and the chat
// response carries a confirmation card. The action runs only when the user
// explicitly approves it via POST /ai/chat/confirm — the generic
// confirmation-card pattern (propose -> card -> explicit user confirm ->
// execute), never auto-approved.
//
// The store is in-memory, userId-scoped, short-TTL, and single-use: a
// confirmation id can be consumed exactly once, so a retried or replayed
// approval can never double-execute a write.

import { randomUUID } from 'node:crypto';

export interface PendingToolConfirmation {
  id: string;
  userId: string;
  toolName: string;
  callId: string;
  args: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

/** Awaiting-confirmation cards die quickly: the user decides in the moment. */
export const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

const pending = new Map<string, PendingToolConfirmation>();

function sweepExpired(now: number): void {
  for (const [id, record] of pending) {
    if (record.expiresAt <= now) pending.delete(id);
  }
}

export function createPendingConfirmation(input: {
  userId: string;
  toolName: string;
  callId: string;
  args: Record<string, unknown>;
}): PendingToolConfirmation {
  const now = Date.now();
  sweepExpired(now);
  const record: PendingToolConfirmation = {
    id: randomUUID(),
    createdAt: now,
    expiresAt: now + CONFIRMATION_TTL_MS,
    ...input,
  };
  pending.set(record.id, record);
  return record;
}

/** Read a pending confirmation without consuming it. */
export function peekPendingConfirmation(id: string): PendingToolConfirmation | null {
  sweepExpired(Date.now());
  return pending.get(id) ?? null;
}

/**
 * Consume a pending confirmation: it is removed and can never be used again.
 * Returns the record, or null when unknown/expired/already consumed.
 */
export function consumePendingConfirmation(id: string): PendingToolConfirmation | null {
  const record = peekPendingConfirmation(id);
  if (record) pending.delete(id);
  return record;
}
