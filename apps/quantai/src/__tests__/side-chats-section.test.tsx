// ============================================================================
// QuantAI — SideChatsSection Component Tests (Q10: Muse side-chats parity)
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SideChatsSection } from '../components/chat/SideChatsSection';
import type { ChatConversation } from '../hooks/useAIChat';

function conv(id: string, title: string, topic?: string | null): ChatConversation {
  return {
    id,
    title,
    messages: [],
    model: 'gpt-4o',
    topic: topic ?? null,
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z',
  };
}

function baseProps(overrides: Partial<Parameters<typeof SideChatsSection>[0]> = {}) {
  return {
    conversations: [] as ChatConversation[],
    activeConversationId: null as string | null,
    onSelect: vi.fn(),
    onMoveToTopic: vi.fn().mockResolvedValue(true),
    onNewSideChat: vi.fn(),
    ...overrides,
  };
}

describe('SideChatsSection', () => {
  it('renders the honest empty state when there are no topics', () => {
    const html = renderToStaticMarkup(
      React.createElement(SideChatsSection, baseProps()),
    );
    expect(html).toContain('Start a side chat');
    expect(html).toContain(
      'Side chats are an optional way to organize your conversations by topic.',
    );
    expect(html).toContain('New side chat');
    // No fabricated topics.
    expect(html).not.toContain('🏷️');
  });

  it('groups conversations under their real topic labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SideChatsSection,
        baseProps({
          conversations: [
            conv('1', 'Q3 planning', 'work'),
            conv('2', 'Roadmap', 'work'),
            conv('3', 'Flight options', 'travel'),
            conv('4', 'Untagged chat'),
          ],
        }),
      ),
    );
    expect(html).toContain('work');
    expect(html).toContain('travel');
    expect(html).toContain('Q3 planning');
    expect(html).toContain('Flight options');
    // Topic badge is shown on tagged rows.
    expect(html).toContain('Topic: work');
  });

  it('mentions main chats in the empty state when untagged chats exist', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SideChatsSection,
        baseProps({ conversations: [conv('1', 'Hello'), conv('2', 'World')] }),
      ),
    );
    expect(html).toContain('You have 2 main chats');
  });

  it('highlights the active conversation', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SideChatsSection,
        baseProps({
          conversations: [conv('1', 'Active one', 'work')],
          activeConversationId: '1',
        }),
      ),
    );
    expect(html).toContain('aria-current="page"');
  });

  it('shows a topic badge next to tagged conversations', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SideChatsSection,
        baseProps({ conversations: [conv('1', 'Tagged', 'research')] }),
      ),
    );
    expect(html).toContain('research');
  });

  it('renders the section with an accessible label', () => {
    const html = renderToStaticMarkup(
      React.createElement(SideChatsSection, baseProps()),
    );
    expect(html).toContain('aria-label="Side chats"');
  });
});
