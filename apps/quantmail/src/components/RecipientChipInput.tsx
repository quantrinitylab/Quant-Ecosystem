'use client';

import { useState, useRef, useCallback } from 'react';
import { IdentityAvatar } from './IdentityAvatar';
import type { Contact } from '../types';
import { isValidEmail } from '../lib/email-validation';

export interface RecipientOption {
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface RecipientChipInputProps {
  id: string;
  name: string;
  label: string;
  recipients: RecipientOption[];
  onChange: (recipients: RecipientOption[]) => void;
  placeholder?: string;
  contacts?: Contact[];
  required?: boolean;
  className?: string;
  rightAction?: React.ReactNode;
}

/**
 * Split typed or pasted text into one recipient per address.
 *
 * Exported because it is the only definition of "what counts as one address" in
 * the composer, and any second copy of that answer drifts: a chip whose email is
 * `a@x.com,b@y.com` renders perfectly, joins back into a `To:` header nobody can
 * deliver, and is invisible until the send fails.
 *
 * Splitting rules: commas, semicolons, newlines and tabs always separate
 * addresses; a run of whitespace inside a token ALSO separates addresses when
 * the token is address-shaped (contains '@') — pasting `a@x.com b@y.com`
 * yields two valid chips, not one malformed chip that per-address validation
 * then (correctly) flags red. Tokens without '@' are never whitespace-split:
 * `foo bar` is a display-name-shaped typo and is flagged once, not twice,
 * and `John Doe <john@x.com>` keeps its name via the angle-bracket branch.
 */
export function parseEmailString(raw: string): RecipientOption[] {
  if (!raw.trim()) return [];
  const parts = raw
    .split(/[,;\n\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result: RecipientOption[] = [];

  for (const part of parts) {
    const angleMatch = part.match(/^(.*?)\s*<([^>]+)>$/);
    if (angleMatch) {
      result.push({
        name: angleMatch[1].trim() || undefined,
        email: angleMatch[2].trim().toLowerCase(),
      });
      continue;
    }
    const tokens = part.includes('@') ? part.split(/\s+/).filter(Boolean) : [part];
    for (const token of tokens) {
      result.push({
        email: token.trim().toLowerCase(),
      });
    }
  }

  return result;
}

/**
 * QM-SCREEN-012 R2: the send payload must carry each address once. The
 * recipient rows can hold two entries for one address (a named chip plus a
 * bare chip from an autocomplete race), so dedupe by lowercased email,
 * keeping the first occurrence. Exported for tests.
 */
export function dedupeRecipientPayload<T extends { email: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function RecipientChipInput({
  id,
  name,
  label,
  recipients,
  onChange,
  placeholder = 'Add recipients…',
  contacts = [],
  required = false,
  className = '',
  rightAction,
}: RecipientChipInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Inline invalid-address flag for the in-progress input (compose
  // validation): parse exactly the way Enter/comma/blur/paste commits would,
  // and underline in red only once the text already has an address shape
  // (contains '@' or a space) but would commit as malformed. Mid-typing
  // fragments like "kundan" stay unflagged until committed — then the chip
  // itself turns red (see below).
  const pendingInvalidEmail = (() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return null;
    if (!trimmed.includes('@') && !/\s/.test(trimmed)) return null;
    const bad = parseEmailString(inputValue).find((p) => !isValidEmail(p.email));
    return bad ? bad.email : null;
  })();

  // Filter contacts based on current input
  const suggestions = inputValue.trim()
    ? contacts.filter((c) => {
        const query = inputValue.trim().toLowerCase();
        const contactEmail = (c.email || '').toLowerCase();
        const contactName = (c.name || '').toLowerCase();
        const contactCompany = (c.company || '').toLowerCase();
        const alreadyAdded = recipients.some((r) => r.email.toLowerCase() === contactEmail);
        return (
          !alreadyAdded &&
          (contactEmail.includes(query) ||
            contactName.includes(query) ||
            contactCompany.includes(query))
        );
      })
    : [];

  const addRecipient = useCallback(
    (option: RecipientOption) => {
      const email = option.email.trim().toLowerCase();
      if (!email) return;
      if (!recipients.some((r) => r.email.toLowerCase() === email)) {
        onChange([...recipients, { ...option, email }]);
      }
      setInputValue('');
      setIsOpen(false);
      setHighlightedIndex(0);
      inputRef.current?.focus();
    },
    [recipients, onChange],
  );

  const removeRecipient = useCallback(
    (indexToRemove: number) => {
      onChange(recipients.filter((_, idx) => idx !== indexToRemove));
      inputRef.current?.focus();
    },
    [recipients, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
      if (isOpen && suggestions.length > 0 && highlightedIndex >= 0) {
        e.preventDefault();
        addRecipient({
          name: suggestions[highlightedIndex]?.name,
          email: suggestions[highlightedIndex]?.email,
          avatarUrl: suggestions[highlightedIndex]?.avatar,
        });
        return;
      }

      if (inputValue.trim()) {
        e.preventDefault();
        const parsed = parseEmailString(inputValue);
        if (parsed.length > 0) {
          const newItems = parsed.filter(
            (p) => !recipients.some((r) => r.email.toLowerCase() === p.email.toLowerCase()),
          );
          if (newItems.length > 0) {
            onChange([...recipients, ...newItems]);
          }
          setInputValue('');
          setIsOpen(false);
        }
      }
    } else if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      e.preventDefault();
      removeRecipient(recipients.length - 1);
    } else if (e.key === 'ArrowDown') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.includes(',') || text.includes(';') || text.includes('\n') || text.includes('@')) {
      e.preventDefault();
      const parsed = parseEmailString(text);
      if (parsed.length > 0) {
        const newItems = parsed.filter(
          (p) => !recipients.some((r) => r.email.toLowerCase() === p.email.toLowerCase()),
        );
        if (newItems.length > 0) {
          onChange([...recipients, ...newItems]);
        }
        setInputValue('');
      }
    }
  };

  const handleBlur = () => {
    // Commit pending typed text SYNCHRONOUSLY (no debounce): the suggestion
    // buttons handle selection via onMouseDown + preventDefault, so blur
    // never fires for a suggestion click. A delayed commit here races the
    // Send button — the typed recipient would commit 180ms AFTER handleSend
    // already ran, so the send would fail with "specify at least one
    // recipient" while the chip appears moments later.
    if (inputValue.trim()) {
      const parsed = parseEmailString(inputValue);
      if (parsed.length > 0) {
        const newItems = parsed.filter(
          (p) => !recipients.some((r) => r.email.toLowerCase() === p.email.toLowerCase()),
        );
        if (newItems.length > 0) {
          onChange([...recipients, ...newItems]);
        }
        setInputValue('');
      }
    }
    setIsOpen(false);
  };

  return (
    <div
      className={`relative flex items-start gap-2 sm:gap-3 w-full ${className}`}
      ref={containerRef}
    >
      <label
        htmlFor={id}
        className="text-xs font-semibold text-[var(--quant-muted-foreground)] w-12 sm:w-16 shrink-0 select-none flex items-center gap-0.5 pt-2"
      >
        <span>{label}</span>
        {required && <span className="text-rose-500">*</span>}:
      </label>

      <div
        className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 py-1 px-1.5 rounded-xl border border-transparent focus-within:border-[#3A404D]/80 focus-within:bg-[var(--quant-surface)]/40 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Recipient Chips */}
        {recipients.map((recipient, idx) => {
          // Inline invalid-address flag (compose validation): a committed
          // chip whose address is malformed turns red with the reason in its
          // title — Gmail-style — instead of silently passing and failing
          // at the server. The send button stays disabled until it is fixed
          // or removed (EmailComposer's getSendBlockReason / DockedComposer's
          // handleSend guard derive from the same isValidEmail check).
          const chipInvalid = !isValidEmail(recipient.email);
          return (
            <span
              key={`${recipient.email}-${idx}`}
              aria-invalid={chipInvalid || undefined}
              title={
                chipInvalid
                  ? `"${recipient.email}" is not a valid email address — fix or remove it`
                  : undefined
              }
              className={`inline-flex max-w-full items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full bg-[var(--quant-surface-elevated)]/90 border text-xs text-[var(--quant-foreground)] transition-all select-none shadow-sm group ${
                chipInvalid
                  ? 'border-rose-500/80 hover:border-rose-400'
                  : 'border-[#3A404D]/80 hover:border-[var(--quant-primary)]/50 hover:bg-[var(--quant-surface-elevated)]'
              }`}
            >
              <IdentityAvatar
                name={recipient.name || recipient.email}
                size="sm"
                className="!size-4 !text-[var(--q-type-xs)]"
              />
              <span
                className={`font-medium text-[11px] truncate max-w-[120px] sm:max-w-[200px] ${
                  chipInvalid
                    ? 'text-rose-300 underline decoration-rose-500/70 underline-offset-2'
                    : 'text-white'
                }`}
              >
                {recipient.name || recipient.email}
              </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeRecipient(idx);
              }}
              className="text-[var(--quant-muted-foreground)] group-hover:text-rose-400 p-0.5 hover:bg-[#3A404D]/60 rounded-full transition-colors shrink-0"
              title={`Remove ${recipient.name || recipient.email}`}
              aria-label={`Remove ${recipient.name || recipient.email}`}
            >
              <svg
                className="size-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            </span>
          );
        })}

        {/* Input box for new recipient */}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            if (inputValue.trim() && suggestions.length > 0) setIsOpen(true);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={recipients.length === 0 ? placeholder : ''}
          aria-invalid={pendingInvalidEmail ? true : undefined}
          title={
            pendingInvalidEmail
              ? `"${pendingInvalidEmail}" is not a valid email address`
              : undefined
          }
          className={`flex-1 min-w-[70px] sm:min-w-[120px] min-h-[44px] sm:min-h-0 bg-transparent text-xs sm:text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none py-1 focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
            pendingInvalidEmail
              ? 'underline decoration-rose-500 decoration-2 underline-offset-4'
              : ''
          }`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {rightAction && <div className="shrink-0 pt-1.5">{rightAction}</div>}

      {/* Auto-suggest Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-14 sm:left-20 top-full mt-1 z-50 w-72 sm:w-80 bg-[var(--quant-background)]/95 border border-[var(--quant-surface-elevated)] rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md max-h-56 overflow-y-auto"
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)] border-b border-[var(--quant-surface-elevated)]/80 bg-[var(--quant-surface)]/60">
            Contacts & Suggestions
          </div>
          {suggestions.map((contact, idx) => (
            <button
              key={contact.id || contact.email}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addRecipient({
                  name: contact.name,
                  email: contact.email,
                  avatarUrl: contact.avatar,
                });
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                highlightedIndex === idx
                  ? 'bg-[var(--quant-primary)]/15 text-[var(--brand-accent)]'
                  : 'hover:bg-[var(--quant-surface)] text-[var(--quant-foreground)]'
              }`}
            >
              <IdentityAvatar name={contact.name || contact.email} size="sm" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-bold text-white truncate">
                  {contact.name || contact.email.split('@')[0]}
                </span>
                <span className="text-[11px] text-[var(--quant-muted-foreground)] truncate">{contact.email}</span>
              </div>
              {contact.company && (
                <span className="text-[10px] text-[var(--quant-muted-foreground)] px-1.5 py-0.5 rounded bg-[var(--quant-surface)] border border-[var(--quant-surface-elevated)] shrink-0">
                  {contact.company}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
