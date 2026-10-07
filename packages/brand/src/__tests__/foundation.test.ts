import { describe, expect, it } from 'vitest';
import {
  createEndorsedProductLockup,
  foundationThemes,
  generateFoundationCSS,
  meetsAA,
  quantrinityMasterbrand,
} from '../index';

describe('Quantrinity masterbrand contract', () => {
  it('freezes company and identity domains separately', () => {
    expect(quantrinityMasterbrand.name).toBe('QUANTRINITY');
    expect(quantrinityMasterbrand.companyDomain).toBe('quantrinity.in');
    expect(quantrinityMasterbrand.identityDomain).toBe('quantmail.in');
  });

  it('keeps final mark geometry explicitly pending visual review', () => {
    expect(quantrinityMasterbrand.markStatus).toBe('geometry-pending-visual-review');
  });
});

describe('endorsed product lockup', () => {
  it('creates the approved QuantMail hierarchy and accessible name', () => {
    const lockup = createEndorsedProductLockup('QuantMail');
    expect(lockup.productName).toBe('QuantMail');
    expect(lockup.parentName).toBe('QUANTRINITY');
    expect(lockup.byline).toBe('by QUANTRINITY');
    expect(lockup.accessibleName).toBe('QuantMail by Quantrinity');
    expect(lockup.parentScale).toBe(0.45);
  });

  it('normalizes surrounding whitespace', () => {
    expect(createEndorsedProductLockup('  QuantChat  ').productName).toBe('QuantChat');
  });

  it('rejects an empty product name', () => {
    expect(() => createEndorsedProductLockup('   ')).toThrow(
      'Product name is required for a Quantrinity endorsement',
    );
  });
});

describe('semantic foundation themes', () => {
  it('provides dark, light and high-contrast modes', () => {
    expect(Object.keys(foundationThemes)).toEqual(['dark', 'light', 'highContrast']);
  });

  it('keeps primary action labels at AA contrast', () => {
    for (const [name, theme] of Object.entries(foundationThemes)) {
      expect(
        meetsAA(theme.actionPrimaryForeground, theme.actionPrimary),
        `${name} primary action pair should meet AA`,
      ).toBe(true);
    }
  });

  it('keeps default reading text at AA contrast', () => {
    for (const [name, theme] of Object.entries(foundationThemes)) {
      expect(
        meetsAA(theme.textDefault, theme.canvas),
        `${name} default text on canvas should meet AA`,
      ).toBe(true);
    }
  });

  it('generates only semantic qt variables for a selected mode', () => {
    const css = generateFoundationCSS('dark');
    expect(css).toContain(':root[data-quant-theme="dark"]');
    expect(css).toContain('--qt-canvas:');
    expect(css).toContain('--qt-text-strong:');
    expect(css).toContain('--qt-action-primary:');
    expect(css).toContain('--qt-ai-context:');
    expect(css).not.toContain('--brand-primary-500');
  });
});
