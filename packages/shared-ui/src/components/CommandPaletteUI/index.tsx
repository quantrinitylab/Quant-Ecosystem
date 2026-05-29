// ============================================================================
// Shared UI - CommandPaletteUI Component
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '@quant/brand';

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
 * This component only handles closing (Escape key). The parent is responsible
 * for opening the palette (e.g. via a Cmd+K listener in AppProviders).
 */
export const CommandPaletteUI: React.FC<CommandPaletteUIProps> = ({
  isOpen,
  onClose,
  commands,
  placeholder = 'Search commands...',
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle Escape to close (Cmd+K open is owned by the app-level provider)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[activeIndex]) {
          filteredCommands[activeIndex].cmd.action();
          onClose();
        }
      }
    },
    [filteredCommands, activeIndex, onClose],
  );

  const transition = {
    type: 'spring' as const,
    ...spring.stiff,
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
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
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={inputRef}
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
              />
            </div>
            <div
              style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px' }}
              role="listbox"
              aria-label="Command results"
            >
              {filteredCommands.length === 0 ? (
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
              ) : (
                Object.entries(groups).map(([group, items]) => {
                  let itemIndex = -1;
                  // Calculate the offset for this group
                  let groupOffset = 0;
                  for (const [g, gItems] of Object.entries(groups)) {
                    if (g === group) break;
                    groupOffset += gItems.length;
                  }
                  return (
                    <div key={group} style={{ marginBottom: '8px' }}>
                      <div
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
                      {items.map((item) => {
                        itemIndex++;
                        const globalIndex = groupOffset + itemIndex;
                        const isActive = globalIndex === activeIndex;
                        return (
                          <button
                            key={item.cmd.id}
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
                })
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
