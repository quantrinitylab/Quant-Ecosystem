import { describe, expect, it } from 'vitest';
import { foundationThemes } from '@quant/brand';
import {
  quantMailAuthLockup,
  quantMailAuthTheme,
  quantMailAuthThemeName,
} from '../auth-brand-contract';

describe('QuantMail auth brand bridge', () => {
  it('uses the canonical endorsed-product contract', () => {
    expect(quantMailAuthLockup.productName).toBe('QuantMail');
    expect(quantMailAuthLockup.byline).toBe('by QUANTRINITY');
    expect(quantMailAuthLockup.accessibleName).toBe('QuantMail by Quantrinity');
  });

  it('identifies the authentication surface as the dark semantic mode', () => {
    expect(quantMailAuthThemeName).toBe('dark');
  });

  it('maps new semantic variables directly from the foundation', () => {
    const dark = foundationThemes.dark;

    expect(quantMailAuthTheme['--qt-canvas']).toBe(dark.canvas);
    expect(quantMailAuthTheme['--qt-text-strong']).toBe(dark.textStrong);
    expect(quantMailAuthTheme['--qt-action-primary']).toBe(dark.actionPrimary);
    expect(quantMailAuthTheme['--qt-focus-ring']).toBe(dark.focusRing);
    expect(quantMailAuthTheme['--qt-ai-context']).toBe(dark.aiContext);
  });

  it('keeps existing auth CSS functional through semantic aliases', () => {
    expect(quantMailAuthTheme['--quant-background']).toBe(quantMailAuthTheme['--qt-canvas']);
    expect(quantMailAuthTheme['--quant-foreground']).toBe(quantMailAuthTheme['--qt-text-strong']);
    expect(quantMailAuthTheme['--quant-ring']).toBe(quantMailAuthTheme['--qt-focus-ring']);
    expect(quantMailAuthTheme['--brand-primary']).toBe(
      quantMailAuthTheme['--qt-action-primary'],
    );
  });
});
