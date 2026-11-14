import { describe, it, expect } from 'vitest';
import { InboxCursorPager } from '../inbox-cursor-pager';
import type { Email } from '../../types';

function mockEmail(id: string, extra: Partial<Email> = {}): Email {
  return {
    id,
    subject: `Subject ${id}`,
    isFlagged: false,
    ...extra,
  } as unknown as Email;
}

describe('InboxCursorPager.patch (AC-38, MEDIUM 4)', () => {
  it('patching a row in the tail replaces it and reports true', () => {
    const pager = new InboxCursorPager();
    pager.extend([mockEmail('e1', { isFlagged: false }), mockEmail('e2', { isFlagged: false })], 'c1');

    const patchedMap = new Map<string, Email>([
      ['e2', mockEmail('e2', { isFlagged: true })],
    ]);

    const result = pager.patch(patchedMap);
    expect(result).toBe(true);
    expect(pager.tailEmails[1].isFlagged).toBe(true);
    expect(pager.tailEmails[0].isFlagged).toBe(false);
  });

  it('patching IDs not in the tail reports false and changes nothing', () => {
    const pager = new InboxCursorPager();
    pager.extend([mockEmail('e1', { isFlagged: false })], 'c1');

    const patchedMap = new Map<string, Email>([
      ['non-existent', mockEmail('non-existent', { isFlagged: true })],
    ]);

    const result = pager.patch(patchedMap);
    expect(result).toBe(false);
    expect(pager.tailEmails[0].isFlagged).toBe(false);
  });

  it('after reset nothing is patched', () => {
    const pager = new InboxCursorPager();
    pager.extend([mockEmail('e1', { isFlagged: false })], 'c1');
    pager.reset();

    const patchedMap = new Map<string, Email>([
      ['e1', mockEmail('e1', { isFlagged: true })],
    ]);

    const result = pager.patch(patchedMap);
    expect(result).toBe(false);
    expect(pager.tailEmails).toHaveLength(0);
  });
});
