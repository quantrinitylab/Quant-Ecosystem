import { describe, it, expect } from 'vitest';
import {
  CHAT_THEMES,
  CHAT_THEME_CSS_VARS,
  DEFAULT_CHAT_THEME,
  THEME_APPLY_BUDGET_MS,
  getAlienThemes,
  getChatTheme,
  themeToCssVars,
} from '../lib/chat-themes';

// Unit tests for the chat theme catalog (Task 14.1) and application (14.2).

describe('chat theme catalog', () => {
  it('provides at least 10 predefined themes (Requirement 14.1)', () => {
    expect(CHAT_THEMES.length).toBeGreaterThanOrEqual(10);
  });

  it('includes the 3 alien-aesthetic themes (Requirement 14.4)', () => {
    const alienIds = getAlienThemes().map((t) => t.id);
    expect(alienIds).toEqual(
      expect.arrayContaining(['nebula', 'quantum-void', 'bioluminescent-cave']),
    );
    expect(getAlienThemes()).toHaveLength(3);
  });

  it('gives every theme the three required visual dimensions', () => {
    for (const theme of CHAT_THEMES) {
      expect(theme.backgroundGradient.length).toBeGreaterThan(0);
      expect(theme.bubbleColor.length).toBeGreaterThan(0);
      expect(theme.fontStyle.length).toBeGreaterThan(0);
    }
  });

  it('has unique theme ids', () => {
    const ids = CHAT_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getChatTheme', () => {
  it('resolves a known theme by id', () => {
    expect(getChatTheme('nebula').name).toBe('Nebula');
  });

  it('falls back to the default theme for unknown/empty ids', () => {
    expect(getChatTheme('does-not-exist')).toBe(DEFAULT_CHAT_THEME);
    expect(getChatTheme(null)).toBe(DEFAULT_CHAT_THEME);
    expect(getChatTheme(undefined)).toBe(DEFAULT_CHAT_THEME);
  });
});

describe('themeToCssVars', () => {
  it('emits the chat CSS custom properties and a <=200ms transition', () => {
    const vars = themeToCssVars(getChatTheme('quantum-void')) as Record<string, string>;
    expect(vars[CHAT_THEME_CSS_VARS.background]).toBeDefined();
    expect(vars[CHAT_THEME_CSS_VARS.bubble]).toBeDefined();
    expect(vars[CHAT_THEME_CSS_VARS.font]).toBeDefined();
    expect(vars.transition).toContain(`${THEME_APPLY_BUDGET_MS}ms`);
  });
});
