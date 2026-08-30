'use client';

import { useState, useRef, useCallback } from 'react';
import { IdentityAvatar } from './IdentityAvatar';
import type { Contact } from '../types';

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

function parseEmailString(raw: string): RecipientOption[] {
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
    } else {
      result.push({
        email: part.trim().toLowerCase(),
      });
    }
  }

  return result;
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
          avatarUrl: suggestions[highlightedIndex]?.avatarUrl,
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
    // Delay to let click on suggestion register
    setTimeout(() => {
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
    }, 180);
  };

  return (
    <div
      className={`relative flex items-center gap-2 sm:gap-3 w-full ${className}`}
      ref={containerRef}
    >
      <label
        htmlFor={id}
        className="text-xs font-semibold text-[#A1A4AC] w-12 sm:w-16 shrink-0 select-none flex items-center gap-0.5"
      >
        <span>{label}</span>
        {required && <span className="text-rose-500">*</span>}:
      </label>

      <div
        className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 py-1 px-1.5 rounded-xl border border-transparent focus-within:border-[#3A404D]/80 focus-within:bg-[#111318]/40 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Recipient Chips */}
        {recipients.map((recipient, idx) => (
          <span
            key={`${recipient.email}-${idx}`}
            className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full bg-[#282C35]/90 border border-[#3A404D]/80 text-xs text-[#F5F5F5] hover:border-[#FF8C42]/50 hover:bg-[#282C35] transition-all select-none shadow-sm group"
          >
            <IdentityAvatar
              name={recipient.name || recipient.email}
              size="sm"
              className="!size-4 !text-[8px]"
            />
            <span className="font-medium text-white text-[11px] truncate max-w-[160px]">
              {recipient.name || recipient.email}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeRecipient(idx);
              }}
              className="text-[#A1A4AC] group-hover:text-rose-400 p-0.5 hover:bg-[#3A404D]/60 rounded-full transition-colors"
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
        ))}

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
          className="flex-1 min-w-[120px] min-h-[44px] sm:min-h-0 bg-transparent text-xs sm:text-sm text-white placeholder-[#A1A4AC] focus:outline-none py-1"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {rightAction && <div className="shrink-0">{rightAction}</div>}

      {/* Auto-suggest Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-14 sm:left-20 top-full mt-1 z-50 w-72 sm:w-80 bg-[#090A0C]/95 border border-[#282C35] rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md max-h-56 overflow-y-auto"
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#A1A4AC] border-b border-[#282C35]/80 bg-[#111318]/60">
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
                  avatarUrl: contact.avatarUrl,
                });
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                highlightedIndex === idx
                  ? 'bg-[#FF8C42]/15 text-[#FFB875]'
                  : 'hover:bg-[#111318] text-[#F5F5F5]'
              }`}
            >
              <IdentityAvatar name={contact.name || contact.email} size="sm" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-bold text-white truncate">
                  {contact.name || contact.email.split('@')[0]}
                </span>
                <span className="text-[11px] text-[#A1A4AC] truncate">{contact.email}</span>
              </div>
              {contact.company && (
                <span className="text-[10px] text-[#A1A4AC] px-1.5 py-0.5 rounded bg-[#111318] border border-[#282C35] shrink-0">
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
