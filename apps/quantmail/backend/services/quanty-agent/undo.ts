// ============================================================================
// Quanty agent — undo support
// ============================================================================
//
// PURPOSE
//   Reverse the effects of a finished task's reversible steps. Each reversible
//   step carries an `undoToken` (e.g. `{ threadIds }`); this module maps the
//   step's tool to its inverse tool and re-invokes it with the same user
//   scoping. Steps without an inverse, or tasks with nothing reversible,
//   produce an honest "nothing to undo" result — never a fabricated success.
//
//   Supported inverses (v1):
//     mail.archiveUnread / mail.archiveThread -> mail.unarchiveThread (per thread)
//     mail.starImportant / mail.starThread    -> mail.starThread { starred: false }

import { getTool } from './tool-registry';
import type { QuantyStep, QuantyTask, QuantyToolContext } from './types';

interface InverseSpec {
  /** Inverse tool name in the engine registry. */
  tool: string;
  /** Extra args merged into the per-thread args. */
  extra?: Record<string, unknown>;
}

const INVERSES: Record<string, InverseSpec> = {
  'mail.archiveUnread': { tool: 'mail.unarchiveThread' },
  'mail.archiveThread': { tool: 'mail.unarchiveThread' },
  'mail.starImportant': { tool: 'mail.starThread', extra: { starred: false } },
  'mail.starThread': { tool: 'mail.starThread', extra: { starred: false } },
};

function threadIdsOf(step: QuantyStep): string[] {
  const fromToken = (step.undoToken as { threadIds?: unknown } | undefined)?.threadIds;
  if (Array.isArray(fromToken)) {
    return fromToken.filter((t): t is string => typeof t === 'string' && t.length > 0);
  }
  const fromArgs = step.args?.threadId;
  return typeof fromArgs === 'string' && fromArgs.length > 0 ? [fromArgs] : [];
}

export interface UndoOutcome {
  undone: number;
  details: string[];
}

/**
 * Undo every reversible, done step of the task (newest first).
 * Returns `{ undone: 0 }` when there is nothing reversible — the caller
 * should surface that honestly (HTTP 409) rather than claim success.
 */
export async function undoTaskSteps(
  task: QuantyTask,
  buildCtx: () => QuantyToolContext,
): Promise<UndoOutcome> {
  const details: string[] = [];
  let undone = 0;

  const candidates = task.steps
    .filter((s) => s.status === 'done' && s.reversible === true)
    .reverse();

  for (const step of candidates) {
    const spec = INVERSES[step.toolName];
    if (!spec) continue;
    const inverse = getTool(spec.tool);
    if (!inverse) continue;
    const threadIds = threadIdsOf(step);
    if (threadIds.length === 0) continue;

    const ctx = buildCtx();
    for (const threadId of threadIds) {
      const res = await inverse.handler({ threadId, ...(spec.extra ?? {}) }, ctx);
      if (!res.ok) {
        throw new Error(`Undo failed for ${step.toolName}: ${res.summary}`);
      }
      undone += 1;
    }
    details.push(`Reversed ${step.label} (${threadIds.length} thread${threadIds.length === 1 ? '' : 's'})`);
  }

  return { undone, details };
}
