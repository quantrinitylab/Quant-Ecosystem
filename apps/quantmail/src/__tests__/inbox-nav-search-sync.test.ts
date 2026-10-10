// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { inboxLensTarget, inboxResetTarget, syncSearchParam } from '../lib/inbox-nav';

/**
 * CUST-P1-6 regression: switching the inbox lens dropped `q` from the URL but
 * left the search state intact, so the URL said no-search while the searchbox
 * still showed the old text and the panel stayed in search mode ("No messages
 * matched …"). The contract now: a lens switch (or a view reset) starts a new
 * query context — the navigation target never carries `q` and the search state
 * is cleared alongside; clearing the searchbox drops `q` from the URL.
 *
 * `selectLens` itself lives in a 4000-line component that cannot be mounted
 * cheaply, so the regression is pinned at the pure helpers it now delegates
 * to (URL building + `q` sync), which is the whole decision surface of the
 * bug.
 */
describe('inboxLensTarget', () => {
  it('drops q for a non-default lens', () => {
    const target = inboxLensTarget('unread');
    expect(target).toBe('/?view=inbox&lens=unread');
    expect(new URL(target, 'https://quantmail.in').searchParams.get('q')).toBeNull();
  });

  it('the all lens lands on the bare classic-inbox URL', () => {
    expect(inboxLensTarget('all')).toBe('/?view=inbox');
  });

  it.each(['unread', 'contacts', 'spam', 'primary', 'groups', 'snoozed'])(
    'never carries q for lens "%s"',
    (lens) => {
      const params = new URL(inboxLensTarget(lens), 'https://quantmail.in').searchParams;
      expect(params.get('q')).toBeNull();
      expect(params.get('view')).toBe('inbox');
    },
  );
});

describe('inboxResetTarget', () => {
  it('drops q — the reset starts a fresh query context', () => {
    const target = inboxResetTarget();
    expect(target).toBe('/?view=inbox');
    expect(new URL(target, 'https://quantmail.in').searchParams.get('q')).toBeNull();
  });
});

describe('syncSearchParam', () => {
  it('sets q for a non-empty query', () => {
    expect(syncSearchParam('https://quantmail.in/?view=inbox', 'test')).toBe(
      '/?view=inbox&q=test',
    );
  });

  it('drops q when the searchbox is cleared mid-search', () => {
    expect(syncSearchParam('https://quantmail.in/?view=inbox&q=test', '')).toBe(
      '/?view=inbox',
    );
  });

  it('keeps the other params (lens) while dropping q', () => {
    expect(syncSearchParam('https://quantmail.in/?view=inbox&lens=unread&q=test', '')).toBe(
      '/?view=inbox&lens=unread',
    );
  });

  it('updates q when the query changes', () => {
    expect(syncSearchParam('https://quantmail.in/?view=inbox&q=test', 'hello')).toBe(
      '/?view=inbox&q=hello',
    );
  });

  it('returns null when the URL already matches — no navigation needed', () => {
    expect(syncSearchParam('https://quantmail.in/?view=inbox&q=test', 'test')).toBeNull();
    expect(syncSearchParam('https://quantmail.in/?view=inbox', '')).toBeNull();
    // trimmed query matches the stored param
    expect(syncSearchParam('https://quantmail.in/?view=inbox&q=test', '  test  ')).toBeNull();
  });
});

describe('CUST-P1-6 search → lens-switch contract', () => {
  it('after the switch the cleared query leaves the q-less target alone', () => {
    // 1. the user searches "test": q lands in the URL
    let href = 'https://quantmail.in' + syncSearchParam('https://quantmail.in/?view=inbox', 'test');
    expect(href).toBe('https://quantmail.in/?view=inbox&q=test');

    // 2. the user clicks the Unread lens: selectLens clears the query and
    //    replaces with a target that carries no q
    const target = inboxLensTarget('unread');
    expect(new URL(target, 'https://quantmail.in').searchParams.get('q')).toBeNull();
    href = 'https://quantmail.in' + target;
    expect(href).toBe('https://quantmail.in/?view=inbox&lens=unread');

    // 3. the q-sync effect, running after the cleared query, must not
    //    navigate — the URL, the (emptied) searchbox and the panel agree
    expect(syncSearchParam(href, '')).toBeNull();
  });
});
