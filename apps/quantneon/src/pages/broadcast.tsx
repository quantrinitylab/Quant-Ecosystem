// ============================================================================
// QuantNeon - Broadcast Channels
// Create, manage subscribers, one-to-many messaging
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface BroadcastChannel {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  subscriberCount: number;
  messageCount: number;
  isOwner: boolean;
  isSubscribed: boolean;
  createdAt: string;
  lastMessageAt: string;
}

interface BroadcastMessage {
  id: string;
  channelId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'poll' | null;
  reactions: Record<string, number>;
  timestamp: string;
}

interface BroadcastPageState {
  channels: BroadcastChannel[];
  activeChannel: BroadcastChannel | null;
  messages: BroadcastMessage[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  newChannelName: string;
  newChannelDesc: string;
  composing: boolean;
  composeText: string;
}

const MOCK_CHANNELS: BroadcastChannel[] = [
  { id: 'bc1', name: 'Daily Updates', description: 'Behind the scenes and daily life updates', avatarUrl: '/avatars/bc1.jpg', subscriberCount: 45200, messageCount: 312, isOwner: true, isSubscribed: true, createdAt: '2023-06-01', lastMessageAt: '2024-01-15T18:00:00Z' },
  { id: 'bc2', name: 'Fashion Drops', description: 'Exclusive fashion news and early access', avatarUrl: '/avatars/bc2.jpg', subscriberCount: 128000, messageCount: 89, isOwner: false, isSubscribed: true, createdAt: '2023-09-15', lastMessageAt: '2024-01-15T14:00:00Z' },
  { id: 'bc3', name: 'Tech News', description: 'Breaking tech news and product reviews', avatarUrl: '/avatars/bc3.jpg', subscriberCount: 89000, messageCount: 567, isOwner: false, isSubscribed: false, createdAt: '2023-03-01', lastMessageAt: '2024-01-15T20:00:00Z' },
];

const MOCK_MESSAGES: BroadcastMessage[] = [
  { id: 'bm1', channelId: 'bc1', text: 'Just finished editing a new video - dropping tomorrow at 10am! Stay tuned.', mediaUrl: null, mediaType: null, reactions: { '🔥': 234, '❤️': 567, '🙌': 89 }, timestamp: '2024-01-15T18:00:00Z' },
  { id: 'bm2', channelId: 'bc1', text: 'New merch designs! What do you think?', mediaUrl: '/media/merch-preview.jpg', mediaType: 'image', reactions: { '😍': 890, '🔥': 445, '💰': 123 }, timestamp: '2024-01-15T14:00:00Z' },
  { id: 'bm3', channelId: 'bc1', text: 'Good morning! Starting the day with a quick Q&A in stories. Drop your questions here!', mediaUrl: null, mediaType: null, reactions: { '👋': 234, '❤️': 156 }, timestamp: '2024-01-15T09:00:00Z' },
  { id: 'bm4', channelId: 'bc1', text: 'Collab announcement coming this week... any guesses? 👀', mediaUrl: null, mediaType: null, reactions: { '👀': 1200, '🤔': 567, '😱': 234 }, timestamp: '2024-01-14T20:00:00Z' },
];

const BroadcastPage: React.FC = () => {
  const [state, setState] = useState<BroadcastPageState>({
    channels: [],
    activeChannel: null,
    messages: [],
    loading: true,
    error: null,
    creating: false,
    newChannelName: '',
    newChannelDesc: '',
    composing: false,
    composeText: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 400));
        setState(prev => ({ ...prev, channels: MOCK_CHANNELS, loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load channels', loading: false }));
      }
    };
    load();
  }, []);

  const selectChannel = useCallback((channel: BroadcastChannel) => {
    setState(prev => ({ ...prev, activeChannel: channel, messages: MOCK_MESSAGES.filter(m => m.channelId === channel.id) }));
  }, []);

  const createChannel = useCallback(() => {
    if (!state.newChannelName.trim()) return;
    const newChannel: BroadcastChannel = {
      id: `bc_${Date.now()}`, name: state.newChannelName, description: state.newChannelDesc,
      avatarUrl: '/avatars/default.jpg', subscriberCount: 0, messageCount: 0,
      isOwner: true, isSubscribed: true, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, channels: [newChannel, ...prev.channels], creating: false, newChannelName: '', newChannelDesc: '' }));
  }, [state.newChannelName, state.newChannelDesc]);

  const sendBroadcast = useCallback(() => {
    if (!state.composeText.trim() || !state.activeChannel) return;
    const newMsg: BroadcastMessage = {
      id: `bm_${Date.now()}`, channelId: state.activeChannel.id, text: state.composeText,
      mediaUrl: null, mediaType: null, reactions: {}, timestamp: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, messages: [newMsg, ...prev.messages], composing: false, composeText: '' }));
  }, [state.composeText, state.activeChannel]);

  const toggleSubscribe = useCallback((channelId: string) => {
    setState(prev => ({
      ...prev,
      channels: prev.channels.map(ch => ch.id === channelId ? { ...ch, isSubscribed: !ch.isSubscribed } : ch),
    }));
  }, []);

  const addReaction = useCallback((messageId: string, emoji: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m => m.id === messageId ? { ...m, reactions: { ...m.reactions, [emoji]: (m.reactions[emoji] || 0) + 1 } } : m),
    }));
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

  if (state.activeChannel) {
    return (
      <div className="min-h-screen bg-black text-white">
        <header className="sticky top-0 bg-black/95 border-b border-gray-800 px-4 py-3 flex items-center space-x-3 z-10">
          <button onClick={() => setState(prev => ({ ...prev, activeChannel: null }))} className="text-white">←</button>
          <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
            <img src={state.activeChannel.avatarUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">{state.activeChannel.name}</p>
            <p className="text-xs text-gray-400">{state.activeChannel.subscriberCount.toLocaleString()} subscribers</p>
          </div>
          {state.activeChannel.isOwner && (
            <button onClick={() => setState(prev => ({ ...prev, composing: true }))} className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs">
              New Message
            </button>
          )}
        </header>
        <div className="px-4 py-4 space-y-4">
          {state.messages.map(msg => (
            <div key={msg.id} className="bg-gray-900 rounded-xl p-4">
              <p className="text-sm text-white">{msg.text}</p>
              {msg.mediaUrl && (
                <div className="mt-3 rounded-lg bg-gray-800 h-48 overflow-hidden">
                  <img src={msg.mediaUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-center space-x-2 mt-3">
                {Object.entries(msg.reactions).map(([emoji, count]) => (
                  <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="flex items-center space-x-1 bg-gray-800 rounded-full px-2 py-1 text-xs hover:bg-gray-700">
                    <span>{emoji}</span>
                    <span className="text-gray-400">{count}</span>
                  </button>
                ))}
                <button onClick={() => addReaction(msg.id, '❤️')} className="text-gray-500 text-xs px-2 py-1 hover:text-white">+ React</button>
              </div>
              <p className="text-xs text-gray-500 mt-2">{new Date(msg.timestamp).toLocaleString()}</p>
            </div>
          ))}
          {state.messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No messages yet</p>
            </div>
          )}
        </div>
        {state.composing && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-3">New Broadcast</h3>
              <textarea
                value={state.composeText}
                onChange={(e) => setState(prev => ({ ...prev, composeText: e.target.value }))}
                placeholder="Write your message..."
                rows={4}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none resize-none focus:ring-1 focus:ring-pink-500"
              />
              <div className="flex space-x-3 mt-4">
                <button onClick={sendBroadcast} className="flex-1 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700">Send</button>
                <button onClick={() => setState(prev => ({ ...prev, composing: false }))} className="flex-1 py-2 bg-gray-700 text-white rounded-lg">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20 px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Channels</h1>
        <button onClick={() => setState(prev => ({ ...prev, creating: true }))} className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs">+ Create</button>
      </header>
      <div className="space-y-3">
        {state.channels.map(channel => (
          <div key={channel.id} onClick={() => selectChannel(channel)} className="flex items-center space-x-3 bg-gray-900 rounded-xl p-4 cursor-pointer hover:bg-gray-800">
            <div className="w-12 h-12 rounded-full bg-gray-700 overflow-hidden">
              <img src={channel.avatarUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{channel.name}</p>
              <p className="text-xs text-gray-400 truncate">{channel.description}</p>
              <p className="text-xs text-gray-500 mt-0.5">{channel.subscriberCount.toLocaleString()} subscribers</p>
            </div>
            {!channel.isOwner && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleSubscribe(channel.id); }}
                className={`px-3 py-1.5 rounded-lg text-xs ${channel.isSubscribed ? 'bg-gray-700 text-gray-300' : 'bg-pink-600 text-white'}`}
              >{channel.isSubscribed ? 'Joined' : 'Join'}</button>
            )}
          </div>
        ))}
      </div>
      {state.channels.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📢</div>
          <p className="text-white font-semibold">No Channels</p>
          <p className="text-gray-400 text-sm mt-1">Create a broadcast channel to share updates</p>
        </div>
      )}
      {state.creating && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">Create Channel</h3>
            <input type="text" value={state.newChannelName} onChange={(e) => setState(prev => ({ ...prev, newChannelName: e.target.value }))} placeholder="Channel name" className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none mb-3 focus:ring-1 focus:ring-pink-500" />
            <textarea value={state.newChannelDesc} onChange={(e) => setState(prev => ({ ...prev, newChannelDesc: e.target.value }))} placeholder="Description" rows={3} className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none resize-none mb-4 focus:ring-1 focus:ring-pink-500" />
            <div className="flex space-x-3">
              <button onClick={createChannel} className="flex-1 py-2 bg-pink-600 text-white rounded-lg font-medium">Create</button>
              <button onClick={() => setState(prev => ({ ...prev, creating: false }))} className="flex-1 py-2 bg-gray-700 text-white rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BroadcastPage;
