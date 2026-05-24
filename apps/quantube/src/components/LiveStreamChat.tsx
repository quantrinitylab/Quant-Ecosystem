// ============================================================================
// QuantTube - Live Stream Chat Component
// Real-time chat with donations, pinned messages, slow mode, emotes
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ChatMessage {
  id: string;
  author: string;
  avatar: string;
  text: string;
  timestamp: string;
  isModerator: boolean;
  isOwner: boolean;
  donation: { amount: number; currency: string } | null;
  badge: string | null;
}

interface PinnedMessage {
  id: string;
  author: string;
  text: string;
  pinnedAt: string;
}

interface LiveStreamChatProps {
  streamId: string;
  isOwner: boolean;
  viewerCount: number;
}

interface ChatState {
  messages: ChatMessage[];
  inputText: string;
  pinnedMessage: PinnedMessage | null;
  slowMode: boolean;
  slowModeDelay: number;
  emotePickerOpen: boolean;
  donationMode: boolean;
  donationAmount: string;
  isPaused: boolean;
  lastSendTime: number;
}

const EMOTES = ['🎉', '🔥', '❤️', '😂', '👏', '💯', '🎮', '💀', '😍', '🤔', '👀', '💪'];

const MOCK_MESSAGES: ChatMessage[] = [
  { id: 'cm1', author: 'GameFan99', avatar: '/avatars/gf99.jpg', text: 'This stream is amazing!', timestamp: '2024-01-15T20:01:00Z', isModerator: false, isOwner: false, donation: null, badge: null },
  { id: 'cm2', author: 'ModeratorJoe', avatar: '/avatars/modjoe.jpg', text: 'Welcome everyone! Remember to follow the rules.', timestamp: '2024-01-15T20:01:30Z', isModerator: true, isOwner: false, donation: null, badge: '🛡' },
  { id: 'cm3', author: 'SuperFan', avatar: '/avatars/superfan.jpg', text: 'You deserve this! Keep up the great content!', timestamp: '2024-01-15T20:02:00Z', isModerator: false, isOwner: false, donation: { amount: 50, currency: 'USD' }, badge: '💎' },
  { id: 'cm4', author: 'TechWatcher', avatar: '/avatars/tw.jpg', text: 'Can you explain that part again?', timestamp: '2024-01-15T20:02:30Z', isModerator: false, isOwner: false, donation: null, badge: null },
  { id: 'cm5', author: 'StreamerHost', avatar: '/avatars/host.jpg', text: 'Thanks for the super chat! Really appreciate it!', timestamp: '2024-01-15T20:03:00Z', isModerator: false, isOwner: true, donation: null, badge: '⭐' },
  { id: 'cm6', author: 'NewViewer', avatar: '/avatars/nv.jpg', text: 'First time here, this is cool!', timestamp: '2024-01-15T20:03:30Z', isModerator: false, isOwner: false, donation: null, badge: null },
  { id: 'cm7', author: 'LongTimeSub', avatar: '/avatars/lts.jpg', text: '6 months subscribed! Love this channel', timestamp: '2024-01-15T20:04:00Z', isModerator: false, isOwner: false, donation: { amount: 10, currency: 'USD' }, badge: '🏆' },
];

const LiveStreamChat: React.FC<LiveStreamChatProps> = ({ streamId, isOwner, viewerCount }) => {
  const [state, setState] = useState<ChatState>({
    messages: [],
    inputText: '',
    pinnedMessage: { id: 'pin1', author: 'ModeratorJoe', text: 'Stream rules: Be respectful, no spam, have fun!', pinnedAt: '2024-01-15T20:00:00Z' },
    slowMode: false,
    slowModeDelay: 5,
    emotePickerOpen: false,
    donationMode: false,
    donationAmount: '',
    isPaused: false,
    lastSendTime: 0,
  });

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState(prev => ({ ...prev, messages: MOCK_MESSAGES }));
  }, [streamId]);

  useEffect(() => {
    if (!state.isPaused && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.messages, state.isPaused]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!state.isPaused) {
        const newMsg: ChatMessage = {
          id: `cm-${Date.now()}`,
          author: `Viewer${Math.floor(Math.random() * 1000)}`,
          avatar: '/avatars/default.jpg',
          text: ['Great stream!', 'LOL', 'Nice one!', 'PogChamp', 'Keep going!'][Math.floor(Math.random() * 5)],
          timestamp: new Date().toISOString(),
          isModerator: false,
          isOwner: false,
          donation: null,
          badge: null,
        };
        setState(prev => ({
          ...prev,
          messages: [...prev.messages.slice(-100), newMsg],
        }));
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [state.isPaused]);

  const sendMessage = useCallback(() => {
    if (!state.inputText.trim()) return;
    const now = Date.now();
    if (state.slowMode && now - state.lastSendTime < state.slowModeDelay * 1000) return;

    const newMsg: ChatMessage = {
      id: `my-${now}`,
      author: 'You',
      avatar: '/avatars/me.jpg',
      text: state.inputText,
      timestamp: new Date().toISOString(),
      isModerator: false,
      isOwner,
      donation: state.donationMode && state.donationAmount ? { amount: parseFloat(state.donationAmount), currency: 'USD' } : null,
      badge: isOwner ? '⭐' : null,
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMsg],
      inputText: '',
      donationMode: false,
      donationAmount: '',
      lastSendTime: now,
    }));
  }, [state.inputText, state.slowMode, state.slowModeDelay, state.lastSendTime, state.donationMode, state.donationAmount, isOwner]);

  const addEmote = useCallback((emote: string) => {
    setState(prev => ({ ...prev, inputText: prev.inputText + emote, emotePickerOpen: false }));
  }, []);

  const toggleSlowMode = useCallback(() => {
    setState(prev => ({ ...prev, slowMode: !prev.slowMode }));
  }, []);

  const dismissPin = useCallback(() => {
    setState(prev => ({ ...prev, pinnedMessage: null }));
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <h3 className="text-white text-sm font-semibold">Live Chat</h3>
          <span className="text-xs text-gray-400">{viewerCount.toLocaleString()} watching</span>
        </div>
        <div className="flex items-center space-x-2">
          {isOwner && (
            <button
              onClick={toggleSlowMode}
              className={`text-xs px-2 py-1 rounded ${state.slowMode ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              🐌 Slow
            </button>
          )}
          <button
            onClick={() => setState(prev => ({ ...prev, isPaused: !prev.isPaused }))}
            className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            {state.isPaused ? '▶' : '⏸'}
          </button>
        </div>
      </div>

      {/* Pinned Message */}
      {state.pinnedMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-900/30 border-b border-blue-800/50">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-blue-400">📌</span>
            <p className="text-xs text-blue-200 truncate">{state.pinnedMessage.text}</p>
          </div>
          <button onClick={dismissPin} className="text-gray-500 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {state.messages.map(msg => (
          <div key={msg.id} className={`flex items-start space-x-2 ${msg.donation ? 'bg-yellow-900/20 rounded-lg p-2 border border-yellow-600/30' : ''}`}>
            <div className="w-6 h-6 rounded-full bg-gray-700 flex-shrink-0 overflow-hidden">
              <img src={msg.avatar} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-1">
                {msg.badge && <span className="text-xs">{msg.badge}</span>}
                <span className={`text-xs font-semibold ${msg.isOwner ? 'text-yellow-400' : msg.isModerator ? 'text-green-400' : 'text-gray-300'}`}>
                  {msg.author}
                </span>
                {msg.donation && (
                  <span className="text-xs bg-yellow-600 text-white px-1.5 py-0.5 rounded-full font-bold ml-1">
                    ${msg.donation.amount}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-200 break-words">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Paused Indicator */}
      {state.isPaused && (
        <div className="px-4 py-1 bg-yellow-900/30 text-center">
          <span className="text-yellow-400 text-xs">Chat paused - click resume to see new messages</span>
        </div>
      )}

      {/* Emote Picker */}
      {state.emotePickerOpen && (
        <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 grid grid-cols-6 gap-2">
          {EMOTES.map(emote => (
            <button key={emote} onClick={() => addEmote(emote)} className="text-xl hover:bg-gray-700 rounded p-1 transition-colors">
              {emote}
            </button>
          ))}
        </div>
      )}

      {/* Donation Amount */}
      {state.donationMode && (
        <div className="px-4 py-2 bg-yellow-900/20 border-t border-yellow-800/50 flex items-center space-x-2">
          <span className="text-yellow-400 text-sm">$</span>
          <input
            type="number"
            value={state.donationAmount}
            onChange={(e) => setState(prev => ({ ...prev, donationAmount: e.target.value }))}
            placeholder="Amount"
            min="1"
            className="flex-1 bg-gray-800 text-white rounded px-3 py-1.5 text-sm outline-none"
          />
          <button onClick={() => setState(prev => ({ ...prev, donationMode: false }))} className="text-gray-400 text-sm">Cancel</button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-700 flex items-center space-x-2">
        <button
          onClick={() => setState(prev => ({ ...prev, emotePickerOpen: !prev.emotePickerOpen }))}
          className="text-gray-400 hover:text-white p-1"
        >
          😊
        </button>
        <input
          type="text"
          value={state.inputText}
          onChange={(e) => setState(prev => ({ ...prev, inputText: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={state.slowMode ? `Slow mode (${state.slowModeDelay}s)` : 'Say something...'}
          className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => setState(prev => ({ ...prev, donationMode: !prev.donationMode }))}
          className="text-yellow-400 hover:text-yellow-300 p-1"
        >
          💰
        </button>
        <button onClick={sendMessage} disabled={!state.inputText.trim()} className="px-3 py-1.5 bg-blue-600 text-white rounded-full text-sm hover:bg-blue-700 disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
};

export default LiveStreamChat;
