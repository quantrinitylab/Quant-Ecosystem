// ============================================================================
// QuantTube - Live Stream Chat Component
// Real-time chat with donations, pinned messages, slow mode, emotes
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api-client';

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
  isPaused: boolean;
  lastSendTime: number;
  sendError: string | null;
}

const EMOTES = ['🎉', '🔥', '❤️', '😂', '👏', '💯', '🎮', '💀', '😍', '🤔', '👀', '💪'];

const LiveStreamChat: React.FC<LiveStreamChatProps> = ({ streamId, isOwner, viewerCount }) => {
  const [state, setState] = useState<ChatState>({
    messages: [],
    inputText: '',
    pinnedMessage: null,
    slowMode: false,
    slowModeDelay: 5,
    emotePickerOpen: false,
    isPaused: false,
    lastSendTime: 0,
    sendError: null,
  });

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.isPaused && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.messages, state.isPaused]);

  const sendMessage = useCallback(async () => {
    if (!state.inputText.trim()) return;
    const now = Date.now();
    if (state.slowMode && now - state.lastSendTime < state.slowModeDelay * 1000) return;

    const text = state.inputText.trim();
    setState(prev => ({ ...prev, sendError: null }));

    // POST the message to the real live-chat backend. The message is only
    // shown locally after the backend accepts it — never simulated.
    let accepted = false;
    try {
      const response = await apiClient.sendChat(streamId, text);
      accepted = response.success === true;
    } catch {
      accepted = false;
    }

    if (!accepted) {
      setState(prev => ({ ...prev, sendError: 'Message not sent. Please try again.' }));
      return;
    }

    const newMsg: ChatMessage = {
      id: `my-${now}`,
      author: 'You',
      avatar: '/avatars/me.jpg',
      text,
      timestamp: new Date().toISOString(),
      isModerator: false,
      isOwner,
      donation: null,
      badge: isOwner ? '⭐' : null,
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMsg],
      inputText: '',
      lastSendTime: now,
    }));
  }, [streamId, state.inputText, state.slowMode, state.slowModeDelay, state.lastSendTime, isOwner]);

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
        {state.messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">No live chat yet</p>
          </div>
        )}
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

      {/* Send Error */}
      {state.sendError && (
        <div className="px-4 py-1 bg-red-900/30 text-center">
          <span className="text-red-400 text-xs">{state.sendError}</span>
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
        <button onClick={sendMessage} disabled={!state.inputText.trim()} className="px-3 py-1.5 bg-blue-600 text-white rounded-full text-sm hover:bg-blue-700 disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
};

export default LiveStreamChat;
