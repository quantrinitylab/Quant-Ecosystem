'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '@quant/shared-ui';

export interface MemberSuggestion {
  email: string;
  name?: string;
}

export interface AddMemberModalProps {
  open: boolean;
  groupName: string;
  existingEmails: string[];
  suggestions?: MemberSuggestion[];
  onClose: () => void;
  onAdd: (emails: string[]) => Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalize = (value: string) => value.trim().toLowerCase();

export function AddMemberModal({
  open,
  groupName,
  existingEmails,
  suggestions = [],
  onClose,
  onAdd,
}: AddMemberModalProps) {
  const id = useId();
  const panelRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: onClose });
  const dragStartRef = useRef<{ y: number; at: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = useMemo(() => new Set(existingEmails.map(normalize)), [existingEmails]);

  const availableSuggestions = useMemo(() => {
    const used = new Set([...existing, ...pending]);
    return suggestions
      .map((item) => ({ ...item, email: normalize(item.email) }))
      .filter((item) => EMAIL_PATTERN.test(item.email) && !used.has(item.email))
      .filter(
        (item, index, all) =>
          all.findIndex((candidate) => candidate.email === item.email) === index,
      )
      .slice(0, 20);
  }, [existing, pending, suggestions]);

  if (!open) return null;

  const addOne = (raw = input): boolean => {
    const email = normalize(raw);
    if (!email) return false;
    if (!EMAIL_PATTERN.test(email)) {
      setError('Enter a valid email address.');
      return false;
    }
    if (existing.has(email)) {
      setError('That person is already in this group.');
      return false;
    }
    if (pending.includes(email)) {
      setError('That address is already queued.');
      return false;
    }
    setPending((current) => [...current, email]);
    setInput('');
    setError('');
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const additions = [...pending];
    const typed = normalize(input);
    if (typed) {
      if (!EMAIL_PATTERN.test(typed)) {
        setError('Enter a valid email address.');
        return;
      }
      if (existing.has(typed)) {
        setError('That person is already in this group.');
        return;
      }
      if (!additions.includes(typed)) additions.push(typed);
    }
    if (additions.length === 0) {
      setError('Add at least one email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onAdd(additions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add members.');
      setBusy(false);
    }
  };

  const finishDrag = (clientY: number) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    const distance = Math.max(0, clientY - start.y);
    const elapsed = Math.max(1, performance.now() - start.at);
    const velocity = distance / elapsed;
    if (distance >= 96 || velocity >= 0.65) onClose();
    setDragY(0);
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="w-full max-w-lg rounded-t-3xl border border-[#3A404D] bg-[#111318] shadow-[0_24px_80px_rgba(0,0,0,.75)] transition-transform sm:rounded-3xl"
        style={{ transform: `translateY(${dragY}px)` }}
      >
        <div
          className="flex min-h-[44px] touch-none items-center justify-center sm:hidden"
          aria-label="Drag down to close"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStartRef.current = { y: event.clientY, at: performance.now() };
          }}
          onPointerMove={(event) => {
            if (!dragStartRef.current) return;
            setDragY(Math.max(0, event.clientY - dragStartRef.current.y));
          }}
          onPointerUp={(event) => finishDrag(event.clientY)}
          onPointerCancel={() => {
            dragStartRef.current = null;
            setDragY(0);
          }}
        >
          <span className="h-1 w-10 rounded-full bg-[#3A404D]" aria-hidden="true" />
        </div>

        <header className="flex items-start justify-between gap-3 border-b border-[#282C35] px-5 pb-4 sm:pt-5">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="truncate text-lg font-bold text-white">
              Add members
            </h2>
            <p id={`${id}-description`} className="truncate text-xs text-[#A1A4AC]">
              Add people to {groupName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add-member drawer"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#A1A4AC] hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            ✕
          </button>
        </header>

        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <label
              htmlFor={`${id}-email`}
              className="mb-1.5 block text-xs font-semibold text-[#A1A4AC]"
            >
              Email address
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-email`}
                data-autofocus
                autoFocus
                type="email"
                list={`${id}-suggestions`}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    addOne();
                  }
                }}
                placeholder="person@example.com"
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[#3A404D] bg-[#090A0C] px-3 text-sm text-white placeholder-[#6B6E76] focus:border-[#FF8C42] focus:outline-none"
              />
              <datalist id={`${id}-suggestions`}>
                {availableSuggestions.map((item) => (
                  <option key={item.email} value={item.email}>
                    {item.name || item.email}
                  </option>
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => addOne()}
                className="min-h-[44px] rounded-xl border border-[#3A404D] bg-[#282C35] px-4 text-xs font-bold text-white hover:bg-[#3A404D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                Add
              </button>
            </div>
          </div>

          {availableSuggestions.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B6E76]">
                Suggestions
              </p>
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                {availableSuggestions.slice(0, 8).map((item) => (
                  <button
                    key={item.email}
                    type="button"
                    onClick={() => addOne(item.email)}
                    className="min-h-[40px] rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-[#A1A4AC] hover:border-[#FF8C42]/40 hover:bg-[#FF8C42]/10 hover:text-[#FF8C42] hover:shadow-[0_0_10px_rgba(255,140,66,0.1)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  >
                    {item.name || item.email}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <ul role="list" aria-label="Members to add" className="space-y-2">
              {pending.map((email) => (
                <li
                  key={email}
                  className="flex min-h-[48px] items-center gap-3 rounded-xl border border-[#282C35] bg-[#16181D] px-3"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-white">{email}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPending((current) => current.filter((item) => item !== email))
                    }
                    aria-label={`Remove ${email}`}
                    className="flex size-11 items-center justify-center rounded-xl text-[#A1A4AC] hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-400">
              {error}
            </p>
          )}

          <footer className="flex justify-end gap-2 border-t border-[#282C35] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[#282C35] px-4 text-xs font-semibold text-white hover:bg-[#282C35]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || (!input.trim() && pending.length === 0)}
              className="min-h-[44px] rounded-xl bg-[#FF8C42] px-5 text-xs font-bold text-[#090A0C] hover:bg-[#FF9B5A] disabled:opacity-40"
            >
              {busy
                ? 'Adding…'
                : `Add ${pending.length || (input.trim() ? 1 : 0)} member${
                    (pending.length || (input.trim() ? 1 : 0)) === 1 ? '' : 's'
                  }`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
