import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { threadMessageIds, type ConversationThread } from '../lib/threading';

const pagePath = resolve(__dirname, '../app/page.tsx');
const pageSource = readFileSync(pagePath, 'utf8');

describe('inbox-row-flag-indicator and page contracts (AC-17, AC-20, AC-22, AC-23, AC-39)', () => {
  it('AC-17: renders flag indicator right after Pinned badge as non-interactive role="img" with aria-label="Flagged"', () => {
    // The old "documented as not implemented" comment must be gone
    expect(pageSource).not.toContain('documented as not implemented');

    // Indicator exists and is conditioned on thread.isFlagged
    const flagIndicatorRegex =
      /\{thread\.isFlagged\s*&&\s*\(\s*<span\s+role="img"\s+aria-label="Flagged"\s+title="Flagged"[\s\S]*?<MailIcon\s+name="flag"\s+filled/m;
    expect(pageSource).toMatch(flagIndicatorRegex);

    // Flag indicator must not contain button elements
    const flagSection = pageSource.match(/\{thread\.isFlagged[\s\S]*?<\/span>\s*\)\}/)?.[0];
    expect(flagSection).toBeTruthy();
    expect(flagSection).not.toContain('<button');
  });

  it('AC-20: page.tsx calls allConversationsFlagged(displayThreads, selectedIds) and passes !allSelectedFlagged to batchSetFlagged', () => {
    expect(pageSource).toContain('allConversationsFlagged(displayThreads, selectedIds)');
    expect(pageSource).toContain('batchSetFlagged(Array.from(selectedIds), !allSelectedFlagged)');
  });

  it('AC-22: INBOX_FILTERS contains the flagged entry after attachment and starred is unchanged', () => {
    const filtersMatch = pageSource.match(/const INBOX_FILTERS:[^=]*=\s*\[([\s\S]*?)\];/);
    expect(filtersMatch).not.toBeNull();
    const filtersBody = filtersMatch![1];

    expect(filtersBody).toContain("{ key: 'starred', label: 'Pinned' }");
    expect(filtersBody).toContain("{ key: 'attachment', label: 'Has attachment' }");
    expect(filtersBody).toContain("{ key: 'flagged', label: 'Flagged' }");

    const starredIdx = filtersBody.indexOf("'starred'");
    const attachIdx = filtersBody.indexOf("'attachment'");
    const flaggedIdx = filtersBody.indexOf("'flagged'");
    expect(starredIdx).toBeLessThan(attachIdx);
    expect(attachIdx).toBeLessThan(flaggedIdx);
  });

  it('AC-23: does not touch pin sort comparator, pinnedCount or showPinnedNotice', () => {
    expect(pageSource).toContain('const aPinned = (a as { isPinned?: boolean }).isPinned === true;');
    expect(pageSource).toContain('const bPinned = (b as { isPinned?: boolean }).isPinned === true;');
    expect(pageSource).toContain('const pinnedCount = useMemo(');
    expect(pageSource).toContain('const showPinnedNotice =');
  });

  it('AC-39: two EmailRow call sites and batchSetFlagged use threadMessageIds, not conversationIds', () => {
    // Check batchSetFlagged definition
    const batchFlagMatch = pageSource.match(
      /const batchSetFlagged = useCallback\([\s\S]*?\[mutations, displayThreads\],?\s*\);/,
    );
    expect(batchFlagMatch).not.toBeNull();
    expect(batchFlagMatch![0]).toContain('threadMessageIds(t)');
    expect(batchFlagMatch![0]).not.toContain('conversationIds');

    // Check two MemoizedEmailRow call sites
    const rowCallMatches = [
      ...pageSource.matchAll(
        /onToggleFlag=\{\(event\)\s*=>\s*void setThreadFlagged\(event,\s*([^,]+),/g,
      ),
    ];
    expect(rowCallMatches).toHaveLength(2);
    for (const match of rowCallMatches) {
      expect(match[1].trim()).toBe('threadMessageIds(thread)');
    }
  });

  it('AC-39 unit test: threadMessageIds expands collapsedIds and reaches older flagged messages', () => {
    const thread = {
      id: 'm-newest',
      messages: [
        { id: 'm-older', isFlagged: true, collapsedIds: ['m-older-dup'] },
        { id: 'm-newest', isFlagged: false },
      ],
    } as unknown as ConversationThread;

    const ids = threadMessageIds(thread);
    expect(ids).toEqual(['m-older', 'm-older-dup', 'm-newest']);
  });
});
