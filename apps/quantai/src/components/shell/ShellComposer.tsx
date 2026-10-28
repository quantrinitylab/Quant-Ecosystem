'use client';

import React, { useEffect, useRef } from 'react';
import { ModeChips, type ShellMode } from './ModeChips';

export type ShellEffort = 'fast' | 'thinking';

export function ShellComposer(props: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  effort?: ShellEffort;
  onEffortChange?: (e: ShellEffort) => void;
  activeMode?: string;
  onModeChange?: (id: string) => void;
  modes?: ShellMode[];
  onAttach?: () => void;
  onVoice?: () => void;
  placeholder?: string;
  /** Ref to the composer textarea (React 19 ref-as-prop), for focus
      restoration after send / after prefill by the caller. */
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  const {
    value,
    onChange,
    onSend,
    isLoading = false,
    disabled = false,
    effort = 'fast',
    onEffortChange,
    activeMode,
    onModeChange,
    modes,
    onAttach,
    onVoice,
    placeholder = 'Type a message',
    ref: externalRef,
  } = props;

  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = (node: HTMLTextAreaElement | null) => {
    (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
      node;
    if (typeof externalRef === 'function') {
      externalRef(node);
    } else if (externalRef && typeof externalRef === 'object') {
      (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>)
        .current = node;
    }
  };

  const canSend = value.trim().length > 0 && !isLoading && !disabled;

  // Auto-grow: single-line look at rest (rows=1), grows with content up
  // to a cap, then scrolls. Guarded on scrollHeight so jsdom (0) is a no-op.
  useEffect(() => {
    const el = internalRef.current;
    if (!el || el.scrollHeight <= 0) {
      return;
    }
    const maxHeight = 160;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    onSend();
    internalRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter is deliberately NOT prevented, so the
    // textarea's native newline insertion applies.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!canSend) {
        return;
      }
      onSend();
      internalRef.current?.focus();
    }
  }

  const chipRow =
    modes !== undefined && onModeChange !== undefined ? (
      <ModeChips
        modes={modes}
        activeId={activeMode ?? modes[0]?.id ?? ''}
        onSelect={onModeChange}
      />
    ) : null;

  const effortRow =
    onEffortChange !== undefined ? (
      <div
        role="group"
        aria-label="Effort"
        style={{ display: 'flex', gap: '0.25rem' }}
      >
        {(['fast', 'thinking'] as ShellEffort[]).map((option) => {
          const active = effort === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onEffortChange(option)}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '9999px',
                border: active ? '1px solid #8B5CF6' : '1px solid #334155',
                background: active ? '#8B5CF6' : '#1a1a24',
                color: active ? '#ffffff' : '#94a3b8',
                fontSize: '0.8125rem',
                fontWeight: active ? 600 : 400,
                cursor: disabled ? 'not-allowed' : 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        background: '#1a1a24',
        border: '1px solid #1e293b',
        borderRadius: '1rem',
        padding: '0.75rem',
      }}
    >
      {chipRow}
      {effortRow}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {onAttach !== undefined ? (
          <button
            type="button"
            aria-label="Attach"
            disabled={disabled}
            onClick={onAttach}
            style={{
              background: '#252530',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              flexShrink: 0,
            }}
          >
            Attach
          </button>
        ) : null}
        <textarea
          ref={textareaRef}
          rows={1}
          aria-label="Message"
          aria-describedby="shell-composer-hint"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            background: '#0F0F14',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '0.5rem',
            padding: '0.625rem 0.75rem',
            fontSize: '0.9375rem',
            resize: 'none',
            overflowY: 'hidden',
            lineHeight: '1.4',
          }}
        />
        {onVoice !== undefined ? (
          <button
            type="button"
            aria-label="Voice input"
            disabled={disabled}
            onClick={onVoice}
            style={{
              background: '#252530',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              flexShrink: 0,
            }}
          >
            Voice
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!canSend}
          style={{
            background: canSend ? '#8B5CF6' : '#252530',
            color: canSend ? '#ffffff' : '#94a3b8',
            border: '1px solid #8B5CF6',
            borderRadius: '0.5rem',
            padding: '0.625rem 1rem',
            cursor: canSend ? 'pointer' : 'not-allowed',
            fontSize: '0.9375rem',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
      <p
        id="shell-composer-hint"
        style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}
      >
        Press Enter to send, Shift + Enter for a new line
      </p>
    </form>
  );
}
