'use client';

import { useId, useState } from 'react';
import { useFocusTrap } from '@quant/shared-ui';
import type { ContactGroup } from '../types';

const ACCENTS: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'Quant orange' },
  { value: '#34D399', label: 'Green' },
  { value: '#60A5FA', label: 'Blue' },
  { value: '#A78BFA', label: 'Violet' },
  { value: '#FB7185', label: 'Rose' },
  { value: '#FBBF24', label: 'Amber' },
];
const DEFAULT_ACCENT = '#FF8C42';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface GroupDraft {
  name: string;
  emails: string[];
  color: string | null;
}

export interface GroupEditorModalProps {
  group: ContactGroup | null;
  onClose: () => void;
  onSave: (draft: GroupDraft) => Promise<void>;
  onDelete: (group: ContactGroup) => Promise<void>;
}

export function GroupEditorModal({ group, onClose, onSave, onDelete }: GroupEditorModalProps) {
  const editing = group !== null;
  const baseId = useId();
  const [name, setName] = useState(group?.name ?? '');
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState<string[]>(() => [...(group?.emails ?? [])]);
  const [color, setColor] = useState<string | null>(group?.color ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>({ active: true, onEscape: onClose });

  const normalize = (value: string) => value.trim().toLowerCase();
  const addMember = (raw = memberInput) => {
    const email = normalize(raw);
    if (!email) return false;
    if (!EMAIL.test(email)) {
      setError('Enter a valid email address.');
      return false;
    }
    if (members.includes(email)) {
      setError('That address is already in this group.');
      return false;
    }
    setMembers((current) => [...current, email]);
    setMemberInput('');
    setError('');
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Enter a group name.');
      return;
    }
    const nextMembers = [...members];
    const pending = normalize(memberInput);
    if (pending) {
      if (!EMAIL.test(pending)) {
        setError('Enter a valid email address.');
        return;
      }
      if (!nextMembers.includes(pending)) nextMembers.push(pending);
    }
    if (!editing && nextMembers.length === 0) {
      setError('Add at least one member.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({ name: cleanName, emails: nextMembers, color });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this group.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!group || busy) return;
    setBusy(true);
    setError('');
    try {
      await onDelete(group);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this group.');
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#3A404D] bg-[#111318] p-5 shadow-[0_24px_80px_rgba(0,0,0,.75)] sm:rounded-3xl sm:p-6"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-black text-[#090A0C]"
              style={{ backgroundColor: color ?? DEFAULT_ACCENT }}
              aria-hidden="true"
            >
              {(name.trim() || 'G')
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 id={`${baseId}-title`} className="text-lg font-bold text-[#F5F5F5]">
                {editing ? 'Edit group' : 'New group'}
              </h2>
              <p className="text-xs text-[#A1A4AC]">Name, avatar color, and members</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close group editor"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#A1A4AC] hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            ✕
          </button>
        </header>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label
              htmlFor={`${baseId}-name`}
              className="mb-1.5 block text-xs font-semibold text-[#A1A4AC]"
            >
              Group name
            </label>
            <input
              id={`${baseId}-name`}
              data-autofocus
              autoFocus
              maxLength={60}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              className="min-h-[44px] w-full rounded-xl border border-[#3A404D] bg-[#090A0C] px-3 text-sm text-white placeholder-[#6B6E76] focus:border-[#FF8C42] focus:outline-none"
              placeholder="Founders & Core Team"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-[#A1A4AC]">Avatar color</legend>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((accent) => (
                <label
                  key={accent.label}
                  title={accent.label}
                  className="relative flex size-11 cursor-pointer items-center justify-center rounded-xl hover:bg-[#282C35]"
                >
                  <input
                    type="radio"
                    name={`${baseId}-accent`}
                    checked={color === accent.value}
                    onChange={() => setColor(accent.value)}
                    className="peer sr-only"
                  />
                  <span
                    className="size-6 rounded-full border border-black/40 peer-focus-visible:ring-2 peer-focus-visible:ring-[#FF8C42] peer-checked:ring-2 peer-checked:ring-white peer-checked:ring-offset-2 peer-checked:ring-offset-[#111318]"
                    style={{ backgroundColor: accent.value ?? DEFAULT_ACCENT }}
                  />
                  <span className="sr-only">{accent.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor={`${baseId}-member`}
              className="mb-1.5 block text-xs font-semibold text-[#A1A4AC]"
            >
              Members
            </label>
            <div className="flex gap-2">
              <input
                id={`${baseId}-member`}
                type="email"
                value={memberInput}
                onChange={(event) => {
                  setMemberInput(event.target.value);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    addMember();
                  }
                }}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[#3A404D] bg-[#090A0C] px-3 text-sm text-white placeholder-[#6B6E76] focus:border-[#FF8C42] focus:outline-none"
                placeholder="person@example.com"
              />
              <button
                type="button"
                onClick={() => addMember()}
                className="min-h-[44px] rounded-xl border border-[#3A404D] bg-[#282C35] px-4 text-xs font-semibold text-white hover:bg-[#3A404D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                Add
              </button>
            </div>
            <ul role="list" className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {members.map((email) => (
                <li
                  key={email}
                  className="flex min-h-[48px] items-center gap-3 rounded-xl border border-[#282C35] bg-[#16181D] px-3"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#090A0C]"
                    style={{ backgroundColor: color ?? DEFAULT_ACCENT }}
                  >
                    {email.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[#F5F5F5]">{email}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setMembers((current) => current.filter((member) => member !== email))
                    }
                    aria-label={`Remove ${email}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#A1A4AC] hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-400">
              {error}
            </p>
          )}

          {confirmDelete && group ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#282C35] pt-4">
              <p className="text-xs text-[#A1A4AC]">
                Delete <strong className="text-white">{group.name}</strong>?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[44px] rounded-xl border border-[#282C35] px-4 text-xs font-semibold text-[#F5F5F5]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                  className="min-h-[44px] rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 text-xs font-bold text-rose-300 disabled:opacity-50"
                >
                  {busy ? 'Deleting…' : 'Delete group'}
                </button>
              </div>
            </div>
          ) : (
            <footer className="flex items-center justify-between gap-3 border-t border-[#282C35] pt-4">
              {group ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[44px] rounded-xl px-3 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                >
                  Delete group
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] rounded-xl border border-[#282C35] px-4 text-xs font-semibold text-[#F5F5F5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[44px] rounded-xl bg-[#FF8C42] px-5 text-xs font-bold text-[#090A0C] hover:bg-[#FF9B5A] disabled:opacity-50"
                >
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Create group'}
                </button>
              </div>
            </footer>
          )}
        </form>
      </div>
    </div>
  );
}
