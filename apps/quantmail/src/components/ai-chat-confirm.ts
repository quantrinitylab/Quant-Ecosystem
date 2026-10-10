/**
 * Resolve a generic ai-chat confirmation card via POST /api/ai/chat/confirm.
 *
 * The pending record is single-use and userId-scoped server-side: it is
 * consumed exactly once, so a retried approval can never double-execute.
 * This client mirrors that contract — the resolution result is terminal and
 * the UI must disable the Confirm/Cancel buttons once it lands.
 *
 * Kept as a standalone module (no React) so the network mapping is
 * unit-testable in the node vitest environment.
 */
import { browserAuthSession } from '../services/browser-auth-session';
import type { AiChatToolExecutionCard } from './quanty-agent-cards';

export type ConfirmationResolution =
  | {
      ok: true;
      approved: boolean;
      /** The executed (or declined) run — render it inline via the timeline. */
      toolExecution: AiChatToolExecutionCard;
    }
  | {
      ok: false;
      reason: 'not-found' | 'forbidden' | 'error';
      /** Honest user-facing note: always states that nothing was executed. */
      note: string;
    };

interface ConfirmPayload {
  success?: boolean;
  data?: { toolExecution?: AiChatToolExecutionCard };
  error?: { code?: string; message?: string };
}

export async function resolveAiChatConfirmation(
  confirmationId: string,
  approved: boolean,
): Promise<ConfirmationResolution> {
  let response: Response;
  try {
    response = await browserAuthSession.authenticatedFetch('/api/ai/chat/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationId, approved }),
    });
  } catch {
    // The decision never reached the server: the confirmation is still
    // pending there, and — critically — nothing was executed.
    return {
      ok: false,
      reason: 'error',
      note: approved
        ? 'Could not reach Quanty to confirm — the action is still pending and nothing was executed.'
        : 'Could not reach Quanty to cancel — the action is still pending and nothing was executed.',
    };
  }

  const payload = (await response.json().catch(() => null)) as ConfirmPayload | null;

  if (response.ok && payload?.success && payload.data?.toolExecution) {
    return { ok: true, approved, toolExecution: payload.data.toolExecution };
  }

  const code = payload?.error?.code;
  if (response.status === 404 || code === 'CONFIRMATION_NOT_FOUND') {
    // Single-use semantics: consumed or expired server-side. Say so plainly —
    // the card is dead and must not be offered again.
    return {
      ok: false,
      reason: 'not-found',
      note: 'This confirmation expired or was already used — nothing was executed.',
    };
  }
  if (response.status === 403 || code === 'CONFIRMATION_FORBIDDEN') {
    return {
      ok: false,
      reason: 'forbidden',
      note: "This confirmation isn't yours — nothing was executed.",
    };
  }
  return {
    ok: false,
    reason: 'error',
    note: payload?.error?.message
      ? `Quanty could not resolve this confirmation: ${payload.error.message} — nothing was executed.`
      : 'Quanty could not resolve this confirmation — nothing was executed.',
  };
}
