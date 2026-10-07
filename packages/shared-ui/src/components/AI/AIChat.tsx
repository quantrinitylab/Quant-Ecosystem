'use client';

// ============================================================================
// Shared UI - AI Chat Component
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface AIChatProps {
  messages: AIChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  welcomeMessage?: string;
  modelName?: string;
  className?: string;
}

export const AIChat: React.FC<AIChatProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = 'Ask anything...',
  welcomeMessage = 'Hello! How can I help you today?',
  modelName = 'QuantAI',
  className = '',
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className={`flex flex-col h-full bg-gray-50 ${className}`}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4">
              <span className="text-2xl text-white font-bold">AI</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{modelName}</h2>
            <p className="text-gray-500 max-w-sm">{welcomeMessage}</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900 shadow-sm'}`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.isStreaming && (
                <span
                  className={`inline-block w-2 h-4 bg-current${prefersReducedMotion ? '' : ' animate-pulse'} ml-1`}
                />
              )}
              <span
                className={`block text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}
              >
                {msg.timestamp}
              </span>
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span
                  className={`w-2 h-2 bg-gray-400 rounded-full${prefersReducedMotion ? '' : ' animate-bounce'}`}
                  style={prefersReducedMotion ? undefined : { animationDelay: '0ms' }}
                />
                <span
                  className={`w-2 h-2 bg-gray-400 rounded-full${prefersReducedMotion ? '' : ' animate-bounce'}`}
                  style={prefersReducedMotion ? undefined : { animationDelay: '150ms' }}
                />
                <span
                  className={`w-2 h-2 bg-gray-400 rounded-full${prefersReducedMotion ? '' : ' animate-bounce'}`}
                  style={prefersReducedMotion ? undefined : { animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};
