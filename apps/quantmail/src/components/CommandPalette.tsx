'use client';

/**
 * The command palette.
 *
 * Previously this file carried its own 450-line array of commands with inline
 * SVGs and hand-written `shortcut: 'G I'` strings — a third copy of information
 * that also lived in `useGlobalShortcuts` and `KeyboardShortcutsHelp`, and drifted
 * from both. It now renders the command registry, so anything bound to a key is
 * listed here automatically with the *actual* binding, formatted for the user's
 * platform.
 *
 * The palette pushes an exclusive keyboard scope while open, which is what stops
 * the global single-key shortcuts from firing behind it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatBinding } from '../lib/keyboard/chords';
import { COMMAND_GROUPS, type Command } from '../lib/keyboard/command-registry';
import { CommandIcon } from '../lib/keyboard/command-icons';
import { useKeyboardScope, useShortcut, useVisibleCommands } from '../lib/keyboard/hooks';
import { useKeyboardSurfaces } from './KeyboardProvider';

const SCOPE = 'command-palette';

/** Ranked search over label, keywords and description. */
function scoreCommand(command: Command, query: string): number {
  const label = command.label.toLowerCase();
  if (label.startsWith(query)) return 100;

  const wordStart = label.split(/\s+/).some((word) => word.startsWith(query));
  if (wordStart) return 80;
  if (label.includes(query)) return 60;

  if ((command.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(query))) return 40;
  if (command.description?.toLowerCase().includes(query)) return 20;
  if (command.group.toLowerCase().includes(query)) return 10;

  return 0;
}

export function CommandPalette() {
  const { isPaletteOpen, closePalette } = useKeyboardSurfaces();
  const commands = useVisibleCommands();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Exclusive: while the palette is open nothing shallower may claim a key, so
  // `Escape` reaches only this dialog and `e`/`s`/`j` cannot archive mail behind it.
  useKeyboardScope(SCOPE, { active: isPaletteOpen, exclusive: true });

  useShortcut('escape', closePalette, {
    scope: SCOPE,
    allowInInput: true,
    disabled: !isPaletteOpen,
  });

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return commands;

    return commands
      .map((command) => ({ command, score: scoreCommand(command, trimmed) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.command);
  }, [commands, query]);

  // Grouped for display, but `results` stays the flat keyboard-navigation order.
  const groups = useMemo(() => {
    const byGroup = new Map<string, Command[]>();
    for (const command of results) {
      const existing = byGroup.get(command.group);
      if (existing) existing.push(command);
      else byGroup.set(command.group, [command]);
    }
    // Follow the declared group order, skipping groups with no matches.
    return COMMAND_GROUPS.filter((group) => byGroup.has(group)).map((group) => ({
      group,
      items: byGroup.get(group)!,
    }));
  }, [results]);

  /** Flat index of each command, so arrow keys walk the rendered order. */
  const flatOrder = useMemo(() => {
    const order: Command[] = [];
    for (const { items } of groups) order.push(...items);
    return order;
  }, [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isPaletteOpen) return;
    setQuery('');
    setActiveIndex(0);
    // The dialog animates in; focus once it is actually on screen.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isPaletteOpen]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const execute = useCallback(
    (command: Command) => {
      closePalette();
      void command.run();
    },
    [closePalette],
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (flatOrder.length === 0 ? 0 : (index + 1) % flatOrder.length));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) =>
          flatOrder.length === 0 ? 0 : (index - 1 + flatOrder.length) % flatOrder.length,
        );
      } else if (event.key === 'Enter') {
        const command = flatOrder[activeIndex];
        if (!command) return;
        event.preventDefault();
        execute(command);
      }
    },
    [activeIndex, execute, flatOrder],
  );

  let cursor = 0;

  return (
    <AnimatePresence>
      {isPaletteOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closePalette}
            aria-hidden="true"
          />
          <motion.div
            className="command-palette fixed left-1/2 top-[12%] z-[120] flex max-h-[72vh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-[#282C35] bg-[#16181D] shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-3 border-b border-[#282C35] bg-[#111318] px-4 py-3.5">
              <svg
                className="h-4 w-4 shrink-0 text-[#FF8C42]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="command-palette-input"
                name="commandQuery"
                ref={inputRef}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none"
                type="text"
                placeholder="Type a command, or jump to a workspace…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-controls="command-palette-list"
                aria-activedescendant={flatOrder[activeIndex]?.id}
                aria-label="Search commands"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="shrink-0 rounded border border-[#282C35] bg-[#16181D] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A4AC]">
                Esc
              </kbd>
            </div>

            <div
              id="command-palette-list"
              ref={listRef}
              className="space-y-3 overflow-y-auto p-2"
              role="listbox"
              aria-label="Commands"
            >
              {flatOrder.length === 0 && (
                <p className="py-10 text-center text-xs text-[#6B6E76]">
                  No commands match &ldquo;{query}&rdquo;
                </p>
              )}

              {groups.map(({ group, items }) => (
                <div key={group} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6B6E76]">
                    {group}
                  </div>
                  {items.map((command) => {
                    const index = cursor++;
                    const isActive = index === activeIndex;
                    const binding = command.keys
                      ? formatBinding(
                          Array.isArray(command.keys) ? command.keys[0] : command.keys,
                        )
                      : null;

                    return (
                      <button
                        key={command.id}
                        id={command.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive}
                        className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                          isActive
                            ? 'border border-[#5C3016] bg-[#2B1A11]'
                            : 'border border-transparent hover:bg-[#111318]'
                        }`}
                        onClick={() => execute(command)}
                        onMouseMove={() => setActiveIndex(index)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={`shrink-0 ${
                              command.destructive
                                ? 'text-[#E5484D]'
                                : isActive
                                  ? 'text-[#FF8C42]'
                                  : 'text-[#6B6E76]'
                            }`}
                          >
                            <CommandIcon name={command.icon} />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-xs font-semibold ${
                                command.destructive ? 'text-[#E5484D]' : 'text-[#F5F5F5]'
                              }`}
                            >
                              {command.label}
                            </span>
                            {command.description && (
                              <span className="block truncate text-[11px] text-[#A1A4AC]">
                                {command.description}
                              </span>
                            )}
                          </span>
                        </span>

                        {binding && (
                          <kbd
                            className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                              isActive
                                ? 'border-[#5C3016] bg-[#1D1410] text-[#FF8C42]'
                                : 'border-[#282C35] bg-[#111318] text-[#6B6E76]'
                            }`}
                          >
                            {binding}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <footer className="flex items-center justify-between border-t border-[#282C35] bg-[#111318] px-4 py-2 text-[11px] text-[#6B6E76]">
              <span className="flex items-center gap-3">
                <span>
                  <kbd className="font-mono text-[#A1A4AC]">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="font-mono text-[#A1A4AC]">↵</kbd> run
                </span>
                <span className="hidden sm:inline">
                  <kbd className="font-mono text-[#A1A4AC]">esc</kbd> close
                </span>
              </span>
              <span className="text-[10px] font-medium text-[#FF8C42]">
                {flatOrder.length} command{flatOrder.length === 1 ? '' : 's'}
              </span>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
