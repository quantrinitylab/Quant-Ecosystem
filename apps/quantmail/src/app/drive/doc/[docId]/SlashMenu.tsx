// ============================================================================
// QuantDrive Document Editor — In-House Slash Command Block Menu
// Gate N-G2: Zero commercial Pro dependencies, 100% native Tailwind design tokens
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import type { BlockType, SlashCommandOption } from './types';

export const SLASH_COMMANDS: SlashCommandOption[] = [
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    badge: '#',
    keywords: ['h1', 'heading1', 'title', 'header', '#'],
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    badge: '##',
    keywords: ['h2', 'heading2', 'subtitle', '##'],
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Small subsection heading',
    icon: 'H3',
    badge: '###',
    keywords: ['h3', 'heading3', 'sub', '###'],
  },
  {
    id: 'todo',
    title: 'To-do List',
    description: 'Track tasks with a checkbox',
    icon: '☑',
    badge: '[]',
    keywords: ['todo', 'task', 'check', 'checklist', 'box', '[]'],
  },
  {
    id: 'bullet',
    title: 'Bulleted List',
    description: 'Create a simple bulleted list',
    icon: '•',
    badge: '-',
    keywords: ['bullet', 'list', 'unordered', 'ul', '-'],
  },
  {
    id: 'numbered',
    title: 'Numbered List',
    description: 'Create a numbered sequential list',
    icon: '1.',
    badge: '1.',
    keywords: ['numbered', 'number', 'ordered', 'ol', '1.'],
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Add an interactive data table',
    icon: '▦',
    badge: 'table',
    keywords: ['table', 'grid', 'matrix', 'rows', 'columns'],
  },
  {
    id: 'code',
    title: 'Code Block',
    description: 'Capture code snippet with syntax styling',
    icon: '</>',
    badge: '```',
    keywords: ['code', 'snippet', 'syntax', 'programming', 'pre', '```'],
  },
  {
    id: 'callout',
    title: 'Callout',
    description: 'Highlight important note with an icon',
    icon: '💡',
    badge: 'note',
    keywords: ['callout', 'note', 'alert', 'tip', 'info', 'highlight'],
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Capture a quote or citation',
    icon: '❝',
    badge: '>',
    keywords: ['quote', 'blockquote', 'citation', '>'],
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Visually divide sections with a line',
    icon: '—',
    badge: '---',
    keywords: ['divider', 'line', 'separator', 'hr', 'rule', '---'],
  },
];

interface SlashMenuProps {
  query: string;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

export const SlashMenu: React.FC<SlashMenuProps> = ({ query, onSelect, onClose, position }) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const cleanQuery = query.toLowerCase().replace(/^\//, '').trim();

  const filteredCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!cleanQuery) return true;
    return (
      cmd.title.toLowerCase().includes(cleanQuery) ||
      cmd.description.toLowerCase().includes(cleanQuery) ||
      cmd.keywords.some((kw) => kw.toLowerCase().includes(cleanQuery))
    );
  });

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [cleanQuery]);

  // Handle keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredCommands.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          onSelect(selected.id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (menuRef.current) {
      const activeEl = menuRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Slash commands"
      className="absolute z-50 w-72 max-h-80 overflow-y-auto rounded-xl border border-[#30363D] bg-[#161B22] p-1.5 shadow-2xl backdrop-blur-md no-scrollbar"
      style={{
        top: position ? `${position.top}px` : 'auto',
        left: position ? `${position.left}px` : 'auto',
      }}
    >
      <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#8B949E] border-b border-[#21262D] mb-1 flex items-center justify-between">
        <span>Basic Blocks</span>
        {cleanQuery && <span className="text-[#FF8C42]">Filter: &ldquo;{cleanQuery}&rdquo;</span>}
      </div>

      {filteredCommands.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-[#8B949E]">
          No matching blocks for &ldquo;{cleanQuery}&rdquo;
        </div>
      ) : (
        <div className="space-y-0.5">
          {filteredCommands.map((cmd, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={cmd.id}
                type="button"
                role="menuitem"
                data-selected={isSelected}
                onClick={() => onSelect(cmd.id)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  isSelected
                    ? 'bg-[#21262D] text-[#F0F6FC]'
                    : 'text-[#C9D1D9] hover:bg-[#21262D]/60 hover:text-[#F0F6FC]'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-mono font-bold shrink-0 border ${
                    isSelected
                      ? 'border-[#FF8C42]/40 bg-[#FF8C42]/10 text-[#FF8C42]'
                      : 'border-[#30363D] bg-[#0D1117] text-[#8B949E]'
                  }`}
                >
                  {cmd.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-[#F0F6FC] truncate">{cmd.title}</span>
                    {cmd.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#0D1117] text-[#8B949E] border border-[#30363D]">
                        {cmd.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8B949E] truncate">{cmd.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
