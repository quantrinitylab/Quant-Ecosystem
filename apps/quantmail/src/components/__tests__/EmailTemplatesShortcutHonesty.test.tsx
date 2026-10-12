/**
 * QM template :shortcut copy-honesty pin (queue line 218).
 *
 * The `shortcut` field is a display-only identifier shown next to a template's
 * name in the picker. NOTHING in any composer recalls a template when the user
 * types `:name` — templates are inserted only by selecting them in the picker,
 * and there is no template create/edit UI in the web app. The copy must never
 * promise typing-recall ("a real shortcut the user can type … to recall this
 * template" / "a template can be recalled by").
 *
 * These tests pin that invariant on source: the comments and the rendered
 * picker label say display-only, and no composer implements :shortcut typing
 * detection.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..', '..'); // apps/quantmail/src
const appRoot = join(here, '..', '..'); // apps/quantmail

const read = (relativeTo: 'src' | 'app', ...parts: string[]): string =>
  readFileSync(join(relativeTo === 'src' ? srcRoot : appRoot, ...parts), 'utf8');

const TYPING_RECALL_PROMISES = [
  'can type',
  'to recall this template',
  'to recall a template',
  'recalled by',
  'type to recall',
  'recalls this template',
];

describe('template :shortcut is honestly described as display-only', () => {
  it('EmailTemplates.tsx never promises typing-recall', () => {
    const source = read('src', 'components', 'EmailTemplates.tsx');
    for (const promise of TYPING_RECALL_PROMISES) {
      expect(source.toLowerCase(), `must not promise "${promise}"`).not.toContain(promise);
    }
    expect(source).toContain('Display-only');
  });

  it('globals.css never promises typing-recall for .template-shortcut', () => {
    const css = read('app', 'app', 'globals.css');
    const marker = css.indexOf('.template-shortcut');
    expect(marker, '.template-shortcut rule exists').toBeGreaterThan(-1);
    // Inspect the comment block immediately above the rule.
    const context = css.slice(Math.max(0, marker - 600), marker);
    for (const promise of TYPING_RECALL_PROMISES) {
      expect(context.toLowerCase(), `must not promise "${promise}"`).not.toContain(promise);
    }
    expect(context).toContain('Display-only');
  });

  it('the rendered shortcut label carries an honest display-only title', () => {
    const source = read('src', 'components', 'EmailTemplates.tsx');
    expect(source).toContain('template-shortcut');
    expect(source).toContain('title="Display-only shortcut');
    // The title must say typing it does nothing — otherwise it still implies recall.
    expect(source).toContain('typing it in the composer does nothing');
  });

  it('no composer implements :shortcut typing detection', () => {
    const picker = read('src', 'components', 'EmailTemplates.tsx');
    const docked = read('src', 'components', 'DockedComposer.tsx');
    const emailComposer = read('src', 'components', 'EmailComposer.tsx');
    for (const [name, source] of [
      ['EmailTemplates', picker],
      ['DockedComposer', docked],
      ['EmailComposer', emailComposer],
    ] as const) {
      // No "typed text starts with ':'" trigger logic anywhere near templates.
      expect(source, `${name} must not detect typed :shortcuts`).not.toMatch(/startsWith\(['"]:/);
    }
    // Insertion path remains picker selection only.
    expect(picker).toContain('onSelectTemplate');
  });
});
