'use client';

// ============================================================================
// QuantAI — SideChatsSection (Muse screenshot #4 parity)
// Topic-organized conversations. "Side chats are an optional way to organize
// your conversations by topic."
//
// Data contract:
//   - `conversations` carry `topic?: string | null` (null = main chat).
//   - Topics come from real user data only — no fabricated topics.
//   - Empty state is shown when the user has no topics yet.
// ============================================================================

import React, { useMemo, useState } from 'react';
import type { ChatConversation } from '../../hooks/useAIChat';

export interface SideChatsSectionProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  /** Returns true on success; the hook rolls back local state on failure. */
  onMoveToTopic: (id: string, topic: string | null) => Promise<boolean>;
  /** Create a new conversation tagged with the given topic. */
  onNewSideChat: (topic: string) => void;
  className?: string;
}

interface TopicGroup {
  topic: string;
  items: ChatConversation[];
}

const UNTAGGED = '__main__';

function groupByTopic(conversations: ChatConversation[]): {
  mainChats: ChatConversation[];
  topics: TopicGroup[];
} {
  const map = new Map<string, ChatConversation[]>();
  const mainChats: ChatConversation[] = [];
  for (const c of conversations) {
    const t = c.topic && c.topic.trim().length > 0 ? c.topic.trim() : null;
    if (!t) {
      mainChats.push(c);
    } else if (!map.has(t)) {
      map.set(t, [c]);
    } else {
      map.get(t)!.push(c);
    }
  }
  const topics: TopicGroup[] = [...map.entries()]
    .map(([topic, items]) => ({ topic, items }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
  return { mainChats, topics };
}

function MoveToTopicMenu({
  conversation,
  topics,
  onMove,
  onClose,
}: {
  conversation: ChatConversation;
  topics: TopicGroup[];
  onMove: (topic: string | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (topic: string | null) => {
    setSaving(true);
    try {
      await onMove(topic);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div
      className="absolute right-0 top-8 z-30 w-56 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-xl p-2"
      role="menu"
      aria-label={`Move "${conversation.title}" to a topic`}
    >
      <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-[var(--foreground-secondary)]">
        Move to topic
      </p>
      <div className="max-h-40 overflow-y-auto">
        {topics.map((g) => (
          <button
            key={g.topic}
            type="button"
            disabled={saving}
            onClick={() => void submit(g.topic)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] disabled:opacity-50"
            role="menuitem"
          >
            <span aria-hidden>🏷️</span>
            <span className="truncate">{g.topic}</span>
            {conversation.topic === g.topic && (
              <span className="ml-auto text-emerald-500" aria-label="current topic">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <form
        className="mt-1 flex gap-1 border-t border-[var(--quant-border)] pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void submit(draft.trim());
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New topic…"
          maxLength={100}
          disabled={saving}
          className="min-w-0 flex-1 rounded-lg border border-[var(--quant-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
          aria-label="New topic name"
        />
        <button
          type="submit"
          disabled={saving || !draft.trim()}
          className="rounded-lg bg-[var(--quant-accent)] px-2.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {conversation.topic && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(null)}
          className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          role="menuitem"
        >
          Remove from topic
        </button>
      )}
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  topics,
  onSelect,
  onMoveToTopic,
}: {
  conversation: ChatConversation;
  active: boolean;
  topics: TopicGroup[];
  onSelect: (id: string) => void;
  onMoveToTopic: (id: string, topic: string | null) => Promise<boolean>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <div
        className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          active
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
            : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(conversation.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-current={active ? 'page' : undefined}
        >
          <span aria-hidden className="shrink-0">
            💬
          </span>
          <span className="truncate">{conversation.title || 'New Chat'}</span>
        </button>
        {conversation.topic && (
          <span
            className="max-w-[90px] shrink-0 truncate rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300"
            title={`Topic: ${conversation.topic}`}
          >
            {conversation.topic}
          </span>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="shrink-0 rounded p-0.5 text-[var(--foreground-secondary)] opacity-0 hover:bg-[var(--quant-surface-hover)] focus:opacity-100 group-hover:opacity-100"
          aria-label={`Move "${conversation.title || 'New Chat'}" to a topic`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
      </div>
      {menuOpen && (
        <MoveToTopicMenu
          conversation={conversation}
          topics={topics}
          onMove={(topic) => onMoveToTopic(conversation.id, topic)}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

export const SideChatsSection: React.FC<SideChatsSectionProps> = ({
  conversations,
  activeConversationId,
  onSelect,
  onMoveToTopic,
  onNewSideChat,
  className = '',
}) => {
  const { mainChats, topics } = useMemo(() => groupByTopic(conversations), [conversations]);
  // Groups start expanded; the map only tracks groups the user collapsed.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));
  const isOpen = (key: string) => !collapsed[key];
  const [showAllMain, setShowAllMain] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newTopic, setNewTopic] = useState('');

  const startNaming = () => {
    setNaming(true);
    setNewTopic('');
  };

  const submitNew = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = newTopic.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!t) return;
    setNaming(false);
    setNewTopic('');
    onNewSideChat(t);
  };

  const renderGroup = (key: string, label: string, icon: string, items: ChatConversation[]) => (
    <div key={key} className="mb-1">
      <button
        type="button"
        onClick={() => toggle(key)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]"
        aria-expanded={isOpen(key)}
      >
        <span aria-hidden>{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        <span className="rounded-full bg-[var(--quant-surface-hover)] px-1.5 py-0.5 text-[10px] font-medium">
          {items.length}
        </span>
        <span aria-hidden className="text-[10px]">
          {isOpen(key) ? '▾' : '▸'}
        </span>
      </button>
      {isOpen(key) && (
        <div className="mt-0.5 space-y-0.5 pl-1">
          {items.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={activeConversationId === c.id}
              topics={topics}
              onSelect={onSelect}
              onMoveToTopic={onMoveToTopic}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className={className} aria-label="Side chats">
      <div className="mb-2 flex items-center justify-between px-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Side chats</h3>
        {!naming && (
          <button
            type="button"
            onClick={startNaming}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--quant-accent)] hover:bg-[var(--quant-surface-hover)]"
            aria-label="Start a new side chat"
          >
            ＋ New
          </button>
        )}
      </div>

      {naming && (
        <form
          onSubmit={submitNew}
          className="mb-2 flex gap-1 px-2"
        >
          <input
            autoFocus
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
            placeholder="Topic name…"
            maxLength={100}
            className="min-w-0 flex-1 rounded-lg border border-[var(--quant-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
            aria-label="New side chat topic name"
          />
          <button
            type="submit"
            disabled={!newTopic.trim()}
            className="rounded-lg bg-[var(--quant-accent)] px-2.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}

      {topics.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--quant-surface-hover)] text-xl"
            aria-hidden
          >
            💬
          </div>
          <p className="text-sm font-semibold text-[var(--foreground)]">Start a side chat</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-secondary)]">
            Side chats are an optional way to organize your conversations by topic.
          </p>
          <button
            type="button"
            onClick={startNaming}
            className="mt-3 rounded-xl bg-[var(--quant-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            New side chat
          </button>
          {mainChats.length > 0 && (
            <p className="mt-3 text-[11px] text-[var(--foreground-secondary)]">
              You have {mainChats.length} main chat{mainChats.length === 1 ? '' : 's'} — use ⋯ on
              any chat to move it into a topic.
            </p>
          )}
        </div>
      ) : (
        <div>
          {topics.map((g) => renderGroup(g.topic, g.topic, '🏷️', g.items))}
          {mainChats.length > 0 && (
            <div className="mt-2 border-t border-[var(--quant-border)] pt-2">
              {!showAllMain ? (
                <button
                  type="button"
                  onClick={() => setShowAllMain(true)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]"
                >
                  Show {mainChats.length} main chat{mainChats.length === 1 ? '' : 's'}…
                </button>
              ) : (
                renderGroup(UNTAGGED, 'Main chats', '🏠', mainChats)
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default SideChatsSection;
