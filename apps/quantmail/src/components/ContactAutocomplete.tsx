'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { IdentityAvatar } from './IdentityAvatar';
import { IconX } from './icons';
import type { ContactSuggestion } from '../types';

export type { ContactSuggestion } from '../types';

interface ContactAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  contacts?: ContactSuggestion[];
  suggestions?: ContactSuggestion[];
  placeholder?: string;
  label?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Robust email address normalizer.
 * If user types "saurabh", automatically resolves to "saurabh@quantmail.in" if needed.
 */
function cleanEmail(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/[,;]+$/, '');
  if (!trimmed) return '';
  if (!trimmed.includes('@')) {
    return `${trimmed}@quantmail.in`;
  }
  return trimmed;
}

/**
 * QM-SCREEN-012 R2: a chip is either a bare address or `Name <address>` (the
 * composer renders named recipients that way). Identity comparisons must run
 * on the bare address, or a named recipient never matches its own suggestion,
 * its own contact, or its own duplicate chip.
 */
export function chipParts(chip: string): { name?: string; email: string } {
  const match = chip.match(/^(.*?)\s*<\s*([^<>\s,;]+)\s*>\s*$/);
  if (match) {
    return { name: match[1].trim() || undefined, email: match[2].trim() };
  }
  return { email: chip.trim() };
}

/** Bare, lowercased address of a chip — the identity key for dedupe. */
function chipEmailKey(chip: string): string {
  return chipParts(chip).email.toLowerCase();
}

/**
 * Normalize candidate chips against the existing chips' bare addresses.
 * A `Name <email>` chip and a bare `email` chip are the same recipient, so
 * adding one when the other exists is a no-op. Exported for tests: the dedupe
 * contract is that named and bare forms of one address never coexist.
 */
export function dedupeChips(existing: string[], candidates: string[]): string[] {
  const seen = new Set(existing.map(chipEmailKey));
  const out: string[] = [];
  for (const candidate of candidates) {
    const cleaned = cleanEmail(chipParts(candidate).email);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export function ContactAutocomplete({
  value,
  onChange,
  contacts = [],
  suggestions: suggestionsProp,
  placeholder = 'name@example.com (or external email)',
  label,
  id,
  'aria-label': ariaLabel,
}: ContactAutocompleteProps) {
  const contactList = useMemo(
    () => (contacts?.length ? contacts : suggestionsProp || []),
    [contacts, suggestionsProp],
  );
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse existing chips from value (comma-separated)
  const chips = useMemo(() => {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [value]);

  // Identity set of the chips as bare addresses — a `Name <email>` chip must
  // match the same address as a bare chip, or dedupe and suggestion
  // filtering silently miss it.
  const chipEmails = useMemo(() => new Set(chips.map(chipEmailKey)), [chips]);

  const commitInput = useCallback(
    (textToCommit?: string) => {
      const raw = (textToCommit !== undefined ? textToCommit : inputValue).trim();
      if (!raw) return;

      // Pull `Name <email>` sequences out before the separator split, so the
      // space inside the name doesn't fragment the address — typing
      // `John Doe <john@x.com>` used to mint a bogus `John Doe@quantmail.in`
      // chip next to the real one.
      const namedTokens: string[] = [];
      const scrubbed = raw.replace(
        /([^,;\n\t]+?)\s*<\s*([^<>\s,;]+@[^<>\s,;]+)\s*>/g,
        (_match, name: string, email: string) => {
          namedTokens.push(`${name.trim()} <${email.trim()}>`);
          return `\uE000${namedTokens.length - 1}\uE000`;
        },
      );

      const rawItems = scrubbed
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const token = s.match(/^\uE000(\d+)\uE000$/);
          return token ? namedTokens[Number(token[1])] : s;
        });
      const newItems = dedupeChips(chips, rawItems);

      if (newItems.length > 0) {
        const merged = Array.from(new Set([...chips, ...newItems]));
        onChange(merged.join(', '));
        setInputValue('');
        setActiveIndex(-1);
      }
    },
    [chips, inputValue, onChange],
  );

  const addChip = useCallback(
    (email: string) => {
      // Normalize `Name <email>` to the bare address first: without this, a
      // named chip and a bare chip for the same address are different strings
      // and selecting a suggestion for an already-added named recipient
      // appends a duplicate chip.
      const newItems = dedupeChips(chips, [email]);
      if (newItems.length === 0) {
        setInputValue('');
        setActiveIndex(-1);
        inputRef.current?.focus();
        return;
      }
      const merged = Array.from(new Set([...chips, ...newItems]));
      onChange(merged.join(', '));
      setInputValue('');
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [chips, onChange],
  );

  const removeChip = useCallback(
    (email: string) => {
      const updated = chips.filter((c) => c !== email).join(', ');
      onChange(updated);
    },
    [chips, onChange],
  );

  // Filter contacts based on input. Already-added addresses are compared on
  // the bare address so a `Name <email>` chip hides its own suggestion.
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const q = inputValue.toLowerCase().trim();
    return contactList
      .filter(
        (c) =>
          !chipEmails.has(c.email.toLowerCase()) &&
          (c.email.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q)),
      )
      .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
      .slice(0, 5);
  }, [inputValue, contactList, chipEmails]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && inputValue === '' && chips.length > 0) {
        removeChip(chips[chips.length - 1]);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          addChip(suggestions[activeIndex].email);
        } else if (inputValue.trim()) {
          e.preventDefault();
          commitInput();
        }
        return;
      }
      if (e.key === ',' || e.key === ';' || e.key === ' ') {
        if (inputValue.trim()) {
          e.preventDefault();
          commitInput();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      }
      if (e.key === 'Escape') {
        setActiveIndex(-1);
        setIsFocused(false);
        inputRef.current?.blur();
      }
    },
    [activeIndex, addChip, chips, commitInput, inputValue, removeChip, suggestions],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (
        pasted &&
        (pasted.includes(',') ||
          pasted.includes(' ') ||
          pasted.includes(';') ||
          pasted.includes('@') ||
          pasted.includes('\n'))
      ) {
        e.preventDefault();
        commitInput(pasted);
      }
    },
    [commitInput],
  );

  const showDropdown =
    isFocused &&
    (suggestions.length > 0 ||
      (inputValue.trim().length > 1 &&
        !chipEmails.has(cleanEmail(chipParts(inputValue).email).toLowerCase())));

  return (
    <div className="relative w-full">
      {label && (
        <label className="block text-xs font-mono font-bold text-[var(--quant-primary)]/90 mb-1" htmlFor={id}>
          {label}
        </label>
      )}

      <div
        className={`flex flex-wrap items-center gap-2 min-h-[36px] w-full rounded-xl p-1 transition-all ${
          isFocused ? 'ring-1 ring-[var(--quant-primary)]/50 bg-[var(--quant-background)]/60' : 'bg-transparent'
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((email) => {
          // Resolve on the bare address: a `Name <email>` chip must find its
          // contact instead of rendering the raw bracketed text.
          const { name: chipName, email: bareEmail } = chipParts(email);
          const contact = contactList.find(
            (c) => c.email.toLowerCase() === bareEmail.toLowerCase(),
          );
          const displayName = contact?.name || chipName;
          return (
            <span
              key={email}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--quant-primary)]/15 border border-[var(--quant-primary)]/30 text-[var(--brand-accent)] text-xs font-mono animate-in fade-in zoom-in-95 duration-100 shadow-sm"
            >
              <span className="font-medium text-white truncate max-w-[200px]">
                {displayName ? `${displayName} (${bareEmail})` : bareEmail}
              </span>
              <button
                type="button"
                className="relative size-5 shrink-0 ml-0.5 flex items-center justify-center rounded hover:bg-[var(--quant-primary)]/30 text-[var(--quant-primary)] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] after:absolute after:-inset-y-[12px] after:-inset-x-[8px] after:content-['']"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(email);
                }}
                aria-label={`Remove ${displayName ? `${displayName} (${bareEmail})` : bareEmail}`}
              >
                <IconX size={11} />
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          id={id}
          type="text"
          className="flex-1 min-w-[160px] bg-transparent text-xs sm:text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded py-1 px-1 font-mono"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            commitInput();
            setTimeout(() => setIsFocused(false), 200);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={chips.length === 0 ? placeholder : 'Add more...'}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-label={ariaLabel || label || 'Recipients'}
        />
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            ref={listRef}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-[#3A404D]/80 bg-[var(--quant-surface-elevated)] p-1.5 shadow-2xl backdrop-blur-xl"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            {/* Direct match / Add custom email item */}
            {inputValue.trim().length > 0 &&
              !suggestions.some(
                (s) => s.email.toLowerCase() === cleanEmail(inputValue).toLowerCase(),
              ) && (
                <div
                  className="flex items-center gap-2.5 p-2 rounded-xl text-xs hover:bg-[var(--quant-primary)]/15 cursor-pointer text-[var(--brand-accent)] font-mono transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addChip(inputValue);
                  }}
                >
                  <div className="size-6 rounded-full bg-[var(--quant-primary)]/20 border border-[var(--quant-primary)]/40 flex items-center justify-center text-[var(--quant-primary)] font-bold text-[10px]">
                    +
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-white">Send to: {cleanEmail(inputValue)}</span>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">Press Enter or click to add</span>
                  </div>
                </div>
              )}

            {/* Suggestions from contact list */}
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.email}
                className={`flex items-center gap-2.5 p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                  index === activeIndex
                    ? 'bg-[var(--quant-primary)]/20 text-white'
                    : 'hover:bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)]'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addChip(suggestion.email);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <IdentityAvatar name={suggestion.name || suggestion.email} size="sm" />
                <div className="flex flex-col min-w-0">
                  {suggestion.name && (
                    <span className="font-bold text-white truncate">{suggestion.name}</span>
                  )}
                  <span className="text-[11px] text-[var(--quant-muted-foreground)] font-mono truncate">
                    {suggestion.email}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
