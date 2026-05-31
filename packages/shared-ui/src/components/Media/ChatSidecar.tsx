'use client';
// ============================================================================
// Shared UI - ChatSidecar Component
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Room, RoomEvent } from 'livekit-client';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
}

export interface ChatSidecarProps {
  room: Room;
  localParticipantName?: string;
  className?: string;
}

export const ChatSidecar: React.FC<ChatSidecarProps> = ({
  room,
  localParticipantName = 'You',
  className = '',
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const decoder = useRef(new TextDecoder());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleDataReceived = (
      payload: Uint8Array,
      participant: { identity: string; name?: string } | undefined,
    ) => {
      try {
        const text = decoder.current.decode(payload);
        const parsed = JSON.parse(text);
        if (parsed.type === 'chat') {
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              sender: participant?.name || participant?.identity || 'Unknown',
              content: parsed.message,
              timestamp: Date.now(),
            },
          ]);
        }
      } catch {
        // ignore non-chat messages
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  const sendMessage = useCallback(() => {
    if (!input.trim()) return;

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ type: 'chat', message: input.trim() }));
    room.localParticipant.publishData(data, { reliable: true });

    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sender: localParticipantName,
        content: input.trim(),
        timestamp: Date.now(),
      },
    ]);
    setInput('');
  }, [room, input, localParticipantName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-white border-l border-gray-200 ${className}`}
      data-testid="chat-sidecar"
    >
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            <span className="font-medium text-gray-900">{msg.sender}</span>
            <p className="text-gray-700 mt-0.5">{msg.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            data-testid="chat-input"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
            data-testid="chat-send"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
