// ============================================================================
// QuantChat - Chat Theme Catalog & Application (Task 14.1, 14.2)
//
// A predefined catalog of 10+ chat themes, including 3 alien-aesthetic themes
// (nebula, quantum void, bioluminescent cave) that align with the QuantChat
// brand identity.
//
// A theme is defined by three visual dimensions:
//   - backgroundGradient : CSS gradient applied to the conversation backdrop
//   - bubbleColor         : CSS color/gradient applied to message bubbles
//   - fontStyle           : CSS font-family stack applied to message text
//
// Themes are applied to the conversation view by emitting CSS custom
// properties with a 200ms transition so the switch completes within budget.
//
// Requirements: 14.1, 14.2, 14.4 (alien themes)
// ============================================================================

import type { CSSProperties } from 'react';

/** Visual definition for a single chat theme. */
export interface ChatTheme {
  /** Stable identifier persisted per-conversation. */
  id: string;
  /** Human-readable name shown in the picker. */
  name: string;
  /** CSS background gradient for the conversation backdrop. */
  backgroundGradient: string;
  /** CSS color (or gradient) for message bubbles. */
  bubbleColor: string;
  /** CSS font-family stack for message text. */
  fontStyle: string;
  /** Text color used on top of the bubble for legibility. */
  textColor: string;
  /** Whether this is one of the alien-aesthetic brand themes. */
  isAlienTheme: boolean;
}

/** CSS custom-property names emitted when a theme is applied. */
export const CHAT_THEME_CSS_VARS = {
  background: '--chat-bg',
  bubble: '--chat-bubble',
  font: '--chat-font',
  text: '--chat-text',
} as const;

/**
 * Maximum time (ms) the theme application is allowed to take.
 * Used as the CSS transition duration so the swap completes within budget.
 * Requirement 14.2: apply within 200ms.
 */
export const THEME_APPLY_BUDGET_MS = 200;

// ─── Theme Catalog (12 themes, 3 alien) ─────────────────────────────────────

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: 'default',
    name: 'Default',
    backgroundGradient: 'linear-gradient(180deg, #1c1c1e 0%, #2c2c2e 100%)',
    bubbleColor: '#fffc00',
    fontStyle: "'Inter', system-ui, sans-serif",
    textColor: '#000000',
    isAlienTheme: false,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    backgroundGradient: 'linear-gradient(160deg, #0d47a1 0%, #1565c0 50%, #42a5f5 100%)',
    bubbleColor: '#4fc3f7',
    fontStyle: "'Inter', system-ui, sans-serif",
    textColor: '#012b4d',
    isAlienTheme: false,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    backgroundGradient: 'linear-gradient(160deg, #ff6f00 0%, #ff8f00 50%, #ffa000 100%)',
    bubbleColor: '#ff7043',
    fontStyle: "'Inter', system-ui, sans-serif",
    textColor: '#3a1500',
    isAlienTheme: false,
  },
  {
    id: 'forest',
    name: 'Forest',
    backgroundGradient: 'linear-gradient(160deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)',
    bubbleColor: '#66bb6a',
    fontStyle: "'Inter', system-ui, sans-serif",
    textColor: '#08230b',
    isAlienTheme: false,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    backgroundGradient: 'linear-gradient(180deg, #0a0a23 0%, #1a237e 100%)',
    bubbleColor: '#7c4dff',
    fontStyle: "'Inter', system-ui, sans-serif",
    textColor: '#ffffff',
    isAlienTheme: false,
  },
  {
    id: 'cotton-candy',
    name: 'Cotton Candy',
    backgroundGradient: 'linear-gradient(135deg, #f8bbd0 0%, #ce93d8 50%, #b39ddb 100%)',
    bubbleColor: '#f48fb1',
    fontStyle: "'Quicksand', 'Inter', system-ui, sans-serif",
    textColor: '#4a1530',
    isAlienTheme: false,
  },
  {
    id: 'neon',
    name: 'Neon',
    backgroundGradient: 'linear-gradient(180deg, #0d0d0d 0%, #212121 100%)',
    bubbleColor: '#76ff03',
    fontStyle: "'Orbitron', 'Inter', system-ui, sans-serif",
    textColor: '#06150a',
    isAlienTheme: false,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    backgroundGradient: 'linear-gradient(180deg, #ffffff 0%, #f2f2f7 100%)',
    bubbleColor: '#e0e0e0',
    fontStyle: "'Inter', system-ui, sans-serif",
    textColor: '#1c1c1e',
    isAlienTheme: false,
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    backgroundGradient: 'linear-gradient(135deg, #fff0f0 0%, #f8d7da 100%)',
    bubbleColor: '#e8b4b8',
    fontStyle: "'Inter', system-ui, sans-serif",
    textColor: '#4a1c1c',
    isAlienTheme: false,
  },
  // ─── Alien-aesthetic brand themes (Requirement 14.4) ──────────────────────
  {
    id: 'nebula',
    name: 'Nebula',
    backgroundGradient: 'radial-gradient(circle at 30% 20%, #5b2a86 0%, #2d1b4e 40%, #0c0420 100%)',
    bubbleColor: 'linear-gradient(135deg, #b06ab3 0%, #4568dc 100%)',
    fontStyle: "'Exo 2', 'Inter', system-ui, sans-serif",
    textColor: '#f5e9ff',
    isAlienTheme: true,
  },
  {
    id: 'quantum-void',
    name: 'Quantum Void',
    backgroundGradient: 'radial-gradient(ellipse at center, #001219 0%, #000307 70%, #000000 100%)',
    bubbleColor: 'linear-gradient(135deg, #00f5d4 0%, #00bbf9 100%)',
    fontStyle: "'Orbitron', 'Inter', system-ui, sans-serif",
    textColor: '#001a17',
    isAlienTheme: true,
  },
  {
    id: 'bioluminescent-cave',
    name: 'Bioluminescent Cave',
    backgroundGradient: 'linear-gradient(180deg, #02111b 0%, #053b50 55%, #0a4d4d 100%)',
    bubbleColor: 'linear-gradient(135deg, #2afadf 0%, #4c83ff 100%)',
    fontStyle: "'Exo 2', 'Inter', system-ui, sans-serif",
    textColor: '#022f2a',
    isAlienTheme: true,
  },
];

/** Default theme used when a conversation has no theme set. */
export const DEFAULT_CHAT_THEME: ChatTheme = CHAT_THEMES[0];

/** Lookup map for O(1) access by id. */
const THEME_BY_ID = new Map<string, ChatTheme>(CHAT_THEMES.map((t) => [t.id, t]));

/** Resolve a theme by id, falling back to the default theme. */
export function getChatTheme(themeId: string | null | undefined): ChatTheme {
  if (!themeId) return DEFAULT_CHAT_THEME;
  return THEME_BY_ID.get(themeId) ?? DEFAULT_CHAT_THEME;
}

/** The list of alien-aesthetic themes (Requirement 14.4). */
export function getAlienThemes(): ChatTheme[] {
  return CHAT_THEMES.filter((t) => t.isAlienTheme);
}

/**
 * Convert a theme into the CSS custom properties that drive the conversation
 * view. Components spread these onto the conversation container's `style`.
 *
 * A `transition` is included so that swapping the variables animates within
 * the {@link THEME_APPLY_BUDGET_MS} budget (Requirement 14.2).
 */
export function themeToCssVars(theme: ChatTheme): CSSProperties {
  return {
    [CHAT_THEME_CSS_VARS.background]: theme.backgroundGradient,
    [CHAT_THEME_CSS_VARS.bubble]: theme.bubbleColor,
    [CHAT_THEME_CSS_VARS.font]: theme.fontStyle,
    [CHAT_THEME_CSS_VARS.text]: theme.textColor,
    background: theme.backgroundGradient,
    fontFamily: theme.fontStyle,
    transition: `background ${THEME_APPLY_BUDGET_MS}ms ease, color ${THEME_APPLY_BUDGET_MS}ms ease`,
  } as CSSProperties;
}

/**
 * Imperatively apply a theme to a DOM element by writing the CSS custom
 * properties. Returns the elapsed time (ms) so callers can assert the
 * 200ms budget. Safe to call with `null` (no-op).
 */
export function applyThemeToElement(element: HTMLElement | null, theme: ChatTheme): number {
  const start =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  if (!element) return 0;

  element.style.setProperty(CHAT_THEME_CSS_VARS.background, theme.backgroundGradient);
  element.style.setProperty(CHAT_THEME_CSS_VARS.bubble, theme.bubbleColor);
  element.style.setProperty(CHAT_THEME_CSS_VARS.font, theme.fontStyle);
  element.style.setProperty(CHAT_THEME_CSS_VARS.text, theme.textColor);
  element.style.setProperty(
    'transition',
    `background ${THEME_APPLY_BUDGET_MS}ms ease, color ${THEME_APPLY_BUDGET_MS}ms ease`,
  );
  element.style.background = theme.backgroundGradient;
  element.style.fontFamily = theme.fontStyle;

  const end =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return end - start;
}
