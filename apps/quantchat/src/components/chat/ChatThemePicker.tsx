'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import {
  CHAT_THEMES,
  THEME_APPLY_BUDGET_MS,
  getChatTheme,
  themeToCssVars,
  type ChatTheme,
} from '../../lib/chat-themes';

// ============================================================================
// Task 14.1 / 14.2: ChatThemePicker
//
// Theme selection UI with 10+ predefined themes (including 3 alien-aesthetic
// themes). Selecting a theme applies it to the live preview within 200ms via
// CSS custom properties and notifies the parent so it can persist + sync.
//
// Requirements: 14.1, 14.2, 14.4
// ============================================================================

export interface ChatThemePickerProps {
  /** Conversation the theme applies to. */
  conversationId: string;
  /** Currently applied theme id. */
  currentThemeId?: string | null;
  /** Called when the user selects a theme. */
  onThemeSelect: (theme: ChatTheme) => void;
  /** Whether a persist operation is in flight (renders a saving hint). */
  isSaving?: boolean;
}

export const ChatThemePicker: React.FC<ChatThemePickerProps> = ({
  conversationId,
  currentThemeId,
  onThemeSelect,
  isSaving = false,
}) => {
  const [selectedId, setSelectedId] = useState<string>(() => getChatTheme(currentThemeId).id);

  const previewTheme = getChatTheme(selectedId);

  const handleSelect = useCallback(
    (theme: ChatTheme) => {
      setSelectedId(theme.id);
      onThemeSelect(theme);
    },
    [onThemeSelect],
  );

  return (
    <div className="chat-theme-picker" data-conversation-id={conversationId}>
      <header className="chat-theme-picker__header">
        <h2 className="chat-theme-picker__title">Chat Theme</h2>
        <p className="chat-theme-picker__subtitle">
          Personalize this conversation{isSaving ? ' · Saving…' : ''}
        </p>
      </header>

      {/* Live preview — updates within the 200ms apply budget via CSS vars. */}
      <motion.div
        className="chat-theme-picker__preview"
        style={{
          ...themeToCssVars(previewTheme),
          borderRadius: 16,
          padding: 20,
          minHeight: 120,
        }}
        layout
        transition={{ duration: THEME_APPLY_BUDGET_MS / 1000 }}
      >
        <div
          className="chat-theme-picker__preview-bubble"
          style={{
            background: previewTheme.bubbleColor,
            color: previewTheme.textColor,
            fontFamily: previewTheme.fontStyle,
            display: 'inline-block',
            padding: '8px 14px',
            borderRadius: 18,
            maxWidth: '80%',
          }}
        >
          Preview message ✨
        </div>
      </motion.div>

      <div
        className="chat-theme-picker__grid"
        role="listbox"
        aria-label="Chat themes"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: 10,
          marginTop: 16,
        }}
      >
        {CHAT_THEMES.map((theme) => {
          const isSelected = theme.id === selectedId;
          return (
            <motion.button
              key={theme.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => handleSelect(theme)}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className={`chat-theme-picker__swatch${isSelected ? ' is-selected' : ''}`}
              style={{
                background: theme.backgroundGradient,
                border: isSelected ? '2px solid #fffc00' : '2px solid transparent',
                borderRadius: 12,
                padding: 8,
                cursor: 'pointer',
                position: 'relative',
                aspectRatio: '1 / 1',
              }}
            >
              <span
                style={{
                  background: theme.bubbleColor,
                  color: theme.textColor,
                  fontFamily: theme.fontStyle,
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 11,
                }}
              >
                Hi!
              </span>
              <span
                className="chat-theme-picker__name"
                style={{
                  position: 'absolute',
                  bottom: 4,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: 10,
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                }}
              >
                {theme.name}
                {theme.isAlienTheme ? ' 👽' : ''}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default ChatThemePicker;
