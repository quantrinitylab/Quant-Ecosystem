// ============================================================================
// QuantTube - LiveChat Component
// Real-time live stream chat with super chats and moderation
// ============================================================================

import { useState } from 'react';
import type { ChatMessage } from '../types';

interface LiveChatProps {
  messages: ChatMessage[];
  streamId: string;
  isConnected: boolean;
  viewerCount: number;
  onSendMessage: (message: string) => void;
  onSuperChat: (message: string, amount: number) => void;
}

export function LiveChat({
  messages,
  // TODO: wire up handler
  streamId: _streamId,
  isConnected,
  viewerCount,
  onSendMessage,
  onSuperChat,
}: LiveChatProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onSendMessage(trimmed);
      setInputValue('');
    }
  };

  const handleSuperChat = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onSuperChat(trimmed, 5);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-700"
      aria-label="Live chat"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-white">Live Chat</h3>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}
            aria-label={isConnected ? 'Connected' : 'Reconnecting'}
          >
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`}
            />
            {isConnected ? 'Connected' : 'Reconnecting...'}
          </span>
          <span className="text-xs text-gray-400" aria-label={`${viewerCount} viewers`}>
            {viewerCount} watching
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.slice(-100).map((msg) => (
          <ChatMessageItem key={msg.id} msg={msg} />
        ))}
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          className="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-800 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          aria-label="Chat message input"
        />
        <button
          type="button"
          onClick={handleSend}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors min-w-[44px] min-h-[44px]"
          aria-label="Send message"
        >
          Send
        </button>
        <button
          type="button"
          onClick={handleSuperChat}
          className="px-3 py-2 text-sm font-medium text-white bg-yellow-600 rounded hover:bg-yellow-700 transition-colors min-w-[44px] min-h-[44px]"
          aria-label="Send super chat"
        >
          $ Super Chat
        </button>
      </div>
    </div>
  );
}

function ChatMessageItem({ msg }: { msg: ChatMessage }) {
  return (
    <div
      className={`flex items-start gap-1.5 text-sm ${msg.type === 'superchat' ? 'bg-yellow-900/30 px-2 py-1 rounded' : ''} ${msg.type === 'membership' ? 'bg-green-900/30 px-2 py-1 rounded' : ''} ${msg.type === 'system' ? 'text-gray-500 italic' : ''}`}
      data-id={msg.id}
    >
      {msg.type === 'superchat' && msg.amount != null && (
        <span className="inline-flex items-center px-1.5 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded flex-shrink-0">
          ${msg.amount}
        </span>
      )}
      <span className="font-medium text-blue-400 flex-shrink-0">{msg.username}</span>
      <span className="text-gray-200 break-words min-w-0">{msg.message}</span>
      <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
        {new Date(msg.timestamp).toLocaleTimeString()}
      </span>
    </div>
  );
}

export default LiveChat;
