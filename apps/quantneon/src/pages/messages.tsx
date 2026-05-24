// ============================================================================
// QuantNeon - Direct Messages
// DMs inbox with conversations, group chats, message requests, read receipts
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Conversation {
  id: string;
  participants: Participant[];
  lastMessage: Message;
  unreadCount: number;
  isGroup: boolean;
  groupName: string | null;
  groupAvatar: string | null;
  isMuted: boolean;
  isPinned: boolean;
}

interface Participant {
  id: string;
  username: string;
  avatar: string;
  isOnline: boolean;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  type: 'text' | 'image' | 'voice' | 'post_share' | 'reel_share';
  mediaUrl: string | null;
}

interface MessageRequest {
  id: string;
  from: Participant;
  preview: string;
  timestamp: string;
}

interface MessagesPageState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  messageRequests: MessageRequest[];
  inputText: string;
  loading: boolean;
  error: string | null;
  showRequests: boolean;
  searchQuery: string;
  disappearingMode: boolean;
  sending: boolean;
}

const MOCK_CONVERSATIONS: Conversation[] = [
  { id: 'conv1', participants: [{ id: 'u1', username: 'alex_photo', avatar: '/avatars/alex.jpg', isOnline: true }], lastMessage: { id: 'm1', senderId: 'u1', text: 'That sunset shot was incredible!', timestamp: '2024-01-15T19:30:00Z', isRead: false, type: 'text', mediaUrl: null }, unreadCount: 3, isGroup: false, groupName: null, groupAvatar: null, isMuted: false, isPinned: true },
  { id: 'conv2', participants: [{ id: 'u2', username: 'travel_emma', avatar: '/avatars/emma.jpg', isOnline: true }, { id: 'u3', username: 'foodie_mark', avatar: '/avatars/mark.jpg', isOnline: false }], lastMessage: { id: 'm2', senderId: 'u2', text: 'When are we meeting for the collab?', timestamp: '2024-01-15T18:00:00Z', isRead: true, type: 'text', mediaUrl: null }, unreadCount: 0, isGroup: true, groupName: 'Collab Squad', groupAvatar: null, isMuted: false, isPinned: false },
  { id: 'conv3', participants: [{ id: 'u4', username: 'design_sara', avatar: '/avatars/sara.jpg', isOnline: false }], lastMessage: { id: 'm3', senderId: 'me', text: 'Check out this reel!', timestamp: '2024-01-15T16:00:00Z', isRead: true, type: 'reel_share', mediaUrl: null }, unreadCount: 0, isGroup: false, groupName: null, groupAvatar: null, isMuted: true, isPinned: false },
  { id: 'conv4', participants: [{ id: 'u5', username: 'music_jay', avatar: '/avatars/jay.jpg', isOnline: true }], lastMessage: { id: 'm4', senderId: 'u5', text: 'Voice message', timestamp: '2024-01-15T14:00:00Z', isRead: false, type: 'voice', mediaUrl: '/audio/voice1.mp3' }, unreadCount: 1, isGroup: false, groupName: null, groupAvatar: null, isMuted: false, isPinned: false },
];

const MOCK_MESSAGES: Message[] = [
  { id: 'msg1', senderId: 'u1', text: 'Hey! Did you see my latest post?', timestamp: '2024-01-15T19:00:00Z', isRead: true, type: 'text', mediaUrl: null },
  { id: 'msg2', senderId: 'me', text: 'Yes! The lighting was perfect', timestamp: '2024-01-15T19:10:00Z', isRead: true, type: 'text', mediaUrl: null },
  { id: 'msg3', senderId: 'u1', text: 'Thanks! Golden hour magic', timestamp: '2024-01-15T19:15:00Z', isRead: true, type: 'text', mediaUrl: null },
  { id: 'msg4', senderId: 'u1', text: 'That sunset shot was incredible!', timestamp: '2024-01-15T19:30:00Z', isRead: false, type: 'text', mediaUrl: null },
];

const MOCK_REQUESTS: MessageRequest[] = [
  { id: 'req1', from: { id: 'u10', username: 'new_follower', avatar: '/avatars/nf.jpg', isOnline: false }, preview: 'Hi! Love your content...', timestamp: '2024-01-15T12:00:00Z' },
  { id: 'req2', from: { id: 'u11', username: 'brand_collab', avatar: '/avatars/brand.jpg', isOnline: true }, preview: 'We would love to work with you on...', timestamp: '2024-01-14T10:00:00Z' },
];

const MessagesPage: React.FC = () => {
  const [state, setState] = useState<MessagesPageState>({
    conversations: [],
    activeConversation: null,
    messages: [],
    messageRequests: [],
    inputText: '',
    loading: true,
    error: null,
    showRequests: false,
    searchQuery: '',
    disappearingMode: false,
    sending: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setState(prev => ({ ...prev, loading: true }));
        await new Promise(resolve => setTimeout(resolve, 500));
        setState(prev => ({ ...prev, conversations: MOCK_CONVERSATIONS, messageRequests: MOCK_REQUESTS, loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load messages', loading: false }));
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const selectConversation = useCallback((conv: Conversation) => {
    setState(prev => ({ ...prev, activeConversation: conv, messages: MOCK_MESSAGES }));
  }, []);

  const sendMessage = useCallback(async () => {
    if (!state.inputText.trim()) return;
    const newMsg: Message = {
      id: `msg_${Date.now()}`, senderId: 'me', text: state.inputText, timestamp: new Date().toISOString(), isRead: false, type: 'text', mediaUrl: null,
    };
    setState(prev => ({ ...prev, messages: [...prev.messages, newMsg], inputText: '', sending: false }));
  }, [state.inputText]);

  const acceptRequest = useCallback((requestId: string) => {
    setState(prev => ({ ...prev, messageRequests: prev.messageRequests.filter(r => r.id !== requestId) }));
  }, []);

  const declineRequest = useCallback((requestId: string) => {
    setState(prev => ({ ...prev, messageRequests: prev.messageRequests.filter(r => r.id !== requestId) }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-10 h-10 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center space-y-3">
          <p className="text-white">{state.error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Conversations List */}
      <div className="w-80 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold">Messages</h1>
            <button className="text-white p-1 hover:bg-gray-800 rounded">✏</button>
          </div>
          <input
            type="text"
            value={state.searchQuery}
            onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="Search messages..."
            className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-pink-500"
          />
        </div>
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setState(prev => ({ ...prev, showRequests: false }))}
            className={`flex-1 py-2 text-sm font-medium ${!state.showRequests ? 'text-white border-b-2 border-white' : 'text-gray-500'}`}
          >Primary</button>
          <button
            onClick={() => setState(prev => ({ ...prev, showRequests: true }))}
            className={`flex-1 py-2 text-sm font-medium relative ${state.showRequests ? 'text-white border-b-2 border-white' : 'text-gray-500'}`}
          >
            Requests
            {state.messageRequests.length > 0 && (
              <span className="absolute -top-1 right-4 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center">{state.messageRequests.length}</span>
            )}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!state.showRequests ? (
            state.conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`flex items-center space-x-3 px-4 py-3 cursor-pointer hover:bg-gray-900 ${state.activeConversation?.id === conv.id ? 'bg-gray-900' : ''}`}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gray-700 overflow-hidden">
                    <img src={conv.participants[0].avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  {conv.participants[0].isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold truncate">{conv.isGroup ? conv.groupName : conv.participants[0].username}</span>
                    <span className="text-xs text-gray-500">{new Date(conv.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-white font-medium' : 'text-gray-500'}`}>{conv.lastMessage.text}</span>
                    {conv.unreadCount > 0 && <span className="w-5 h-5 bg-pink-600 rounded-full text-xs flex items-center justify-center flex-shrink-0">{conv.unreadCount}</span>}
                  </div>
                </div>
              </div>
            ))
          ) : (
            state.messageRequests.map(req => (
              <div key={req.id} className="flex items-center space-x-3 px-4 py-3">
                <div className="w-12 h-12 rounded-full bg-gray-700 overflow-hidden">
                  <img src={req.from.avatar} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{req.from.username}</p>
                  <p className="text-xs text-gray-500 truncate">{req.preview}</p>
                </div>
                <div className="flex space-x-1">
                  <button onClick={() => acceptRequest(req.id)} className="px-2 py-1 bg-pink-600 text-white rounded text-xs">Accept</button>
                  <button onClick={() => declineRequest(req.id)} className="px-2 py-1 bg-gray-700 text-white rounded text-xs">Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {state.activeConversation ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                  <img src={state.activeConversation.participants[0].avatar} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{state.activeConversation.isGroup ? state.activeConversation.groupName : state.activeConversation.participants[0].username}</p>
                  <p className="text-xs text-gray-500">{state.activeConversation.participants[0].isOnline ? 'Active now' : 'Offline'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button className="text-white p-2 hover:bg-gray-800 rounded-full">📞</button>
                <button className="text-white p-2 hover:bg-gray-800 rounded-full">📹</button>
                <button className="text-white p-2 hover:bg-gray-800 rounded-full">ℹ</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {state.messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.senderId === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-4 py-2 rounded-2xl ${msg.senderId === 'me' ? 'bg-pink-600 text-white' : 'bg-gray-800 text-white'}`}>
                    <p className="text-sm">{msg.text}</p>
                    <p className="text-xs opacity-60 mt-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="px-4 py-3 border-t border-gray-800 flex items-center space-x-3">
              <button className="text-gray-400 hover:text-white">📷</button>
              <input
                type="text"
                value={state.inputText}
                onChange={(e) => setState(prev => ({ ...prev, inputText: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Message..."
                className="flex-1 bg-gray-900 text-white rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-pink-500"
              />
              <button className="text-gray-400 hover:text-white">🎤</button>
              {state.inputText.trim() && (
                <button onClick={sendMessage} className="text-pink-500 font-semibold text-sm">Send</button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-white text-lg font-semibold">Your Messages</p>
              <p className="text-gray-400 text-sm mt-1">Select a conversation to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
