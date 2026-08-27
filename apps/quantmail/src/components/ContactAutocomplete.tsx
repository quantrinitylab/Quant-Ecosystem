'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { IdentityAvatar } from './IdentityAvatar';
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

  const commitInput = useCallback(
    (textToCommit?: string) => {
      const raw = (textToCommit !== undefined ? textToCommit : inputValue).trim();
      if (!raw) return;

      const rawItems = raw
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const newItems = rawItems.map(cleanEmail).filter(Boolean);

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
      const cleaned = cleanEmail(email);
      if (!cleaned) return;
      const merged = Array.from(new Set([...chips, cleaned]));
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

  // Filter contacts based on input
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const q = inputValue.toLowerCase().trim();
    return contactList
      .filter(
        (c) =>
          !chips.includes(c.email) &&
          (c.email.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q)),
      )
      .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
      .slice(0, 5);
  }, [inputValue, contactList, chips]);

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
      (inputValue.trim().length > 1 && !chips.includes(cleanEmail(inputValue))));

  return (
    <div className="relative w-full">
      {label && (
        <label className="block text-xs font-mono font-bold text-[#FF8C42]/90 mb-1" htmlFor={id}>
          {label}
        </label>
      )}

      <div
        className={`flex flex-wrap items-center gap-1.5 min-h-[36px] w-full rounded-xl p-1 transition-all ${
          isFocused ? 'ring-1 ring-[#FF8C42]/50 bg-[#090A0C]/60' : 'bg-transparent'
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((email) => {
          const contact = contactList.find((c) => c.email.toLowerCase() === email.toLowerCase());
          return (
            <span
              key={email}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF8C42]/15 border border-[#FF8C42]/30 text-[#FFB875] text-xs font-mono animate-in fade-in zoom-in-95 duration-100 shadow-sm"
            >
              <span className="font-medium text-white truncate max-w-[200px]">
                {contact?.name ? `${contact.name} (${email})` : email}
              </span>
              <button
                type="button"
                className="hover:bg-[#FF8C42]/30 text-[#FF8C42] hover:text-white rounded size-3.5 flex items-center justify-center text-xs ml-0.5 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(email);
                }}
                aria-label={`Remove ${email}`}
              >
                ✕
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          id={id}
          type="text"
          className="flex-1 min-w-[160px] bg-transparent text-xs sm:text-sm text-white placeholder-[#6B6E76] focus:outline-none py-1 px-1 font-mono"
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
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-[#3A404D]/80 bg-[#121622] p-1.5 shadow-2xl backdrop-blur-xl"
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
                  className="flex items-center gap-2.5 p-2 rounded-xl text-xs hover:bg-[#FF8C42]/15 cursor-pointer text-[#FFB875] font-mono transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addChip(inputValue);
                  }}
                >
                  <div className="size-6 rounded-full bg-[#FF8C42]/20 border border-[#FF8C42]/40 flex items-center justify-center text-[#FF8C42] font-bold text-[10px]">
                    +
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-white">Send to: {cleanEmail(inputValue)}</span>
                    <span className="text-[10px] text-[#A1A4AC]">Press Enter or click to add</span>
                  </div>
                </div>
              )}

            {/* Suggestions from contact list */}
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.email}
                className={`flex items-center gap-2.5 p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                  index === activeIndex
                    ? 'bg-[#FF8C42]/20 text-white'
                    : 'hover:bg-[#282C35] text-[#A1A4AC]'
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
                  <span className="text-[11px] text-[#A1A4AC] font-mono truncate">
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
