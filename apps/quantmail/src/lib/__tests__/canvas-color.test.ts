import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolveCanvasColor } from '../canvas-color';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveCanvasColor', () => {
  it('passes non-var() colors through untouched', () => {
    expect(resolveCanvasColor('#FF8C42')).toBe('#FF8C42');
    expect(resolveCanvasColor('rgba(255, 140, 66, 0.08)')).toBe('rgba(255, 140, 66, 0.08)');
    expect(resolveCanvasColor('')).toBe('');
  });

  it('resolves a var() token from computed style', () => {
    vi.stubGlobal('document', {
      documentElement: {},
    });
    vi.stubGlobal('getComputedStyle', () =>
      ({
        getPropertyValue: (token: string) =>
          token === '--quant-primary' ? '#FF8C42' : '',
      }) as CSSStyleDeclaration,
    );
    expect(resolveCanvasColor('var(--quant-primary)')).toBe('#FF8C42');
  });

  it('falls back to design-system literal when the token is unknown', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: () => '',
    }) as CSSStyleDeclaration);
    expect(resolveCanvasColor('var(--quant-primary)')).toBe('#FF8C42');
    expect(resolveCanvasColor('var(--quant-accent-faint)')).toBe('rgba(255, 140, 66, 0.08)');
  });

  it('resolves nested var() chains', () => {
    // --quant-primary: var(--brand-primary) — computed style normally flattens
    // this, but a raw chain must not survive either.
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (token: string) =>
        token === '--quant-primary' ? 'var(--brand-primary)' : '#FF8C42',
    }) as CSSStyleDeclaration);
    expect(resolveCanvasColor('var(--quant-primary)')).toBe('#FF8C42');
  });

  it('uses the fallback path when there is no DOM (SSR/tests)', () => {
    vi.stubGlobal('document', undefined);
    expect(resolveCanvasColor('var(--quant-primary)')).toBe('#FF8C42');
    expect(resolveCanvasColor('var(--brand-primary-pressed)')).toBe('#E8752F');
  });

  it('never returns an unparseable value', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: () => '   ',
    }) as CSSStyleDeclaration);
    const out = resolveCanvasColor('var(--does-not-exist)');
    expect(out).not.toContain('var(');
    expect(out.length).toBeGreaterThan(0);
  });
});
