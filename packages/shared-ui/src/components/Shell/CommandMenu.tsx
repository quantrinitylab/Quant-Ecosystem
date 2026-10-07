'use client';
// ============================================================================
// Shared UI - Command Menu Component (Cmd+K)
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  group?: string;
  action: () => void;
}

export interface CommandMenuProps {
  commands: Command[];
  placeholder?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  commands,
  placeholder = 'Type a command...',
  isOpen,
  onClose,
  onOpen,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          onOpen();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpen, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) => cmd.label.toLowerCase().includes(lower) || cmd.group?.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  const groups = useMemo(() => {
    const map: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      const group = cmd.group || 'Commands';
      if (!map[group]) map[group] = [];
      map[group].push(cmd);
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
          filteredCommands[activeIndex].action();
          onClose();
        }
      }
    },
    [filteredCommands, activeIndex, onClose],
  );

  if (!isOpen) return null;

  let itemIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command menu"
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center px-4 border-b border-gray-200">
          <svg
            className="w-5 h-5 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
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
            className="flex-1 px-3 py-4 text-sm bg-transparent border-0 focus:outline-none"
            aria-label="Command search"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-mono text-gray-400 bg-gray-100 rounded">
            Esc
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-2" role="listbox" aria-label="Command results">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">No commands found</div>
          ) : (
            Object.entries(groups).map(([group, cmds]) => (
              <div key={group}>
                <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">
                  {group}
                </div>
                {cmds.map((cmd) => {
                  itemIndex++;
                  const isActive = itemIndex === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-2 text-sm text-left focus:outline-none ${
                        isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      role="option"
                      aria-selected={isActive}
                    >
                      {cmd.icon && <span aria-hidden="true">{cmd.icon}</span>}
                      <span className="flex-1">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="text-xs font-mono text-gray-400">{cmd.shortcut}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
