// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { inboxSelectTarget } from '../lib/inbox-nav';

/**
 * CUST-P1-4 regression: pressing `x` (select) in a thread view
 * (/thread/[id], /people/[personId]) pushed a bare `/?selected=<threadId>`.
 * RootPage renders PeopleHome unless `?view=inbox` is present, and `?selected=`
 * is only consumed inside InboxPageContent — so the shortcut landed on the
 * People home where the param was silently dropped and the promised
 * "inbox pre-selects the right row" never happened.
 *
 * The two pages delegate to inboxSelectTarget, a 4600-line page.tsx component
 * cannot be mounted cheaply, so the regression is pinned at the pure helper:
 * the target must always carry view=inbox alongside selected.
 */
describe('inboxSelectTarget (CUST-P1-4)', () => {
  it('builds the classic-inbox target with the selected thread id', () => {
    expect(inboxSelectTarget('thread-123')).toBe('/?view=inbox&selected=thread-123');
  });

  it('carries view=inbox so RootPage renders InboxPageContent, not PeopleHome', () => {
    const params = new URL(inboxSelectTarget('thread-123'), 'https://quantmail.in').searchParams;
    expect(params.get('view')).toBe('inbox');
  });

  it('URL-encodes the thread id', () => {
    const target = inboxSelectTarget('thread with/special?chars');
    const params = new URL(target, 'https://quantmail.in').searchParams;
    // Round-trips through encoding exactly.
    expect(params.get('selected')).toBe('thread with/special?chars');
    expect(target).toContain('selected=thread%20with%2Fspecial%3Fchars');
  });

  it('never produces a bare ?selected= target that PeopleHome would drop', () => {
    for (const target of [inboxSelectTarget('a'), inboxSelectTarget('b-c_d'), inboxSelectTarget('')]) {
      const params = new URL(target, 'https://quantmail.in').searchParams;
      expect(params.get('view')).toBe('inbox');
      expect(params.get('selected')).not.toBeNull();
    }
  });
});

/**
 * Lens carry (spam-lens-select-lens P1): the inbox pre-selects only rows in
 * the current lens corpus, so the `x` (select) shortcut from a
 * `?lens=spam` person thread must carry `lens=spam` into the target —
 * without it the inbox lands with no row pre-selected and the thread context
 * silently dropped (same lens-loss class as the fixed spam-lens dead-end
 * #917). `all`/falsy lenses stay bare so the default target is unchanged.
 */
describe('inboxSelectTarget lens carry (spam-lens-select-lens)', () => {
  it('carries lens=spam between view and selected', () => {
    expect(inboxSelectTarget('thread-123', 'spam')).toBe('/?view=inbox&lens=spam&selected=thread-123');
  });

  it('keeps view=inbox load-bearing and round-trips both params', () => {
    const target = inboxSelectTarget('thread-123', 'spam');
    const params = new URL(target, 'https://quantmail.in').searchParams;
    expect(params.get('view')).toBe('inbox');
    expect(params.get('lens')).toBe('spam');
    expect(params.get('selected')).toBe('thread-123');
  });

  it('drops "all" and falsy lenses so the default target stays bare', () => {
    expect(inboxSelectTarget('thread-123', 'all')).toBe('/?view=inbox&selected=thread-123');
    expect(inboxSelectTarget('thread-123', '')).toBe('/?view=inbox&selected=thread-123');
    expect(inboxSelectTarget('thread-123', undefined)).toBe('/?view=inbox&selected=thread-123');
    // No stray empty lens= param anywhere.
    for (const target of [inboxSelectTarget('t', 'all'), inboxSelectTarget('t', '')]) {
      expect(new URL(target, 'https://quantmail.in').searchParams.get('lens')).toBeNull();
    }
  });

  it('URL-encodes the lens alongside the thread id', () => {
    const target = inboxSelectTarget('thread 1', 'my lens');
    expect(target).toContain('lens=my%20lens');
    expect(target).toContain('selected=thread%201');
    const params = new URL(target, 'https://quantmail.in').searchParams;
    expect(params.get('lens')).toBe('my lens');
    expect(params.get('selected')).toBe('thread 1');
  });
});
