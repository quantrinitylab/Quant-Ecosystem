'use client';

import React from 'react';

export type ShellMode = { id: string; label: string };

export const SHELL_MODES: ShellMode[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'image', label: 'Create image' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'research', label: 'Deep research' },
  { id: 'web', label: 'Web search' },
];

export function ModeChips(props: {
  modes: ShellMode[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const { modes, activeId, onSelect } = props;
  return (
    <div
      role="group"
      aria-label="Modes"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
    >
      {modes.map((mode) => {
        const active = mode.id === activeId;
        return (
          <button
            key={mode.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(mode.id)}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: '9999px',
              border: active ? '1px solid #8B5CF6' : '1px solid #334155',
              background: active ? '#8B5CF6' : '#1a1a24',
              color: active ? '#ffffff' : '#94a3b8',
              fontSize: '0.875rem',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
