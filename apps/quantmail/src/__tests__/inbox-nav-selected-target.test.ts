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
