// ============================================================================
// QuantSync - Messages / DM Inbox Page
// Conversation list, new message, search, message requests, group chats
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  participants: { id: string; name: string; handle: string; avatar: string; isOnline: boolean }[];
  name?: string;
  lastMessage?: { content: string; senderId: string; createdAt: string; isRead: boolean };
  unreadCount: number;
  isPinned: boolean;
}

interface MessageRequest {
  id: string;
  from: { id: string; name: string; handle: string; avatar: string };
  preview: string;
  createdAt: string;
}

type DMTab = 'inbox' | 'requests';

const MessagesPage: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [activeTab, setActiveTab] = useState<DMTab>('inbox');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showNewMessage, setShowNewMessage] = useState<boolean>(false);
  const [showGroupCreate, setShowGroupCreate] = useState<boolean>(false);
  const [newMessageTo, setNewMessageTo] = useState<string>('');
  const [newMessageContent, setNewMessageContent] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [groupName, setGroupName] = useState<string>('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [memberResults, setMemberResults] = useState<
    { id: string; name: string; handle: string; avatar: string }[]
  >([]);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/messages/conversations');
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      setConversations(data.conversations || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchRequests();
  }, [fetchConversations, fetchRequests]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessageTo.trim() || !newMessageContent.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: newMessageTo, content: newMessageContent }),
      });
      if (!res.ok) throw new Error('Failed to send');
      setNewMessageTo('');
      setNewMessageContent('');
      setShowNewMessage(false);
      fetchConversations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }, [newMessageTo, newMessageContent, fetchConversations]);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || groupMembers.length < 2) return;
    try {
      const res = await fetch('/api/messages/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, members: groupMembers }),
      });
      if (!res.ok) throw new Error('Failed to create group');
      setShowGroupCreate(false);
      setGroupName('');
      setGroupMembers([]);
      fetchConversations();
    } catch (err: any) {
      setError(err.message);
    }
  }, [groupName, groupMembers, fetchConversations]);

  const handleAcceptRequest = useCallback(
    async (requestId: string) => {
      await fetch(`/api/messages/requests/${requestId}/accept`, { method: 'POST' });
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      fetchConversations();
    },
    [fetchConversations],
  );

  const handleDeclineRequest = useCallback(async (requestId: string) => {
    await fetch(`/api/messages/requests/${requestId}/decline`, { method: 'POST' });
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
  }, []);

  const searchMembers = useCallback(async (q: string) => {
    if (q.length < 2) {
      setMemberResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setMemberResults(data.users || []);
      }
    } catch {}
  }, []);

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const names = c.participants.map((p) => p.name.toLowerCase()).join(' ');
    return (
      names.includes(searchQuery.toLowerCase()) ||
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const getTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load messages</div>
        <button
          onClick={fetchConversations}
          className="px-6 py-2 bg-blue-500 text-white rounded-full"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Messages</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGroupCreate(true)}
              className="p-2 hover:bg-gray-100 rounded-full text-sm"
              title="New group"
            >
              👥
            </button>
            <button
              onClick={() => setShowNewMessage(true)}
              className="p-2 hover:bg-gray-100 rounded-full text-sm"
              title="New message"
            >
              ✉️
            </button>
          </div>
        </div>
        <div className="px-4 pb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full border rounded-full px-4 py-2 text-sm bg-gray-50"
          />
        </div>
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex-1 py-3 text-center text-sm font-medium ${activeTab === 'inbox' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
          >
            Inbox
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-3 text-center text-sm font-medium relative ${activeTab === 'requests' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
          >
            Requests
            {requests.length > 0 && (
              <span className="absolute top-2 right-8 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                {requests.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {activeTab === 'inbox' && (
        <div className="divide-y">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">💬</div>
              <h3 className="text-lg font-semibold text-gray-700">No messages yet</h3>
              <p className="text-gray-500 mt-1">Start a conversation with someone!</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const displayName = conv.name || conv.participants.map((p) => p.name).join(', ');
              const avatar = conv.participants[0]?.avatar;
              return (
                <div
                  key={conv.id}
                  className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer ${conv.unreadCount > 0 ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="relative">
                    <img src={avatar} alt="" className="w-12 h-12 rounded-full" />
                    {conv.participants[0]?.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                    )}
                    {conv.type === 'group' && (
                      <span className="absolute -top-1 -right-1 text-xs">👥</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium text-sm truncate ${conv.unreadCount > 0 ? 'font-bold' : ''}`}
                      >
                        {displayName}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {conv.lastMessage ? getTimeAgo(conv.lastMessage.createdAt) : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
                      >
                        {conv.lastMessage?.content || 'No messages'}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {conv.isPinned && <span className="text-xs">📌</span>}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="divide-y">
          {requests.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📨</div>
              <h3 className="text-lg font-semibold text-gray-700">No message requests</h3>
            </div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-2">
                  <img src={req.from.avatar} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <span className="font-medium text-sm">{req.from.name}</span>
                    <span className="text-gray-500 text-sm ml-1">@{req.from.handle}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-3">{req.preview}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptRequest(req.id)}
                    className="px-4 py-1.5 bg-blue-500 text-white rounded-full text-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDeclineRequest(req.id)}
                    className="px-4 py-1.5 border rounded-full text-sm"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showNewMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Message</h2>
              <button onClick={() => setShowNewMessage(false)} className="text-gray-500 text-xl">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={newMessageTo}
              onChange={(e) => setNewMessageTo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3"
              placeholder="To: @username"
            />
            <textarea
              value={newMessageContent}
              onChange={(e) => setNewMessageContent(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 min-h-[100px] mb-3"
              placeholder="Type your message..."
            />
            <button
              onClick={handleSendMessage}
              disabled={sending}
              className="w-full py-2 bg-blue-500 text-white rounded-full font-medium disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {showGroupCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Create Group Chat</h2>
              <button onClick={() => setShowGroupCreate(false)} className="text-gray-500 text-xl">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3"
              placeholder="Group name"
            />
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                searchMembers(e.target.value);
              }}
              className="w-full border rounded-lg px-3 py-2 mb-2"
              placeholder="Search people to add..."
            />
            {memberResults.length > 0 && (
              <div className="border rounded-lg mb-3 max-h-32 overflow-y-auto">
                {memberResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setGroupMembers((prev) => [...prev, u.id]);
                      setMemberResults([]);
                      setMemberSearch('');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm"
                  >
                    <img src={u.avatar} alt="" className="w-6 h-6 rounded-full" />
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            {groupMembers.length > 0 && (
              <p className="text-xs text-gray-500 mb-3">{groupMembers.length} members selected</p>
            )}
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || groupMembers.length < 2}
              className="w-full py-2 bg-blue-500 text-white rounded-full font-medium disabled:opacity-50"
            >
              Create Group
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesPage;
