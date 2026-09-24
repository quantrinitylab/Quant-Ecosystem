// ============================================================================
// QuantNeon - Direct Messages
// Instagram 98-Screen Parity (Task W39-G06)
// Real DM inbox wired to /dm backend, 24h Notes Tray with music badges,
// Primary / General / Requests folder tabs, and Spam requests filter.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageTransition } from '@quant/shared-ui';
import {
  apiClient,
  type DmConversationSummary,
  type DmMessage,
  type DmParticipant,
} from '../services/api-client';
import { NotesTray } from '../components/NotesTray';
import {
  type UserNote,
  type DmFolderTab,
  type DmRequestItem,
  type MusicTrackAttachment,
  upsertSelfNote,
  removeSelfNote,
  filterConversationsByTab,
  filterDmRequests,
  acceptDmRequest,
  dismissDmRequest,
  bulkDeleteRequests,
} from '../features/dm/notes-tray';

interface MessagesPageState {
  myId: string | null;
  myProfile: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  conversations: DmConversationSummary[];
  activeConversation: DmConversationSummary | null;
  messages: DmMessage[];
  inputText: string;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  sending: boolean;
  activeTab: DmFolderTab;
  requestsFilter: 'all' | 'spam';
  notes: UserNote[];
  requests: DmRequestItem[];
  generalConvIds: Set<string>;
  requestedConvIds: Set<string>;
}

const INITIAL_NOTES: UserNote[] = [
  {
    id: 'n-1',
    userId: 'u-1',
    username: 'alex_dev',
    displayName: 'Alex Developer',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
    noteText: 'Grinding on QuantMail v1.4 🚀',
    musicTrack: { id: 'm1', title: 'Starboy', artist: 'The Weeknd' },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isSelf: false,
  },
  {
    id: 'n-2',
    userId: 'u-2',
    username: 'sarah_travels',
    displayName: 'Sarah',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    noteText: 'Tokyo sunsets hit different 🗼✨',
    musicTrack: { id: 'm2', title: 'Midnight City', artist: 'M83' },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isSelf: false,
  },
  {
    id: 'n-3',
    userId: 'u-3',
    username: 'elena_sound',
    displayName: 'Elena Beats',
    avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop',
    noteText: 'Drop in 2 days 🔥',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isSelf: false,
  },
];

const INITIAL_REQUESTS: DmRequestItem[] = [
  {
    id: 'req-1',
    conversationId: 'conv-req-1',
    sender: {
      id: 'usr-collab',
      username: 'tech_creator_official',
      displayName: 'Tech Studio',
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    },
    previewMessage:
      'Hey! Loved your recent Reel on Quant AI OS. Would love to collaborate on a series.',
    isSpam: false,
    receivedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'req-2',
    conversationId: 'conv-req-2',
    sender: {
      id: 'usr-crypto-bot',
      username: 'claim_eth_airdrop_now',
      displayName: 'Crypto Foundation',
      avatarUrl: null,
    },
    previewMessage:
      'CONGRATULATIONS! You have 5.4 ETH waiting. Connect wallet immediately: http://phish.example',
    isSpam: true,
    receivedAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

/** The display participant for a conversation: the other member of a 1:1, else the first. */
function otherParticipant(conv: DmConversationSummary, myId: string | null): DmParticipant | null {
  const others = conv.participants.filter((p) => p.id !== myId);
  return others[0] ?? conv.participants[0] ?? null;
}

function titleFor(conv: DmConversationSummary, myId: string | null): string {
  if (conv.isGroup) return conv.name ?? 'Group';
  const other = otherParticipant(conv, myId);
  return other?.displayName || other?.username || 'Conversation';
}

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const MessagesPage: React.FC = () => {
  const [state, setState] = useState<MessagesPageState>({
    myId: null,
    myProfile: {
      id: 'self',
      username: 'quant_user',
      displayName: 'Quant User',
      avatarUrl:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
    },
    conversations: [],
    activeConversation: null,
    messages: [],
    inputText: '',
    loading: true,
    error: null,
    searchQuery: '',
    sending: false,
    activeTab: 'primary',
    requestsFilter: 'all',
    notes: INITIAL_NOTES,
    requests: INITIAL_REQUESTS,
    generalConvIds: new Set(),
    requestedConvIds: new Set(['conv-req-1', 'conv-req-2']),
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const [meRes, convRes] = await Promise.all([
          apiClient.getMe(),
          apiClient.listConversations(),
        ]);
        const profile =
          meRes.success && meRes.data?.profile
            ? {
                id: meRes.data.profile.id,
                username: meRes.data.profile.username || 'quant_user',
                displayName: meRes.data.profile.displayName || 'Quant User',
                avatarUrl:
                  meRes.data.profile.avatarUrl ||
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
              }
            : {
                id: 'self',
                username: 'quant_user',
                displayName: 'Quant User',
                avatarUrl:
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
              };

        setState((prev) => ({
          ...prev,
          myId: profile.id,
          myProfile: profile,
          conversations: convRes.success ? (convRes.data ?? []) : [],
          loading: false,
          error: convRes.success ? null : (convRes.error?.message ?? 'Failed to load messages'),
        }));
      } catch {
        setState((prev) => ({ ...prev, error: 'Failed to load messages', loading: false }));
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const selectConversation = useCallback(async (conv: DmConversationSummary) => {
    setState((prev) => ({ ...prev, activeConversation: conv, messages: [] }));
    const res = await apiClient.getDmMessages(conv.id);
    setState((prev) => ({
      ...prev,
      messages: res.success ? (res.data ?? []) : [],
      // Optimistically clear the unread badge for the opened conversation.
      conversations: prev.conversations.map((c) =>
        c.id === conv.id ? { ...c, unreadCount: 0 } : c,
      ),
    }));
    void apiClient.markDmRead(conv.id);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = state.inputText.trim();
    const conv = state.activeConversation;
    if (!text || !conv || state.sending) return;
    setState((prev) => ({ ...prev, sending: true, inputText: '' }));
    const res = await apiClient.sendDmMessage(conv.id, text);
    setState((prev) => ({
      ...prev,
      sending: false,
      messages: res.success && res.data ? [...prev.messages, res.data] : prev.messages,
    }));
  }, [state.inputText, state.activeConversation, state.sending]);

  // Notes Tray Handlers
  const handleUpsertSelfNote = (text: string, music?: MusicTrackAttachment) => {
    const { updatedNotes } = upsertSelfNote(state.notes, state.myProfile, text, music);
    setState((prev) => ({ ...prev, notes: updatedNotes }));
  };

  const handleRemoveSelfNote = () => {
    const remaining = removeSelfNote(state.notes, state.myProfile.id);
    setState((prev) => ({ ...prev, notes: remaining }));
  };

  // Request Actions
  const handleAcceptRequest = (requestId: string) => {
    const { remaining, accepted } = acceptDmRequest(state.requests, requestId);
    if (!accepted) return;
    const newRequestedSet = new Set(state.requestedConvIds);
    newRequestedSet.delete(accepted.conversationId);

    // Create or find mock conversation
    const newConv: DmConversationSummary = {
      id: accepted.conversationId,
      type: 'DIRECT',
      memberIds: [accepted.sender.id],
      isGroup: false,
      name: accepted.sender.displayName,
      unreadCount: 0,
      participants: [
        {
          id: accepted.sender.id,
          username: accepted.sender.username,
          displayName: accepted.sender.displayName,
          avatarUrl: accepted.sender.avatarUrl,
        },
      ],
      lastMessage: {
        id: `msg-${Date.now()}`,
        conversationId: accepted.conversationId,
        senderId: accepted.sender.id,
        type: 'TEXT',
        content: accepted.previewMessage,
        mediaUrl: null,
        createdAt: accepted.receivedAt,
      },
      lastMessageAt: accepted.receivedAt,
    };

    setState((prev) => ({
      ...prev,
      requests: remaining,
      requestedConvIds: newRequestedSet,
      conversations: [newConv, ...prev.conversations],
      activeTab: 'primary',
      activeConversation: newConv,
      messages: [newConv.lastMessage!],
    }));
  };

  const handleDismissRequest = (requestId: string) => {
    const remaining = dismissDmRequest(state.requests, requestId);
    setState((prev) => ({ ...prev, requests: remaining }));
  };

  const handleBulkDeleteSpam = () => {
    const remaining = bulkDeleteRequests(state.requests, 'spam_only');
    setState((prev) => ({ ...prev, requests: remaining }));
  };

  const handleBulkDeleteAll = () => {
    const remaining = bulkDeleteRequests(state.requests, 'all');
    setState((prev) => ({ ...prev, requests: remaining }));
  };

  // Filter conversations based on current tab
  const tabFilteredConversations = filterConversationsByTab(
    state.conversations,
    state.activeTab,
    state.requestedConvIds,
    state.generalConvIds,
  );

  const visibleConversations = tabFilteredConversations.filter((c) => {
    if (!state.searchQuery.trim()) return true;
    return titleFor(c, state.myId).toLowerCase().includes(state.searchQuery.toLowerCase());
  });

  const visibleRequests = filterDmRequests(state.requests, state.requestsFilter);
  const spamCount = state.requests.filter((r) => r.isSpam).length;

  if (state.loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen bg-black dark:bg-[#0F0F14]">
          <div className="w-10 h-10 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  if (state.error) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen bg-black dark:bg-[#0F0F14]">
          <div className="text-center space-y-3">
            <p className="text-white">{state.error}</p>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-4 py-2 bg-pink-600 text-white rounded-lg text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex h-screen bg-black dark:bg-[#0F0F14] text-white">
        {/* Conversations List Panel */}
        <div className="w-88 border-r border-gray-800 flex flex-col h-full bg-black/60">
          {/* Header & Search */}
          <div className="p-4 border-b border-gray-800/80">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold tracking-tight">Messages</h1>
              <div className="flex items-center space-x-2 text-xs text-pink-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Online</span>
              </div>
            </div>
            <input
              type="text"
              value={state.searchQuery}
              onChange={(e) => setState((prev) => ({ ...prev, searchQuery: e.target.value }))}
              placeholder="Search messages..."
              className="w-full h-10 bg-gray-900/90 border border-gray-800 text-white rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          {/* 24h Notes Tray (Instagram 98-Screen Parity) */}
          <NotesTray
            notes={state.notes}
            onUpsertSelfNote={handleUpsertSelfNote}
            onRemoveSelfNote={handleRemoveSelfNote}
            selfUser={state.myProfile}
          />

          {/* Folder Tabs: Primary | General | Requests */}
          <div className="flex items-center border-b border-gray-800 px-2 py-1 bg-black/40 text-xs">
            <button
              onClick={() => setState((prev) => ({ ...prev, activeTab: 'primary' }))}
              className={`flex-1 py-2 font-semibold text-center border-b-2 transition-colors ${
                state.activeTab === 'primary'
                  ? 'border-pink-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              Primary
            </button>
            <button
              onClick={() => setState((prev) => ({ ...prev, activeTab: 'general' }))}
              className={`flex-1 py-2 font-semibold text-center border-b-2 transition-colors ${
                state.activeTab === 'general'
                  ? 'border-pink-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setState((prev) => ({ ...prev, activeTab: 'requests' }))}
              className={`flex-1 py-2 font-semibold text-center border-b-2 transition-colors relative ${
                state.activeTab === 'requests'
                  ? 'border-pink-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              Requests
              {state.requests.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-pink-600 text-white font-bold">
                  {state.requests.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto">
            {/* REQUESTS TAB VIEW */}
            {state.activeTab === 'requests' ? (
              <div className="p-3 space-y-3">
                <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-3 text-xs text-gray-300">
                  <p className="font-semibold text-white mb-0.5">Message Requests</p>
                  <p className="text-[11px] text-gray-400">
                    Open a request to see who sent it. They won’t know you’ve seen it until you
                    accept.
                  </p>
                </div>

                {/* Requests Filter Pills & Bulk Action */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setState((prev) => ({ ...prev, requestsFilter: 'all' }))}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        state.requestsFilter === 'all'
                          ? 'bg-pink-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      All ({state.requests.length})
                    </button>
                    <button
                      onClick={() => setState((prev) => ({ ...prev, requestsFilter: 'spam' }))}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        state.requestsFilter === 'spam'
                          ? 'bg-pink-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      Spam / Hidden ({spamCount})
                    </button>
                  </div>

                  {state.requests.length > 0 && (
                    <button
                      onClick={
                        state.requestsFilter === 'spam' ? handleBulkDeleteSpam : handleBulkDeleteAll
                      }
                      className="text-[11px] text-red-400 hover:text-red-300 font-medium"
                    >
                      Delete all
                    </button>
                  )}
                </div>

                {/* Request Cards */}
                {visibleRequests.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-xs">
                    No message requests in this folder
                  </div>
                ) : (
                  visibleRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 bg-gray-900/60 border border-gray-800 rounded-2xl space-y-2 hover:border-gray-700 transition-colors"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex items-center justify-center font-bold text-xs">
                          {req.sender.avatarUrl ? (
                            <img
                              src={req.sender.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (req.sender.displayName || req.sender.username || '?')[0]?.toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-white truncate">
                              {req.sender.displayName || req.sender.username}
                            </h4>
                            <span className="text-[10px] text-gray-500">
                              {timeLabel(req.receivedAt)}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400">@{req.sender.username}</p>
                        </div>
                      </div>

                      <p className="text-xs text-gray-300 line-clamp-2 bg-black/40 p-2 rounded-xl">
                        "{req.previewMessage}"
                      </p>

                      <div className="flex items-center justify-end space-x-2 pt-1">
                        <button
                          onClick={() => handleDismissRequest(req.id)}
                          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleAcceptRequest(req.id)}
                          className="px-3 py-1 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-lg text-xs"
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* PRIMARY & GENERAL CONVERSATIONS LIST */
              <>
                {visibleConversations.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">
                    No conversations in {state.activeTab}
                  </div>
                )}
                {visibleConversations.map((conv) => {
                  const other = otherParticipant(conv, state.myId);
                  return (
                    <div
                      key={conv.id}
                      onClick={() => void selectConversation(conv)}
                      className={`flex items-center space-x-3 px-4 py-3 cursor-pointer hover:bg-gray-900/80 ${
                        state.activeConversation?.id === conv.id
                          ? 'bg-gray-900/90 border-l-2 border-pink-500'
                          : ''
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {other?.avatarUrl ? (
                          <img
                            src={other.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          (titleFor(conv, state.myId)[0] ?? '?').toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold truncate">
                            {titleFor(conv, state.myId)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {timeLabel(conv.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-white font-medium' : 'text-gray-500'}`}
                          >
                            {conv.lastMessage?.content ?? 'No messages yet'}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="w-5 h-5 bg-pink-600 rounded-full text-xs flex items-center justify-center flex-shrink-0 font-bold">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Chat Area Panel */}
        <div className="flex-1 flex flex-col bg-black/40">
          {state.activeConversation ? (
            <>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-black/60">
                <div className="flex items-center space-x-3">
                  <p className="text-base font-semibold">
                    {titleFor(state.activeConversation, state.myId)}
                  </p>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <button className="hover:text-white p-2">📞</button>
                  <button className="hover:text-white p-2">📹</button>
                  <button className="hover:text-white p-2">ℹ️</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {state.messages.map((msg) => {
                  const mine = msg.senderId === state.myId;
                  return (
                    <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-md px-4 py-2.5 rounded-2xl ${
                          mine ? 'bg-pink-600 text-white shadow-md' : 'bg-gray-800 text-white'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-[10px] opacity-60 mt-1 text-right">
                          {timeLabel(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-gray-800 bg-black/60 flex items-center space-x-3">
                <input
                  type="text"
                  value={state.inputText}
                  onChange={(e) => setState((prev) => ({ ...prev, inputText: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && void sendMessage()}
                  placeholder="Message..."
                  className="flex-1 h-11 bg-gray-900 border border-gray-800 text-white rounded-full px-5 text-sm outline-none focus:ring-2 focus:ring-pink-500"
                />
                {state.inputText.trim() && (
                  <button
                    onClick={() => void sendMessage()}
                    disabled={state.sending}
                    className="px-5 py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-semibold text-sm rounded-full disabled:opacity-50 shadow-md transition-colors"
                  >
                    Send
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm p-6">
                <div className="text-5xl mb-4">💬</div>
                <p className="text-white text-lg font-semibold">Your Messages</p>
                <p className="text-gray-400 text-xs mt-1">
                  Send private messages and share 24-hour notes with friends and creators across the
                  Quant Ecosystem.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default MessagesPage;
