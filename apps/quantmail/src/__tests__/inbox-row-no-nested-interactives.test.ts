import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * QM inbox P2 — the inbox row must not nest interactives inside a button.
 *
 * Regression guard for the finding: EmailRow's root was
 * `<article role="button" tabIndex={0}>` wrapping real buttons (the checkbox,
 * hover-bar actions, the … menu trigger, pin/star badges), so assistive tech
 * announced one button containing buttons.
 *
 * The row is a plain article now — articles may contain interactive
 * descendants — while keeping its tab stop and Enter/Space handling, so
 * keyboard users lose nothing. EmailRow is not exported from page.tsx, so
 * the contract is pinned at the source level.
 */

const PAGE = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

const articleOpens = PAGE.match(/<article/g) ?? [];
if (articleOpens.length !== 1) {
  throw new Error(`expected exactly one <article in page.tsx, found ${articleOpens.length}`);
}

// The article's own props: everything up to the first behaviour handler.
const articleHead = PAGE.slice(PAGE.indexOf('<article'), PAGE.indexOf('onMouseEnter'));
// The whole row: article open tag through its close tag.
const articleBody = PAGE.slice(PAGE.indexOf('<article'), PAGE.indexOf('</article>'));

describe('EmailRow has no nested-interactives violation', () => {
  it('renders the row as a plain article, not a button', () => {
    expect(articleHead).toContain('<article');
    expect(articleHead).not.toMatch(/role\s*=\s*["']button["']/);
  });

  it('keeps the row keyboard-reachable (tab stop)', () => {
    expect(articleHead).toContain('tabIndex={0}');
  });

  it('keeps row-level Enter/Space handling so keyboard users can still open the conversation', () => {
    expect(articleHead).toContain('onKeyDown');
    expect(articleHead).toMatch(/event\.key === 'Enter'/);
    expect(articleHead).toMatch(/event\.key === ' '/);
    expect(articleHead).toContain('onOpen()');
  });

  it('keeps an accessible name on the row', () => {
    expect(articleHead).toContain('aria-label=');
  });

  it('still contains real interactives inside the plain article (the pattern this guards)', () => {
    // If the row ever stops containing buttons, the first assertion above
    // becomes vacuous — this keeps the guard meaningful.
    expect(articleBody).toContain('<button');
    expect(articleBody).toContain('type="checkbox"');
  });
});
