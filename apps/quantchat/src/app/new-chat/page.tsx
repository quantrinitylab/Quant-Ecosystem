'use client';

// ============================================================================
// QuantChat — New chat / contact discovery page (/new-chat)
// ============================================================================
//
// Fixes the "no way to start new chats" gap: a searchable contact directory
// backed by GET /users/search. Tapping a contact creates a direct
// conversation via POST /conversations and routes into /chat/[id].

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, TopBar, BottomNav, useAuth } from '@quant/shared-ui';
import { LoadingState, ErrorState } from '@quant/shared-ui';
import { apiClient } from '../../services/api-client';
import type { ChatContact } from '../../types';
import { navItems, routes } from '../../lib/navigation';

function ContactAvatar({ contact }: { contact: ChatContact }) {
  if (contact.avatarUrl) {
    return (
      <img
        src={contact.avatarUrl}
        alt=""
        className="w-12 h-12 rounded-full object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="w-12 h-12 rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold text-lg"
    >
      {(contact.displayName || contact.username || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export default function NewChatPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Group creation (WhatsApp standard): pick members, name the group, create.
  const [groupMode, setGroupMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createGroup = async () => {
    if (isCreatingGroup || selectedIds.size === 0 || !groupName.trim()) return;
    setIsCreatingGroup(true);
    setError(null);
    try {
      const res = await apiClient.createConversation(
        [...selectedIds],
        groupName.trim(),
        'group',
      );
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Could not create group');
      }
      const raw = res.data as unknown;
      const conversationId =
        typeof raw === 'object' && raw !== null && 'id' in raw
          ? String((raw as { id: unknown }).id)
          : null;
      if (!conversationId) throw new Error('Could not create group');
      router.push(`/chat/${conversationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create group');
      setIsCreatingGroup(false);
    }
  };

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setContacts([]);
      setSearched(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const res = await apiClient.searchUsers(trimmed);
      if (!res.success) {
        throw new Error(res.error?.message || 'Search failed');
      }
      const raw = res.data;
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { data?: ChatContact[] }).data)
          ? (raw as { data: ChatContact[] }).data
          : [];
      // Never list yourself even if the backend slips.
      setContacts(list.filter((c) => c.id !== user?.id));
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, [user?.id]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(value), 350);
  };

  const startChat = async (contact: ChatContact) => {
    if (isCreating) return;
    setIsCreating(contact.id);
    setError(null);
    try {
      const res = await apiClient.createConversation([contact.id], undefined, 'direct');
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Could not start chat');
      }
      const raw = res.data as unknown;
      const conversationId =
        typeof raw === 'object' && raw !== null && 'id' in raw
          ? String((raw as { id: unknown }).id)
          : null;
      if (!conversationId) throw new Error('Could not start chat');
      router.push(`/chat/${conversationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start chat');
      setIsCreating(null);
    }
  };

  return (
    <AppShell
      topBar={
        <TopBar
          title={groupMode ? 'New group' : 'New chat'}
          subtitle={groupMode ? 'Add members, then name your group' : 'Find people to message'}
          onBack={() => (groupMode ? setGroupMode(false) : router.back())}
        />
      }
    >
      <div className="flex flex-col h-full pb-16">
        {/* New group entry point */}
        {!groupMode && (
          <button
            onClick={() => setGroupMode(true)}
            className="mx-4 mt-3 flex items-center gap-3 px-3 py-3 rounded-2xl bg-indigo-50 text-left active:bg-indigo-100 transition-colors"
            aria-label="Create a new group chat"
          >
            <span
              aria-hidden
              className="w-12 h-12 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xl font-semibold"
            >
              👥
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-[var(--quant-foreground)]">
                New group
              </span>
              <span className="block text-sm text-gray-500">
                Chat with several people at once
              </span>
            </span>
          </button>
        )}

        {/* Group name field (group mode) */}
        {groupMode && (
          <div className="px-4 pt-3">
            <label htmlFor="new-group-name" className="sr-only">
              Group name
            </label>
            <input
              id="new-group-name"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              maxLength={100}
              className="w-full h-11 px-4 rounded-full bg-gray-100 text-[var(--quant-foreground)] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {selectedIds.size > 0 && (
              <p className="mt-2 text-sm text-gray-500" aria-live="polite">
                {selectedIds.size} member{selectedIds.size === 1 ? '' : 's'} selected
              </p>
            )}
          </div>
        )}

        {/* Search field */}
        <div className="px-4 pt-3 pb-2 sticky top-0 bg-white z-10">
          <label htmlFor="new-chat-search" className="sr-only">
            Search people by name or username
          </label>
          <div className="relative">
            <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              🔍
            </span>
            <input
              id="new-chat-search"
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search name or username…"
              autoComplete="off"
              className="w-full h-11 pl-10 pr-4 rounded-full bg-gray-100 text-[var(--quant-foreground)] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2" role="list" aria-label="People">
          {isSearching && (
            <LoadingState variant="skeleton" text="Searching people…" />
          )}

          {!isSearching && error && (
            <ErrorState message={error} onRetry={() => void runSearch(query)} />
          )}

          {!isSearching && !error && !searched && (
            <div className="px-4 py-10 text-center text-gray-500">
              <p className="text-4xl mb-3" aria-hidden>
                💬
              </p>
              <p className="font-medium text-[var(--quant-foreground)]">Find people to chat with</p>
              <p className="text-sm mt-1">
                Type a name or username above to discover contacts.
              </p>
            </div>
          )}

          {!isSearching && !error && searched && contacts.length === 0 && (
            <div className="px-4 py-10 text-center text-gray-500">
              <p className="font-medium text-[var(--quant-foreground)]">No people found</p>
              <p className="text-sm mt-1">
                Try a different name or username.
              </p>
            </div>
          )}

          {!isSearching &&
            contacts.map((contact) => {
              const selected = selectedIds.has(contact.id);
              return (
                <button
                  key={contact.id}
                  role="listitem"
                  onClick={() =>
                    groupMode ? toggleSelect(contact.id) : void startChat(contact)
                  }
                  disabled={isCreating !== null}
                  aria-pressed={groupMode ? selected : undefined}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-100 active:bg-gray-200 text-left transition-colors disabled:opacity-60"
                  aria-label={
                    groupMode
                      ? `${selected ? 'Remove' : 'Add'} ${contact.displayName} (@${contact.username}) ${selected ? 'from' : 'to'} group`
                      : `Start chat with ${contact.displayName} (@${contact.username})`
                  }
                >
                  <ContactAvatar contact={contact} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-[var(--quant-foreground)] truncate">
                      {contact.displayName}
                    </span>
                    <span className="block text-sm text-gray-500 truncate">
                      @{contact.username}
                      {contact.bio ? ` · ${contact.bio}` : ''}
                    </span>
                  </span>
                  {groupMode ? (
                    <span
                      aria-hidden
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm ${
                        selected
                          ? 'bg-indigo-500 border-indigo-500 text-white'
                          : 'border-gray-300 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  ) : isCreating === contact.id ? (
                    <span className="text-sm text-gray-500" aria-live="polite">
                      Starting…
                    </span>
                  ) : (
                    <span aria-hidden className="text-indigo-600 text-xl">
                      💬
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        {/* Create group action (group mode) */}
        {groupMode && (
          <div className="px-4 pb-2 pt-1 sticky bottom-16">
            <button
              onClick={() => void createGroup()}
              disabled={
                isCreatingGroup || selectedIds.size === 0 || !groupName.trim()
              }
              className="w-full h-12 rounded-full bg-indigo-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed active:bg-indigo-600 transition-colors"
            >
              {isCreatingGroup
                ? 'Creating group…'
                : `Create group${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </button>
            {selectedIds.size === 0 && (
              <p className="mt-1 text-center text-xs text-gray-500">
                Search and select at least one member above
              </p>
            )}
          </div>
        )}
      </div>

      <BottomNav
        items={navItems}
        activeId="chats"
        onChange={(id: string) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />
    </AppShell>
  );
}
