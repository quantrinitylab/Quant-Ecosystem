'use client';

// ============================================================================
// Shared UI - CommandPaletteUI Component
// ============================================================================

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * The canonical visually-hidden rule, inline.
 *
 * Everything in this file is an inline style, and `sr-only` is a Tailwind utility
 * the *consumer's* build has to generate — a consumer that does not scan
 * `@quant/shared-ui` would render the announcement below as visible text in the
 * middle of the palette. Six apps mount this component; none of them should have
 * to opt in to a class for it to stay hidden.
 */
const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export interface CommandPaletteItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  group?: string;
  action: () => void;
}

export interface CommandPaletteUIProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandPaletteItem[];
  placeholder?: string;
}

function fuzzyMatch(text: string, query: string): { matches: boolean; indices: number[] } {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      indices.push(i);
      qi++;
    }
  }
  return { matches: qi === q.length, indices };
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const chars = text.split('');
  const set = new Set(indices);
  return (
    <>
      {chars.map((char, i) =>
        set.has(i) ? (
          <span key={i} style={{ color: 'var(--brand-primary, #4F46E5)', fontWeight: 600 }}>
            {char}
          </span>
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </>
  );
}

/**
 * Command palette modal with fuzzy search and keyboard navigation.
 *
 * Opening is the parent's job (a Cmd+K listener in AppProviders). Everything the
 * palette does once open — Escape, the Tab trap, initial focus, handing focus back
 * — belongs to it.
 */
export const CommandPaletteUI: React.FC<CommandPaletteUIProps> = ({
  isOpen,
  onClose,
  commands,
  placeholder = 'Search commands...',
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /*
    The field drives a list it never named. `role="listbox"` had no id, the input
    was a plain textbox, and the only mark of which row Enter would fire was a
    `#f1f5f9` background tint — a 1.05:1 change, so invisible, and completely
    silent to a screen reader. A reader pressed Down, heard nothing, pressed Enter
    and ran a command it had never been told about. In six apps.

    This is the ARIA 1.2 combobox: the field is the widget, `aria-controls` names
    the list, and `aria-activedescendant` names the row. Focus stays in the field —
    it has to, the user is typing — so the cursor cannot be real focus here the way
    it is in a menu; the id IS the cursor, which is exactly the case
    `aria-activedescendant` exists for. `useId` because two palettes on one page
    would otherwise point both fields at the first list.
  */
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  /*
    Escape and initial focus used to be two effects: a `document` keydown listener,
    and `setTimeout(() => inputRef.current?.focus(), 0)`. The listener was the
    smaller half. `aria-modal="true"` tells a reader nothing outside this node
    exists, and Tab walked straight out of it into the page behind, with nothing
    returning focus to whatever opened the palette on close — so a keyboard user
    who hit Escape landed at the top of the document. `useFocusTrap` is the
    package's one answer to all of it and owns Escape too, so both effects go.
  */
  const dialogRef = useFocusTrap<HTMLDivElement>({ active: isOpen, onEscape: onClose });

  // Reset on close rather than on open: opening otherwise renders one commit with
  // the previous session's query still in the field before the effect clears it.
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands.map((cmd) => ({ cmd, indices: [] as number[] }));
    return commands
      .map((cmd) => {
        const result = fuzzyMatch(cmd.label, query);
        return { cmd, indices: result.indices, matches: result.matches };
      })
      .filter((item) => item.matches);
  }, [commands, query]);

  const groups = useMemo(() => {
    const map: Record<string, { cmd: CommandPaletteItem; indices: number[] }[]> = {};
    for (const item of filteredCommands) {
      const group = item.cmd.group || 'Commands';
      if (!map[group]) map[group] = [];
      map[group].push(item);
    }
    return map;
  }, [filteredCommands]);

  /*
    The other half of what a tint cannot do: the results scroll in a 320px window,
    and nothing kept the active row inside it. Arrowing down past the sixth command
    moved a highlight nobody could see, off-screen, while Enter fired a row the user
    had lost track of. `block: 'nearest'` scrolls only when it has to, so the list
    does not jump on every keystroke. Optional-called because jsdom has no
    `scrollIntoView` at all.
  */
  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Home and End are deliberately not claimed: this is a text field, and
      // jumping the caret to the ends of the query is what those keys are for.
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredCommands.length === 0) return;
        setActiveIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredCommands.length === 0) return;
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredCommands[activeIndex];
        if (item) {
          item.cmd.action();
          onClose();
        }
      }
    },
    [filteredCommands, activeIndex, onClose],
  );

  // An empty list must not leave `aria-activedescendant` pointing at an id nothing
  // renders — a dangling IDREF reads as a broken widget rather than an empty one.
  const activeOptionId = filteredCommands[activeIndex] ? optionId(activeIndex) : undefined;

  const resultCount = filteredCommands.length;

  const transition = {
    type: 'spring' as const,
    ...spring.stiff,
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          ref={dialogRef}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '20vh',
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '560px',
              margin: '0 16px',
              backgroundColor: 'var(--quant-card, #ffffff)',
              borderRadius: 'var(--quant-radius, 0.5rem)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--quant-border, #e2e8f0)',
              overflow: 'hidden',
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={transition}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--quant-border, #e2e8f0)',
              }}
            >
              <svg
                style={{ flexShrink: 0, color: 'var(--quant-muted-foreground, #64748b)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                // The control the user came here to use, so it wins over DOM order
                // when the trap picks something to focus. React's own `autoFocus`
                // cannot be used for that: React focuses imperatively without ever
                // rendering an attribute, so there is nothing for the trap to find.
                data-autofocus
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '16px',
                  color: 'var(--quant-foreground, #0f172a)',
                }}
                aria-label="Command search"
                role="combobox"
                aria-expanded={resultCount > 0}
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
              />
            </div>
            {/*
              The count, for the reader who cannot see the list shrink under their
              typing. A live region announces changes, not its initial content, so
              opening the palette says nothing and every keystroke after it says
              what is left. Terse on purpose — this fires on each character.
            */}
            <div style={visuallyHidden} role="status" aria-live="polite" aria-atomic="true">
              {resultCount === 0
                ? 'No results'
                : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
            </div>
            {/*
              The scroller is a plain div now. `role="listbox"` used to sit on it,
              which put two non-options inside the list: the "No results found"
              text, and — for every result — an unroled `<div>` wrapping each group.
              A listbox's children may only be options or groups, so the rows a
              reader was meant to count were hidden one level down inside something
              the role vocabulary has no name for.
            */}
            <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px' }}>
              <div id={listboxId} role="listbox" aria-label="Command results">
                {Object.entries(groups).map(([group, items], groupIndex) => {
                  // Calculate the offset for this group
                  let groupOffset = 0;
                  for (const [g, gItems] of Object.entries(groups)) {
                    if (g === group) break;
                    groupOffset += gItems.length;
                  }
                  // Indexed rather than slugged from the name: a group called "My
                  // Files" would put a space in the id, which is not a valid id.
                  const headingId = `${baseId}-group-${groupIndex}`;
                  return (
                    <div
                      key={group}
                      style={{ marginBottom: '8px' }}
                      role="group"
                      aria-labelledby={headingId}
                    >
                      <div
                        id={headingId}
                        style={{
                          padding: '4px 12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--quant-muted-foreground, #64748b)',
                        }}
                      >
                        {group}
                      </div>
                      {items.map((item, itemIndex) => {
                        const globalIndex = groupOffset + itemIndex;
                        const isActive = globalIndex === activeIndex;
                        return (
                          <button
                            key={item.cmd.id}
                            // Six apps mount this, and a palette is exactly the
                            // thing that ends up inside someone's <form>, where a
                            // bare button posts it instead of running the command.
                            type="button"
                            id={optionId(globalIndex)}
                            ref={(node) => {
                              optionRefs.current[globalIndex] = node;
                            }}
                            // An option is not a tab stop. These are real buttons,
                            // so without this the palette had one tab stop per
                            // command and Tab moved focus out of the field that
                            // owns the keyboard — see the note on FOCUSABLE in
                            // useFocusTrap, measured on exactly this pattern.
                            tabIndex={-1}
                            onClick={() => {
                              item.cmd.action();
                              onClose();
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 'calc(var(--quant-radius, 0.5rem) - 2px)',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontSize: '14px',
                              color: 'var(--quant-foreground, #0f172a)',
                              backgroundColor: isActive
                                ? 'var(--quant-muted, #f1f5f9)'
                                : 'transparent',
                              // The tint alone is a 1.05:1 change on a white card —
                              // there was no visible cursor at all. Inset so the
                              // card's `overflow: hidden` cannot clip it off the
                              // first and last row.
                              outline: isActive
                                ? '2px solid var(--brand-primary, #4F46E5)'
                                : undefined,
                              outlineOffset: '-2px',
                            }}
                            role="option"
                            aria-selected={isActive}
                          >
                            {item.cmd.icon && (
                              <span
                                style={{
                                  flexShrink: 0,
                                  display: 'flex',
                                  color: 'var(--quant-muted-foreground, #64748b)',
                                }}
                                aria-hidden="true"
                              >
                                {item.cmd.icon}
                              </span>
                            )}
                            <span style={{ flex: 1 }}>
                              <HighlightedText text={item.cmd.label} indices={item.indices} />
                            </span>
                            {item.cmd.shortcut && (
                              <kbd
                                style={{
                                  fontSize: '12px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--quant-muted, #f1f5f9)',
                                  border: '1px solid var(--quant-border, #e2e8f0)',
                                  color: 'var(--quant-muted-foreground, #64748b)',
                                  fontFamily: 'inherit',
                                }}
                              >
                                {item.cmd.shortcut}
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {resultCount === 0 && (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: 'var(--quant-muted-foreground, #64748b)',
                    fontSize: '14px',
                  }}
                >
                  No results found
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                padding: '8px 16px',
                borderTop: '1px solid var(--quant-border, #e2e8f0)',
                fontSize: '12px',
                color: 'var(--quant-muted-foreground, #64748b)',
              }}
            >
              <span>
                <kbd>&#x2191;&#x2193;</kbd> Navigate
              </span>
              <span>
                <kbd>&#x23CE;</kbd> Select
              </span>
              <span>
                <kbd>Esc</kbd> Close
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
