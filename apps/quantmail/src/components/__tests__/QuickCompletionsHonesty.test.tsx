/**
 * Quick-completions copy-honesty pin (fix/qm-smart-compose-honest).
 *
 * The composer's completion feature is a STATIC 18-entry regex table
 * (QUICK_COMPLETIONS) matching typed body text against hardcoded phrases —
 * there is no model behind it. The UI used to brand it "Smart Compose
 * Predictive Autocomplete" / "Next word suggestion", wearing Gmail's ML
 * feature name (same invented-AI-capability class as the "AI Duplicate
 * Contact Cleaner" renamed in PR #912). Shipping a real model needs user
 * discussion first; until then the feature must wear an honest label.
 *
 * These tests pin that invariant on source: the chip and comments say
 * "Quick completion(s)" with an explicit "not machine learning" disclaimer,
 * and no "Smart Compose" / ML-capability claims remain anywhere in the
 * composer surfaces (EmailComposer.tsx, DockedComposer.tsx).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..', '..'); // apps/quantmail/src

const read = (...parts: string[]): string =>
  readFileSync(join(srcRoot, ...parts), 'utf8');

// Every user-visible or code-visible ML-capability claim the old code wore.
const BANNED_PHRASES = [
  'Smart Compose',
  'SmartCompose',
  'smart-compose',
  'Next word suggestion',
  'Predictive Autocomplete',
  'SMART_PREDICTIONS',
  'activePrediction',
];

describe('quick completions are honestly labeled, not ML-branded', () => {
  it('no Smart Compose / ML-capability claims remain in the composers', () => {
    const emailComposer = read('components', 'EmailComposer.tsx');
    const dockedComposer = read('components', 'DockedComposer.tsx');
    for (const [name, source] of [
      ['EmailComposer', emailComposer],
      ['DockedComposer', dockedComposer],
    ] as const) {
      for (const phrase of BANNED_PHRASES) {
        expect(source, `${name} must not contain "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it('the chip shows the honest "Quick completion" label', () => {
    const emailComposer = read('components', 'EmailComposer.tsx');
    expect(emailComposer).toContain('Quick completion:');
  });

  it('the completion table carries an explicit not-a-model disclaimer', () => {
    const emailComposer = read('components', 'EmailComposer.tsx');
    // The QUICK_COMPLETIONS doc comment must say it is a static lookup.
    expect(emailComposer).toContain('STATIC phrase lookup');
    expect(emailComposer).toContain('not machine learning');
    expect(emailComposer).toContain('no model runs behind this feature');
  });

  it('the renamed identifiers describe a lookup, not intelligence', () => {
    const emailComposer = read('components', 'EmailComposer.tsx');
    expect(emailComposer).toContain('const QUICK_COMPLETIONS:');
    expect(emailComposer).toContain('activeCompletion');
    expect(emailComposer).toContain('acceptCompletion');
  });

  it('DockedComposer has no dishonest completion twin to fix', () => {
    // The twin composer must not silently carry its own ML-branded
    // completion feature; this pins the "verify DockedComposer" step.
    const dockedComposer = read('components', 'DockedComposer.tsx');
    expect(dockedComposer).not.toMatch(/QUICK_COMPLETIONS|activeCompletion/i);
  });
});
