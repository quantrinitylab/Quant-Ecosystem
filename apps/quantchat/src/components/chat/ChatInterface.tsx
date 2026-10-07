import React, { useState } from 'react';
import { AudioWaveformMessage } from '../voice/AudioWaveformMessage';

export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type MessageType = 'text' | 'voice' | 'image' | 'video';

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  status: MessageStatus;
  isOwn: boolean;
  type: MessageType;
  audioUrl?: string;
}

export interface ChatInterfaceProps {
  messages: ChatMessage[];
  pinnedMessage?: ChatMessage;
  onUnpin?: (messageId: string) => void;
  isAdmin?: boolean;
  initialPollOpen?: boolean;
  initialArcadeOpen?: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  pinnedMessage,
  onUnpin,
  isAdmin = false,
  initialPollOpen = false,
  initialArcadeOpen = false,
}) => {
  const [isPollOpen, setIsPollOpen] = useState(initialPollOpen);
  const [isArcadeOpen, setIsArcadeOpen] = useState(initialArcadeOpen);

  const getStatusIcon = (status: MessageStatus) => {
    switch (status) {
      case 'sent':
        return (
          <span className="text-gray-400" data-testid="status-sent">
            ✓
          </span>
        );
      case 'delivered':
        return (
          <span className="text-gray-400" data-testid="status-delivered">
            ✓✓
          </span>
        );
      case 'seen':
        return (
          <span className="text-emerald-500" data-testid="status-seen">
            ✓✓
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <div
          className="absolute top-0 left-0 right-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-2 flex items-center justify-between shadow-sm cursor-pointer"
          data-testid="pinned-message-banner"
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMessage.id}`);
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <div className="flex items-center space-x-2 text-sm text-gray-700">
            <span>📌</span>
            <span className="font-medium">Pinned Message:</span>
            <span className="truncate max-w-xs italic text-gray-500">
              "{pinnedMessage.content}"
            </span>
          </div>
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnpin?.(pinnedMessage.id);
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              data-testid="unpin-button"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 mt-12 pb-20">
        {messages.map((msg) => (
          <div
            key={msg.id}
            id={`msg-${msg.id}`}
            className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
            data-testid={`message-${msg.id}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 relative ${msg.isOwn ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'}`}
            >
              {/* Message Content */}
              {msg.type === 'voice' || msg.audioUrl ? (
                <div data-testid="audio-waveform-container">
                  <AudioWaveformMessage
                    audioUrl={msg.audioUrl || ''}
                    id={msg.id}
                    durationSeconds={0}
                  />
                </div>
              ) : (
                <div className="break-words">{msg.content}</div>
              )}

              {/* Message Footer (Timestamp & Status) */}
              <div
                className={`flex items-center justify-end space-x-1 mt-1 text-[10px] ${msg.isOwn ? 'text-blue-100' : 'text-gray-500'}`}
              >
                <span>{msg.timestamp}</span>
                {msg.isOwn && getStatusIcon(msg.status)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex items-center space-x-2">
        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          😊
        </button>
        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          📎
        </button>

        {/* Poll Button */}
        <button
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
          onClick={() => setIsPollOpen(true)}
          data-testid="poll-button"
          title="Create Poll"
        >
          📊
        </button>

        {/* Arcade Button */}
        <button
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
          onClick={() => setIsArcadeOpen(true)}
          data-testid="arcade-button"
          title="Play Arcade Game"
        >
          🎮
        </button>

        <div className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-400">
          Type a message...
        </div>

        <button className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors">
          ➤
        </button>
      </div>

      {/* Modals/Pickers */}
      {isPollOpen && (
        <div
          className="absolute bottom-16 left-4 bg-white shadow-xl border border-gray-200 rounded-xl p-4 w-64 z-20"
          data-testid="poll-dialog"
        >
          <h3 className="font-bold mb-2">Create Poll</h3>
          <input
            type="text"
            placeholder="Question..."
            className="w-full border rounded p-1 mb-2 text-sm"
          />
          <input
            type="text"
            placeholder="Option 1..."
            className="w-full border rounded p-1 mb-2 text-sm"
          />
          <input
            type="text"
            placeholder="Option 2..."
            className="w-full border rounded p-1 mb-2 text-sm"
          />
          <div className="flex justify-end space-x-2 mt-2">
            <button className="text-sm text-gray-500" onClick={() => setIsPollOpen(false)}>
              Cancel
            </button>
            <button className="text-sm text-blue-500 font-medium">Send</button>
          </div>
        </div>
      )}

      {isArcadeOpen && (
        <div
          className="absolute bottom-16 left-16 bg-white shadow-xl border border-gray-200 rounded-xl p-4 w-64 z-20"
          data-testid="arcade-game-picker"
        >
          <h3 className="font-bold mb-3 flex items-center gap-2">🎮 Arcade Matchmaking</h3>
          <div className="space-y-2">
            <button className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded border transition-colors flex items-center justify-between">
              <span>TicTacToe Minimax</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 rounded-full">Bot</span>
            </button>
            <button className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded border transition-colors flex items-center justify-between">
              <span>Coin Wager Duel</span>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 rounded-full">PvP</span>
            </button>
          </div>
          <button
            className="w-full mt-3 text-sm text-gray-500 text-center"
            onClick={() => setIsArcadeOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
