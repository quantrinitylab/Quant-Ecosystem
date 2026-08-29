'use client';

// ============================================================================
// AI Memory — what the assistant knows, and how to make it forget.
// ============================================================================
//
// A product that remembers you owes you a list of what it remembers and a way
// to strike a line off it. None of that existed: months of learned style,
// contact context and send-time habits sat in `memory_records` with no surface
// anywhere in the suite.
//
// Grouped by where it was learned rather than by kind, because "QuantChat knows
// this about me" is the question people actually have. The `Shared across apps`
// group is not a fallback for unknowns — `UserStyleMemory` and
// `UserContactMemory` are genuinely written by whichever app noticed first and
// read by all of them, and saying otherwise would be inventing provenance.

import { useMemo, useState } from 'react';
import { useAIMemory, type AIMemoryItem } from '../hooks/useAIMemory';
import { useConfirm } from '../hooks/useConfirm';
import { showToast } from './InboxToast';
import { IconChevronDown, IconChevronRight, IconSparkle, IconTrash } from './icons';

/** The `kind` column is an extensible string; these are the ones in use today. */
const KIND_LABELS: Record<string, string> = {
  fact: 'Fact',
  preference: 'Preference',
  episodic: 'Moment',
  entity: 'Person',
  document: 'Document',
  custom: 'Note',
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** Short, absolute-for-old, relative-for-recent. No "just now" for a stale list. */
function learnedAt(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** `shared` sorts last; everything else alphabetically by label. */
function compareGroups(a: { app: string; label: string }, b: { app: string; label: string }) {
  if (a.app === 'shared') return 1;
  if (b.app === 'shared') return -1;
  return a.label.localeCompare(b.label);
}

export interface AIMemoryPanelProps {
  /** Reuses the page's search field rather than adding a second one. */
  query?: string;
}

export function AIMemoryPanel({ query = '' }: AIMemoryPanelProps) {
  const { memories, total, truncated, isLoading, error, forget, forgettingId } = useAIMemory();
  const { confirm, dialog } = useConfirm();
  const [isOpen, setIsOpen] = useState(false);

  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const matched = needle
      ? memories.filter(
          (m) =>
            m.summary.toLowerCase().includes(needle) ||
            m.sourceLabel.toLowerCase().includes(needle) ||
            m.kind.toLowerCase().includes(needle),
        )
      : memories;

    const byApp = new Map<string, { app: string; label: string; items: AIMemoryItem[] }>();
    for (const item of matched) {
      const bucket = byApp.get(item.sourceApp);
      if (bucket) bucket.items.push(item);
      else
        byApp.set(item.sourceApp, { app: item.sourceApp, label: item.sourceLabel, items: [item] });
    }
    return [...byApp.values()].sort(compareGroups);
  }, [memories, needle]);

  const shown = groups.reduce((sum, g) => sum + g.items.length, 0);

  const handleForget = async (item: AIMemoryItem) => {
    const confirmed = await confirm({
      title: 'Forget this?',
      message: `"${item.summary.slice(0, 140)}" will stop informing the assistant everywhere in the suite.`,
      confirmLabel: 'Forget',
      variant: 'destructive',
    });
    if (!confirmed) return;
    forget(item.id);
    showToast({ text: 'Forgotten', type: 'success', subject: 'ai-memory-forget' });
  };

  return (
    <section className="rounded-xl border border-[#282C35] bg-[#111318]">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
      >
        <span className="size-9 rounded-lg bg-[#2B1A11] border border-[#5C3016] flex items-center justify-center text-[#FF8C42] shrink-0">
          <IconSparkle size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#F5F5F5]">AI Memory</span>
          <span className="block text-xs text-[#A1A4AC] mt-0.5 truncate">
            {isLoading
              ? 'Reading what the assistant has learned…'
              : error
                ? 'Could not load memory right now.'
                : total === 0
                  ? 'Nothing learned yet — it fills in as you use the suite.'
                  : `${total} ${total === 1 ? 'thing' : 'things'} learned across QuantMail, QuantChat and QuantTube.`}
          </span>
        </span>
        <span className="text-[#6B6E76] shrink-0">
          {isOpen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-[#282C35] px-4 py-3 flex flex-col gap-4">
          {!isLoading && !error && total > 0 && shown === 0 && (
            <p className="text-xs text-[#6B6E76]">No memory matches that search.</p>
          )}

          {groups.map((group) => (
            <div key={group.app} className="flex flex-col gap-2">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#6B6E76]">
                {group.label} · {group.items.length}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg bg-[#16181D] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#F5F5F5] break-words">{item.summary}</p>
                      <p className="text-[11px] text-[#6B6E76] mt-1">
                        {kindLabel(item.kind)}
                        {learnedAt(item.updatedAt) ? ` · learned ${learnedAt(item.updatedAt)}` : ''}
                        {item.version > 1 ? ` · revised ${item.version - 1}×` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleForget(item)}
                      disabled={forgettingId === item.id}
                      aria-label={`Forget: ${item.summary.slice(0, 80)}`}
                      className="size-11 -my-1 -mr-1 shrink-0 flex items-center justify-center rounded-lg text-[#6B6E76] transition-colors hover:text-[#F5F5F5] hover:bg-[#282C35] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    >
                      <IconTrash size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {truncated && (
            <p className="text-[11px] text-[#6B6E76]">
              Showing the most recent memories only — there are more than this view loads at once.
            </p>
          )}
        </div>
      )}
      {dialog}
    </section>
  );
}
