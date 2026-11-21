'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ContactSuggestion } from '../types';
import {
  applyPlusMention,
  findPlusMentionTrigger,
  type PlusMentionTrigger,
} from '../lib/plus-mentions';
import { rankContactSuggestions } from '../components/ContactAutocomplete';

/**
 * Shared "+" mention state for the three composer body textareas
 * (EmailComposer, DockedComposer, ThreadComposer). The host owns its body
 * string; this hook owns only the trigger + picker state.
 *
 * Host wiring (all three call sites do exactly this):
 * - textarea onChange: `setBody(next)` then
 *   `mention.updateFromEdit(next, e.target.selectionStart ?? next.length)`.
 * - textarea onKeyDown: `if (mention.handleKeyDown(e)) return;` FIRST, so an
 *   open picker eats Arrow/Enter/Tab/Escape before the host's own Tab
 *   prediction (EmailComposer) or Enter-to-send (ThreadComposer).
 * - render `<PlusMentionDropdown>` next to the textarea when
 *   `mention.isOpen`, with `onSelect={mention.select}`.
 * - `onSelect` (this hook's option) receives the new body + caret: the host
 *   sets its body state, adds the contact to its real recipient list
 *   (EmailComposer/DockedComposer: the To field; ThreadComposer: its
 *   mentioned-recipients list, which the send path addresses — a pick
 *   that adds nobody is a fake recipient affordance, CODEX-REVIEW on
 *   PR #1549), and restores focus + caret on its textarea ref.
 *
 * Fail-closed: the trigger offsets belong to the body snapshot from the
 * last keystroke. If the body moved under us since (template insert, AI
 * rewrite — no onChange call), the picker hides and a pick is a no-op
 * instead of splicing "@Name" at stale offsets.
 */
export function usePlusMention({
  body,
  contacts,
  excludedEmails = [],
  onSelect,
}: {
  body: string;
  contacts: ContactSuggestion[];
  /** Bare addresses already on To/Cc/Bcc — hidden from mention results. */
  excludedEmails?: string[];
  onSelect: (contact: ContactSuggestion, nextBody: string, nextCaret: number) => void;
}) {
  const [trigger, setTrigger] = useState<PlusMentionTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const snapshotRef = useRef(body);

  const excluded = useMemo(
    () => new Set(excludedEmails.map((e) => e.toLowerCase())),
    [excludedEmails],
  );
  const suggestions = useMemo(
    () => (trigger ? rankContactSuggestions(contacts, trigger.query, excluded) : []),
    [trigger, contacts, excluded],
  );
  const isOpen =
    trigger !== null && suggestions.length > 0 && snapshotRef.current === body;

  const updateFromEdit = useCallback((nextBody: string, caret: number) => {
    snapshotRef.current = nextBody;
    setTrigger(findPlusMentionTrigger(nextBody, caret));
    setActiveIndex(-1);
  }, []);

  const close = useCallback(() => {
    setTrigger(null);
    setActiveIndex(-1);
  }, []);

  const select = useCallback(
    (contact: ContactSuggestion) => {
      if (!trigger) return;
      if (snapshotRef.current !== body) {
        close();
        return;
      }
      const applied = applyPlusMention(snapshotRef.current, trigger, contact);
      close();
      onSelect(contact, applied.text, applied.caret);
    },
    [trigger, body, close, onSelect],
  );

  /**
   * Returns true when the picker consumed the key. Enter/Tab pick the
   * highlighted suggestion — or the first one when nothing is highlighted
   * (Gmail behavior: Enter with an open picker picks, it never sends).
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return false;
      // Modified keys are the host's shortcuts, never the picker's: Cmd/Ctrl
      // +Enter must still send (EmailComposer, DockedComposer), and
      // Shift+Enter must still insert a newline (ThreadComposer).
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.key === 'Enter' && e.shiftKey) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        select(activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [isOpen, suggestions, activeIndex, select, close],
  );

  return { isOpen, suggestions, activeIndex, setActiveIndex, updateFromEdit, select, close, handleKeyDown };
}
