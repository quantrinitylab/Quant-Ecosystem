'use client';

/**
 * Quanty visible agent mode (§9) — generic confirmation card.
 *
 * The generalization of the PR #784 send-mail card: the model proposed a
 * state-changing tool call, the backend did NOT execute it, and the user
 * decides. The card shows exactly what will happen (the backend-written
 * summary), a preview of the inputs, and Confirm / Cancel.
 *
 * Confirm resolves via POST /api/ai/chat/confirm; the executed run renders
 * inline below the card through the tool timeline. Cancel resolves the same
 * way with `approved: false`. The pending record is single-use server-side,
 * and this card mirrors that: the buttons disable the moment a decision is
 * made, and an expired/already-used confirmation surfaces an honest note
 * instead of a second offer.
 */
import { useState, type ReactNode } from 'react';
import { resolveAiChatConfirmation } from './ai-chat-confirm';
import { QuantyToolTimeline } from './QuantyToolTimeline';
import type {
  AiChatToolConfirmationCard,
  AiChatToolExecutionCard,
} from './quanty-agent-cards';

type Phase = 'pending' | 'working' | 'confirmed' | 'cancelled' | 'gone' | 'failed';

const MAX_ARGS_SHOWN = 6;
const MAX_ARG_CHARS = 140;

function formatArgValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return text.length > MAX_ARG_CHARS ? `${text.slice(0, MAX_ARG_CHARS - 1)}…` : text;
}

function ArgsPreview({ args }: { args: Record<string, unknown> }): ReactNode {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1 rounded-lg bg-black/25 px-2.5 py-2">
      {entries.slice(0, MAX_ARGS_SHOWN).map(([key, value]) => (
        <div key={key} className="flex gap-2 text-[10px] leading-snug">
          <dt className="shrink-0 font-semibold text-[var(--quant-muted-foreground)]">{key}</dt>
          <dd className="min-w-0 break-words text-[var(--quant-foreground)]">
            {formatArgValue(value)}
          </dd>
        </div>
      ))}
      {entries.length > MAX_ARGS_SHOWN && (
        <p className="text-[10px] text-[var(--quant-muted-foreground)]">
          +{entries.length - MAX_ARGS_SHOWN} more
        </p>
      )}
    </dl>
  );
}

export function QuantyConfirmationCard({
  card,
}: {
  card: AiChatToolConfirmationCard;
}): ReactNode {
  const [phase, setPhase] = useState<Phase>('pending');
  const [note, setNote] = useState<string | null>(null);
  const [toolExecution, setToolExecution] = useState<AiChatToolExecutionCard | null>(null);

  const decided = phase !== 'pending';

  const decide = async (approved: boolean) => {
    if (decided) return;
    setPhase('working');
    const resolution = await resolveAiChatConfirmation(card.id, approved);
    if (resolution.ok) {
      setToolExecution(resolution.toolExecution);
      if (resolution.approved) {
        // The backend ran the action and returned its execution card; the
        // timeline below renders the real outcome (succeeded or failed).
        setPhase('confirmed');
      } else {
        setPhase('cancelled');
        setNote('Cancelled — nothing was executed.');
      }
      return;
    }
    if (resolution.reason === 'not-found') {
      setPhase('gone');
    } else {
      setPhase('failed');
    }
    setNote(resolution.note);
  };

  return (
    <div
      aria-label={`Confirm: ${card.title}`}
      className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2.5"
    >
      <p className="text-xs font-semibold text-[var(--quant-foreground)]">{card.title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
        {card.summary}
      </p>
      <ArgsPreview args={card.args} />

      {!decided && (
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => void decide(true)}
            className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--quant-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] disabled:opacity-60"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => void decide(false)}
            className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[var(--quant-foreground)] transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}

      {phase === 'working' && (
        <p className="mt-2 text-[11px] text-[var(--quant-muted-foreground)]" role="status">
          Working on it…
        </p>
      )}

      {(phase === 'confirmed' || phase === 'cancelled' || phase === 'gone' || phase === 'failed') &&
        note && (
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
            {note}
          </p>
        )}

      {phase === 'confirmed' && toolExecution && (
        <QuantyToolTimeline executions={[toolExecution]} />
      )}
    </div>
  );
}
