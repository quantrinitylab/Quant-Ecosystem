import React, { useState, useEffect, useRef } from 'react';
import type { CommandItem } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
}: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredCommands = commands.filter((cmd) => {
    if (!query.trim()) return true;
    const lowerQuery = query.toLowerCase();
    const titleMatch = cmd.title.toLowerCase().includes(lowerQuery);
    const subMatch = cmd.subtitle?.toLowerCase().includes(lowerQuery);
    const catMatch = cmd.category.toLowerCase().includes(lowerQuery);
    const kwMatch = cmd.keywords?.some((kw) => kw.toLowerCase().includes(lowerQuery));
    return titleMatch || subMatch || catMatch || kwMatch;
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? Math.max(0, filteredCommands.length - 1) : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div className="command-palette-modal" onClick={(e) => e.stopPropagation()}>
        <div className="palette-search-wrapper">
          <span className="palette-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a sovereign command or search apps (e.g. mail, vfs, code)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="palette-kbd-chip">ESC to exit</span>
        </div>

        <div className="palette-list" role="listbox">
          {filteredCommands.length === 0 ? (
            <div className="palette-empty">No matching sovereign commands found</div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`palette-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="palette-item-left">
                    <span className="palette-item-icon">{cmd.icon || '⚡'}</span>
                    <div>
                      <span className="palette-item-title">{cmd.title}</span>
                      {cmd.subtitle && <span className="palette-item-sub">— {cmd.subtitle}</span>}
                    </div>
                  </div>
                  {cmd.shortcut && <span className="palette-item-shortcut">{cmd.shortcut}</span>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
