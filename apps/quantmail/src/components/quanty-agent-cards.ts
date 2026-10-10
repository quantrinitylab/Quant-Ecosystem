/**
 * Quanty visible agent mode (§9 "Live Visible Agent Mode") — client-side card
 * types and pure mapping helpers for the ai-chat native tool dispatch.
 *
 * The backend (`backend/routes/ai-chat.ts`) returns `toolExecutions` and
 * `confirmationCards` on every chat reply when tools are enabled. This module
 * is the drawer's contract with that response: the shapes mirror the backend's
 * `ToolExecutionCard` / `ToolConfirmationCard` interfaces, and the helpers map
 * them onto the shared `QuantyStepStatus` vocabulary from the QuantyLiveAgent
 * component library so the drawer timeline speaks the same language as the
 * rest of the agent surface.
 *
 * Everything here is pure (no DOM, no network) so it is unit-testable in the
 * node vitest environment.
 */
import type { QuantyStepStatus } from './QuantyLiveAgent/types';

/** One tool run inside an ai-chat turn. Mirrors the backend `ToolExecutionCard`. */
export interface AiChatToolExecutionCard {
  toolName: string;
  callId: string;
  /**
   * `pending-confirmation`: the call was NOT executed — it is waiting on the
   * user's explicit approval (see `confirmationId` / POST /ai/chat/confirm).
   */
  status: 'succeeded' | 'failed' | 'pending-confirmation';
  /** Short human label from the backend, e.g. `Created repository "demo"`. */
  label?: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
  durationMs?: number;
  /** Present when status === 'pending-confirmation'. */
  confirmationId?: string;
}

/**
 * Generic confirmation card (the PR #784 send-mail pattern, generalized):
 * the model proposed a state-changing action, the backend did NOT run it,
 * and the user decides. Mirrors the backend `ToolConfirmationCard`.
 */
export interface AiChatToolConfirmationCard {
  id: string;
  toolName: string;
  title: string;
  /** Exactly what will happen if the user confirms — written by the backend. */
  summary: string;
  args: Record<string, unknown>;
  expiresAt: string;
}

/** Map an ai-chat execution status onto the shared agent step vocabulary. */
export function toolExecutionToStepStatus(
  status: AiChatToolExecutionCard['status'],
): QuantyStepStatus {
  switch (status) {
    case 'succeeded':
      return 'done';
    case 'failed':
      return 'error';
    case 'pending-confirmation':
      return 'waiting-confirm';
  }
}

/**
 * Backend error codes that mean "the capability isn't wired" — as opposed to
 * a wired tool that failed at runtime. These render the honest "not wired
 * yet" note instead of a generic failure, so the user never has to guess
 * whether Quanty tried something and broke or simply cannot do it.
 */
export const UNWIRED_TOOL_ERROR_CODES: ReadonlySet<string> = new Set([
  'UNKNOWN_TOOL',
  'NOT_WIRED',
  'TOOL_NOT_ALLOWED',
]);

/** True when a failed execution is an unwired-capability failure, not a runtime error. */
export function isUnwiredToolFailure(card: AiChatToolExecutionCard): boolean {
  return (
    card.status === 'failed' && !!card.error && UNWIRED_TOOL_ERROR_CODES.has(card.error.code)
  );
}

/**
 * §9 honest unwired note, shown inline where the step would be. Plain
 * language, no claim anything ran.
 */
export function unwiredToolNote(toolName: string): string {
  return `Quanty doesn't have "${toolName}" wired up yet — nothing was run.`;
}

/** The step title the timeline shows: the backend label, or a plain fallback. */
export function toolStepLabel(card: AiChatToolExecutionCard): string {
  const label = typeof card.label === 'string' ? card.label.trim() : '';
  return label.length > 0 ? label : `Ran ${card.toolName}`;
}

/** Compact duration for the timeline: `320ms`, `1.2s`. Empty when unknown. */
export function formatToolDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs) || durationMs < 0) return '';
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/** Light shape guards so a malformed array never crashes the drawer. */
export function isToolExecutionCard(value: unknown): value is AiChatToolExecutionCard {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.toolName === 'string' &&
    typeof card.callId === 'string' &&
    (card.status === 'succeeded' || card.status === 'failed' || card.status === 'pending-confirmation')
  );
}

export function isToolConfirmationCard(value: unknown): value is AiChatToolConfirmationCard {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === 'string' &&
    typeof card.toolName === 'string' &&
    typeof card.title === 'string' &&
    typeof card.summary === 'string'
  );
}
