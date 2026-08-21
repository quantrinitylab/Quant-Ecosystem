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
 * Gmail-style contact autocomplete with chip display.
 * Shows suggestions as user types, with avatar, name, and email.
 * Selected contacts appear as chips that can be removed.
 */
export function ContactAutocomplete({
  value,
  onChange,
  contacts = [],
  suggestions: suggestionsProp,
  placeholder = 'Recipients',
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

  // Filter contacts based on input
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const q = inputValue.toLowerCase();
    return contactList
      .filter(
        (c) =>
          !chips.includes(c.email) &&
          (c.email.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q)),
      )
      .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
      .slice(0, 6);
  }, [inputValue, contactList, chips]);

  const addChip = useCallback(
    (email: string) => {
      const updated = [...chips, email].join(', ');
      onChange(updated);
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && inputValue === '' && chips.length > 0) {
        removeChip(chips[chips.length - 1]);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          addChip(suggestions[activeIndex].email);
        } else if (inputValue.trim() && inputValue.includes('@')) {
          e.preventDefault();
          addChip(inputValue.trim());
        }
        return;
      }
      if (e.key === ',' || e.key === ';') {
        e.preventDefault();
        if (inputValue.trim() && inputValue.includes('@')) {
          addChip(inputValue.trim());
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
        inputRef.current?.blur();
      }
    },
    [activeIndex, addChip, chips, inputValue, removeChip, suggestions],
  );

  // Scroll active suggestion into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('.autocomplete-item');
      items[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const showSuggestions = isFocused && suggestions.length > 0;

  return (
    <div className="contact-autocomplete">
      {label && (
        <label className="autocomplete-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div
        className={`autocomplete-input-area ${isFocused ? 'is-focused' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((email) => {
          const contact = contactList.find((c) => c.email === email);
          return (
            <span key={email} className="autocomplete-chip">
              <span className="chip-text">{contact?.name || email}</span>
              <button
                type="button"
                className="chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(email);
                }}
                aria-label={`Remove ${contact?.name || email}`}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="autocomplete-input"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={chips.length === 0 ? placeholder : ''}
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls={`${id}-suggestions`}
          aria-activedescendant={activeIndex >= 0 ? `${id}-suggestion-${activeIndex}` : undefined}
        />
      </div>

      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            ref={listRef}
            id={`${id}-suggestions`}
            className="autocomplete-dropdown"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.email}
                id={`${id}-suggestion-${index}`}
                className={`autocomplete-item ${index === activeIndex ? 'is-active' : ''}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addChip(suggestion.email);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <IdentityAvatar name={suggestion.name || suggestion.email} size="sm" />
                <div className="autocomplete-item-info">
                  {suggestion.name && (
                    <span className="autocomplete-item-name">{suggestion.name}</span>
                  )}
                  <span className="autocomplete-item-email">{suggestion.email}</span>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
