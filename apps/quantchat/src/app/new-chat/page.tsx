'use client';

// ============================================================================
// QuantChat — New chat / contact discovery page (/new-chat)
// ============================================================================
//
// Fixes the "no way to start new chats" gap: a searchable contact directory
// backed by GET /users/search. Tapping a contact creates a direct
// conversation via POST /conversations and routes into /chat/[id].

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, TopBar, BottomNav, useAuth } from '@quant/shared-ui';
import { LoadingState, ErrorState } from '@quant/shared-ui';
import { apiClient } from '../../services/api-client';
import { EmojiStatusBadge } from '../../components/EmojiStatusBadge';
import type { ChatContact } from '../../types';
import { navItems, routes } from '../../lib/navigation';

function ContactAvatar({
  contact,
  size = 'md',
}: {
  contact: ChatContact;
  size?: 'md' | 'sm';
}) {
  const sizeClass =
    size === 'sm' ? 'w-7 h-7 text-xs' : 'w-12 h-12 text-lg';
  if (contact.avatarUrl) {
    return (
      <img
        src={contact.avatarUrl}
        alt=""
        className={`${sizeClass} rounded-full object-cover`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${sizeClass} rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold`}
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
  // QC-F-397: people-search sequence guard — sirf sabse taaza runSearch
  // invocation hi state badlegi; purane jawab/error/finally chup-chaap
  // girenge (debounce in-flight requests ko NAHI rokta).
  const searchSeqRef = useRef(0);
  // QC-F-321: message-request state. When a direct create is refused with
  // MESSAGE_NOT_ALLOWED (the default 'friends' gate denying a stranger),
  // the honest next step is a request composer — the request is sent ONLY
  // when the user writes a first message and taps "Send request"; a 403
  // alone never creates one. ApiResponse.error.code survives to this page
  // (apiClient returns the backend envelope untouched), and startChat
  // checks it on the response BEFORE collapsing failures into a message.
  const [requestTarget, setRequestTarget] = useState<ChatContact | null>(null);
  const [requestText, setRequestText] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [sentRequests, setSentRequests] = useState<
    Map<string, 'PENDING' | 'ACCEPTED' | 'DECLINED'>
  >(new Map());

  // Sent-request states are informational only (badges + tap behaviour);
  // a failed load simply means no badges — search/create are unaffected.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.getMessageRequestsSent();
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setSentRequests(
            new Map(res.data.map((r) => [r.target.id, r.status] as const)),
          );
        }
      } catch {
        /* informational only — no badges on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group creation (WhatsApp standard): pick members, name the group, create.
  const [groupMode, setGroupMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // QC-F-448: chunav ke pal ka contact snapshot — chips-row isi se render
  // hoti hai taaki dusri khoj ke results aane par bhi pehle chune hue log
  // dikhte rahein. Invariant: is Map ki keys hamesha selectedIds ke barabar.
  const [selectedContacts, setSelectedContacts] = useState<
    Map<string, ChatContact>
  >(new Map());
  const [groupName, setGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const toggleSelect = (contact: ChatContact) => {
    const id = contact.id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // QC-F-448: Set aur snapshot Map ek hi handler me badalte hain — row
    // toggle aur chip-remove kabhi alag NAHI ho sakte.
    setSelectedContacts((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, contact);
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

  // QC-F-397: page chhodne par pending debounce radd + chalti search ko
  // invalidate — unmount ke baad koi search fire/setState NAHI karegi.
  useEffect(() => {
    return () => {
      searchSeqRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    // QC-F-397: har invocation (khaali-query samet) sequence bump karegi —
    // box saaf karna bhi hawa me udti search ko invalidate kar deta hai.
    const seq = ++searchSeqRef.current;
    const isLatest = () => seq === searchSeqRef.current;
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
      if (!isLatest()) return;
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
      if (!isLatest()) return;
      // QC-F-397 (C1): taaza search fail ho to purani list saaf — ErrorState
      // ke neeche kisi aur query ke tappable log NAHI bachenge.
      setContacts([]);
      setError(e instanceof Error ? e.message : 'Search failed');
      setSearched(true);
    } finally {
      if (isLatest()) setIsSearching(false);
    }
  }, [user?.id]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(value), 350);
  };

  const startChat = async (contact: ChatContact) => {
    if (isCreating) return;
    // QC-F-321: a pair with a request already in flight (or terminally
    // declined) never re-attempts a direct create — the honest state is
    // shown instead.
    const sentState = sentRequests.get(contact.id);
    if (sentState === 'PENDING') {
      setRequestNotice(
        `Request pending — you've already sent ${contact.displayName} a message request.`,
      );
      return;
    }
    if (sentState === 'DECLINED') {
      setRequestNotice(
        `${contact.displayName} declined an earlier request, so a new one can't be sent.`,
      );
      return;
    }
    setIsCreating(contact.id);
    setError(null);
    setRequestNotice(null);
    try {
      const res = await apiClient.createConversation([contact.id], undefined, 'direct');
      if (!res.success || !res.data) {
        // QC-F-321: the gate's refusal is the request composer's cue —
        // checked on the response envelope, where the code actually is.
        if (res.error?.code === 'MESSAGE_NOT_ALLOWED') {
          setRequestTarget(contact);
          setRequestText('');
          setRequestError(null);
          setIsCreating(null);
          return;
        }
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

  // QC-F-321: send the request from the composer. Nothing is sent until
  // this runs — opening the composer (on the 403) creates nothing.
  const sendRequest = async () => {
    if (!requestTarget || isSendingRequest) return;
    const contact = requestTarget;
    const text = requestText.trim();
    if (!text) return;
    setIsSendingRequest(true);
    setRequestError(null);
    try {
      const res = await apiClient.sendMessageRequest(contact.id, text);
      if (res.success) {
        setSentRequests((prev) => new Map(prev).set(contact.id, 'PENDING'));
        setRequestTarget(null);
        setRequestText('');
        setRequestNotice(
          `Request sent to ${contact.displayName} — if they accept, your message will start the chat.`,
        );
        return;
      }
      if (res.error?.code === 'MESSAGE_REQUEST_DECLINED') {
        setSentRequests((prev) => new Map(prev).set(contact.id, 'DECLINED'));
        setRequestTarget(null);
        setRequestNotice(
          `${contact.displayName} declined an earlier request, so a new one can't be sent.`,
        );
        return;
      }
      if (res.error?.code === 'MESSAGE_REQUEST_NOT_NEEDED') {
        // The pair became messageable between the 403 and now (e.g. they
        // accepted or added us): retry the direct create exactly once.
        setRequestTarget(null);
        void startChat(contact);
        return;
      }
      setRequestError(res.error?.message || 'Could not send request');
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : 'Could not send request');
    } finally {
      setIsSendingRequest(false);
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

        {/* QC-F-448: chune hue members ki barkarar chips-row — snapshot
            Map se render hoti hai, isiliye nayi khoj / search-fail / khaali
            query par bhi chunav dikhta rehta hai aur yahin se hataya bhi
            ja sakta hai. */}
        {groupMode && selectedIds.size > 0 && (
          <div
            data-testid="selected-members"
            role="list"
            aria-label="Selected members"
            className="flex flex-wrap gap-2 px-4 py-2"
          >
            {[...selectedContacts.values()].map((contact) => (
              <span
                key={contact.id}
                role="listitem"
                data-testid="selected-member-chip"
                data-user-id={contact.id}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-50 py-1 pl-1 pr-2"
              >
                <ContactAvatar contact={contact} size="sm" />
                <span className="truncate max-w-[10rem] text-sm font-medium text-[var(--quant-foreground)]">
                  {contact.displayName}
                </span>
                <span className="text-xs text-gray-500">@{contact.username}</span>
                <button
                  type="button"
                  data-testid="selected-member-remove"
                  aria-label={`Remove ${contact.displayName} (@${contact.username}) from group`}
                  onClick={() => toggleSelect(contact)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-indigo-100"
                >
                  <span aria-hidden>✕</span>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* QC-F-321: honest request-state notice (sent / pending / declined) */}
        {!groupMode && requestNotice && (
          <div className="px-4 py-2" role="status">
            <p className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
              {requestNotice}
            </p>
          </div>
        )}

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
                    groupMode ? toggleSelect(contact) : void startChat(contact)
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
                    <span className="flex items-center gap-1.5 font-medium text-[var(--quant-foreground)]">
                      <span className="truncate">{contact.displayName}</span>
                      <EmojiStatusBadge status={contact.emojiStatus ?? null} size={14} />
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
                  ) : sentRequests.get(contact.id) === 'PENDING' ? (
                    <span className="text-xs font-medium text-indigo-600">
                      Request pending
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

        {/* QC-F-321: message-request composer (opens only on the gate's
            MESSAGE_NOT_ALLOWED refusal; sending is the user's act) */}
        {!groupMode && requestTarget && (
          <div
            className="border-t border-gray-100 px-4 py-3"
            role="region"
            aria-label={`Message request for ${requestTarget.displayName}`}
          >
            <p className="font-medium text-[var(--quant-foreground)]">
              You can&rsquo;t message {requestTarget.displayName} directly yet.
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Send a message request — if they accept, your message starts the chat.
            </p>
            <label htmlFor="message-request-text" className="sr-only">
              Your first message
            </label>
            <textarea
              id="message-request-text"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Introduce yourself…"
              className="mt-2 w-full rounded-2xl bg-gray-100 px-4 py-2.5 text-[var(--quant-foreground)] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {requestError && (
              <p role="alert" className="mt-1 text-sm text-red-600">
                {requestError}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void sendRequest()}
                disabled={!requestText.trim() || isSendingRequest}
                className="h-10 rounded-full bg-indigo-500 px-5 font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed active:bg-indigo-600 transition-colors"
              >
                {isSendingRequest ? 'Sending…' : 'Send request'}
              </button>
              <button
                onClick={() => setRequestTarget(null)}
                disabled={isSendingRequest}
                className="h-10 rounded-full bg-gray-100 px-5 font-medium text-gray-700 disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
