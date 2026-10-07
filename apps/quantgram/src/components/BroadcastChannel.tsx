// ============================================================================
// QuantNeon - Broadcast Channel Component
// Broadcast message list, subscriber management
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface BroadcastChannelProps {
  channelId: string;
  channelName: string;
  isOwner: boolean;
  subscriberCount: number;
}

interface BroadcastMsg {
  id: string;
  text: string;
  mediaUrl: string | null;
  reactions: Record<string, number>;
  timestamp: string;
}

interface ChannelState {
  messages: BroadcastMsg[];
  loading: boolean;
  composing: boolean;
  composeText: string;
  reacting: string | null;
}

const QUICK_REACTIONS = ['🔥', '❤️', '👏', '😍', '🙌', '💯'];

const MOCK_MSGS: BroadcastMsg[] = [
  { id: 'bm1', text: 'Big announcement coming tomorrow at noon! Stay tuned!', mediaUrl: null, reactions: { '🔥': 456, '❤️': 234 }, timestamp: '2024-01-15T18:00:00Z' },
  { id: 'bm2', text: 'New content dropping this week - which topic should I cover first?', mediaUrl: null, reactions: { '🙌': 123, '💯': 89 }, timestamp: '2024-01-15T12:00:00Z' },
  { id: 'bm3', text: 'Behind the scenes from today shoot!', mediaUrl: '/media/bts.jpg', reactions: { '😍': 678, '🔥': 345 }, timestamp: '2024-01-14T16:00:00Z' },
];

const BroadcastChannel: React.FC<BroadcastChannelProps> = ({ channelId, channelName, isOwner, subscriberCount }) => {
  const [state, setState] = useState<ChannelState>({
    messages: [], loading: true, composing: false, composeText: '', reacting: null,
  });

  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      setState(prev => ({ ...prev, messages: MOCK_MSGS, loading: false }));
    };
    load();
  }, [channelId]);

  const sendMessage = useCallback(() => {
    if (!state.composeText.trim()) return;
    const newMsg: BroadcastMsg = { id: `bm_${Date.now()}`, text: state.composeText, mediaUrl: null, reactions: {}, timestamp: new Date().toISOString() };
    setState(prev => ({ ...prev, messages: [newMsg, ...prev.messages], composing: false, composeText: '' }));
  }, [state.composeText]);

  const addReaction = useCallback((msgId: string, emoji: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m => m.id === msgId ? { ...m, reactions: { ...m.reactions, [emoji]: (m.reactions[emoji] || 0) + 1 } } : m),
      reacting: null,
    }));
  }, []);

  if (state.loading) {
    return <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm">{channelName}</h3>
          <p className="text-xs text-gray-400">{subscriberCount.toLocaleString()} subscribers</p>
        </div>
        {isOwner && (
          <button onClick={() => setState(prev => ({ ...prev, composing: true }))} className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs">New Post</button>
        )}
      </div>
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {state.messages.map(msg => (
          <div key={msg.id} className="bg-gray-900 rounded-xl p-4">
            <p className="text-white text-sm">{msg.text}</p>
            {msg.mediaUrl && <div className="mt-2 rounded-lg bg-gray-800 h-32 overflow-hidden"><img src={msg.mediaUrl} alt="" className="w-full h-full object-cover" /></div>}
            <div className="flex items-center space-x-2 mt-3">
              {Object.entries(msg.reactions).map(([emoji, count]) => (
                <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="flex items-center space-x-1 bg-gray-800 rounded-full px-2 py-1 text-xs hover:bg-gray-700">
                  <span>{emoji}</span><span className="text-gray-400">{count}</span>
                </button>
              ))}
              <button onClick={() => setState(prev => ({ ...prev, reacting: prev.reacting === msg.id ? null : msg.id }))} className="text-gray-500 text-xs hover:text-white">+</button>
            </div>
            {state.reacting === msg.id && (
              <div className="flex space-x-1 mt-2">
                {QUICK_REACTIONS.map(emoji => (
                  <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="text-lg p-1 hover:bg-gray-800 rounded">{emoji}</button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-600 mt-2">{new Date(msg.timestamp).toLocaleDateString()}</p>
          </div>
        ))}
        {state.messages.length === 0 && <p className="text-center text-gray-500 text-sm py-8">No messages yet</p>}
      </div>
      {state.composing && (
        <div className="px-4 py-3 border-t border-gray-800">
          <textarea value={state.composeText} onChange={(e) => setState(prev => ({ ...prev, composeText: e.target.value }))} placeholder="Broadcast message..." rows={2} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none mb-2" />
          <div className="flex space-x-2">
            <button onClick={sendMessage} className="px-4 py-1.5 bg-pink-600 text-white rounded-lg text-xs">Send</button>
            <button onClick={() => setState(prev => ({ ...prev, composing: false }))} className="px-4 py-1.5 bg-gray-700 text-white rounded-lg text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BroadcastChannel;
