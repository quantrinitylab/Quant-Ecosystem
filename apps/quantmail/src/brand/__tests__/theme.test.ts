import { foundationThemes } from '@quant/brand';
import { describe, expect, it } from 'vitest';
import { quantMailDarkSemanticTheme, quantMailDarkSemanticThemeName } from '../theme';

const semanticRoles = [
  '--qt-canvas',
  '--qt-surface-1',
  '--qt-surface-2',
  '--qt-surface-3',
  '--qt-text-strong',
  '--qt-text-default',
  '--qt-text-muted',
  '--qt-border-subtle',
  '--qt-border-default',
  '--qt-border-strong',
  '--qt-action-primary',
  '--qt-action-primary-hover',
  '--qt-action-primary-foreground',
  '--qt-focus-ring',
  '--qt-success',
  '--qt-warning',
  '--qt-danger',
  '--qt-info',
  '--qt-ai-context',
] as const;

describe('QuantMail semantic theme', () => {
  it('exposes every dark foundation role as a canonical CSS variable', () => {
    expect(Object.keys(quantMailDarkSemanticTheme)).toEqual(semanticRoles);
    expect(quantMailDarkSemanticTheme['--qt-canvas']).toBe(foundationThemes.dark.canvas);
    expect(quantMailDarkSemanticTheme['--qt-action-primary']).toBe(
      foundationThemes.dark.actionPrimary,
    );
    expect(quantMailDarkSemanticTheme['--qt-ai-context']).toBe(
      foundationThemes.dark.aiContext,
    );
  });

  it('keeps the contract immutable and explicitly dark', () => {
    expect(Object.isFrozen(quantMailDarkSemanticTheme)).toBe(true);
    expect(quantMailDarkSemanticThemeName).toBe('dark');
  });
});
