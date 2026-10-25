import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QuantGitHeader } from '../components/QuantGitHeader';

// QM-FIX (fix/qm-quantgit-fake-copilot-sessions): the Quanty copilot session
// dropdown used to ship four hardcoded sessions presented as the user's real
// chat history — "Urgent GitHub parity & Notion AI overhaul", "Wave A Drive
// consolidation & 5 AI services", "LiveKit WebRTC gateway & proactive call
// alerts", "Yjs CRDT merge & real-time collaboration" — with invented counts
// and relative dates. They were removed (page.tsx now starts the session
// list empty; the header shows honest empty copy), and these tests pin that:
//   1. an empty session list renders the honest empty states, never the
//      fabricated titles;
//   2. a real, user-created session still renders (the list is not just
//      hard-empty — it reflects actual chats);
//   3. source regression: the fabricated titles are gone from page.tsx and
//      the session list still initialises empty.

vi.mock('@quant/shared-ui', () => ({
  BubbleAvatar: () => null,
}));

const FABRICATED_TITLES = [
  'Urgent GitHub parity',
  'Wave A Drive consolidation',
  'LiveKit WebRTC gateway',
  'Yjs CRDT merge',
];

function renderHeader(chatSessions: { id: string; title: string; date: string; count: number }[]) {
  return renderToStaticMarkup(
    <QuantGitHeader
      activeDeckTab="quanty"
      setActiveDeckTab={vi.fn()}
      selectedRepo={null}
      setSelectedRepo={vi.fn()}
      viewingFile={null}
      setViewingFile={vi.fn()}
      activeGitHubTab="code"
      setActiveGitHubTab={vi.fn()}
      currentUsername="testuser"
      isHistoryOpen
      setIsHistoryOpen={vi.fn()}
      chatSessions={chatSessions}
      setChatSessions={vi.fn()}
      activeSessionId=""
      setActiveSessionId={vi.fn()}
      pinnedSessionIds={[]}
      setPinnedSessionIds={vi.fn()}
      setChatMessages={vi.fn()}
      setModalState={vi.fn()}
      setIsPersonalizeOpen={vi.fn()}
      showToast={vi.fn()}
    />,
  );
}

describe('QuantGit copilot session history honesty (no fabricated sessions)', () => {
  it('empty session list renders honest empty states in the dropdown and drawer', () => {
    const html = renderHeader([]);
    // Dropdown label fallback when no session is active.
    expect(html).toContain('No chats yet');
    // History drawer empty state.
    expect(html).toContain('No conversations yet');
    expect(html).toContain('start a new chat to see it here');
  });

  it('empty session list never renders any of the four fabricated sessions', () => {
    const html = renderHeader([]);
    for (const title of FABRICATED_TITLES) {
      expect(html).not.toContain(title);
    }
  });

  it('a real user-created session still renders in the history drawer', () => {
    const html = renderHeader([
      { id: 'sess-real-1', title: 'My actual debug session', date: 'Just now', count: 3 },
    ]);
    expect(html).toContain('My actual debug session');
    expect(html).not.toContain('No conversations yet');
    for (const title of FABRICATED_TITLES) {
      expect(html).not.toContain(title);
    }
  });

  it('source regression: fabricated session titles are gone from page.tsx', () => {
    const src = readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf8');
    expect(src).toContain('useState<ChatSession[]>([])');
    for (const title of FABRICATED_TITLES) {
      expect(src).not.toContain(title);
    }
    // No fabricated session ids seeded anywhere in the page.
    expect(src).not.toContain('sess-1');
    expect(src).not.toContain('sess-2');
    expect(src).not.toContain('sess-3');
    expect(src).not.toContain('sess-4');
  });
});
