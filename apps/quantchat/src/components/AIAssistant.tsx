// ============================================================================
// QuantChat - AIAssistant Component
// AI chat assistant overlay with translation, smart replies, moderation
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import type { AIChatMessage, SmartReply } from '../types';
import { apiClient } from '../services/api-client';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onSmartReplySelect?: (reply: string) => void;
  contextMessage?: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  isOpen, onClose, onSmartReplySelect, contextMessage,
}) => {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'translate' | 'replies'>('chat');
  const [translateText, setTranslateText] = useState(contextMessage || '');
  const [targetLang, setTargetLang] = useState('es');
  const [translatedText, setTranslatedText] = useState('');
  const [smartReplies, setSmartReplies] = useState<SmartReply[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && contextMessage) {
      loadSmartReplies(contextMessage);
    }
  }, [isOpen, contextMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSmartReplies = async (message: string) => {
    const response = await apiClient.getSmartReplies(message);
    if (response.success && response.data) {
      setSmartReplies(response.data);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: AIChatMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const response = await apiClient.chatWithAI(input);
    if (response.success && response.data) {
      const aiMessage: AIChatMessage = { role: 'assistant', content: response.data.response, timestamp: new Date() };
      setMessages(prev => [...prev, aiMessage]);
    }
    setLoading(false);
  };

  const handleTranslate = async () => {
    if (!translateText.trim()) return;
    setLoading(true);

    const response = await apiClient.translateMessage(translateText, targetLang);
    if (response.success && response.data) {
      setTranslatedText(response.data.translatedText);
    }
    setLoading(false);
  };

  const languages = [
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ru', name: 'Russian' },
  ];

  if (!isOpen) return null;

  return (
    <div className="ai-assistant-overlay">
      <div className="ai-assistant-panel">
        {/* Header */}
        <div className="ai-header">
          <h3>AI Assistant</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="ai-tabs">
          <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
            💬 Chat
          </button>
          <button className={activeTab === 'translate' ? 'active' : ''} onClick={() => setActiveTab('translate')}>
            🌐 Translate
          </button>
          <button className={activeTab === 'replies' ? 'active' : ''} onClick={() => setActiveTab('replies')}>
            ⚡ Replies
          </button>
        </div>

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="ai-chat">
            <div className="ai-messages">
              {messages.length === 0 && (
                <div className="ai-welcome">
                  <p>Hi! I am your QuantChat AI assistant.</p>
                  <p>Ask me anything about filters, streaks, or get help with messages.</p>
                  <div className="suggestion-chips">
                    <button onClick={() => setInput('Help me find a filter')}>Find a filter</button>
                    <button onClick={() => setInput('How do streaks work?')}>About streaks</button>
                    <button onClick={() => setInput('Generate a caption')}>Generate caption</button>
                  </div>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`ai-message ${msg.role}`}>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))}
              {loading && <div className="ai-message assistant typing">Thinking...</div>}
              <div ref={messagesEndRef} />
            </div>
            <div className="ai-input">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask AI anything..."
              />
              <button onClick={handleSendMessage} disabled={!input.trim() || loading}>Send</button>
            </div>
          </div>
        )}

        {/* Translate Tab */}
        {activeTab === 'translate' && (
          <div className="ai-translate">
            <div className="translate-input">
              <textarea
                value={translateText}
                onChange={(e) => setTranslateText(e.target.value)}
                placeholder="Enter text to translate..."
                rows={4}
              />
            </div>
            <div className="translate-controls">
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                {languages.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <button onClick={handleTranslate} disabled={loading || !translateText.trim()}>
                {loading ? 'Translating...' : 'Translate'}
              </button>
            </div>
            {translatedText && (
              <div className="translate-result">
                <p>{translatedText}</p>
                <button onClick={() => { if (onSmartReplySelect) onSmartReplySelect(translatedText); }}>
                  Use Translation
                </button>
              </div>
            )}
          </div>
        )}

        {/* Smart Replies Tab */}
        {activeTab === 'replies' && (
          <div className="ai-replies">
            <p className="context-info">
              {contextMessage ? `Suggested replies for: "${contextMessage.substring(0, 50)}..."` : 'Send a message to get smart reply suggestions'}
            </p>
            <div className="replies-list">
              {smartReplies.map(reply => (
                <button
                  key={reply.id}
                  className="reply-option"
                  onClick={() => { if (onSmartReplySelect) onSmartReplySelect(reply.text); }}
                >
                  <span className="reply-text">{reply.text}</span>
                  <span className="reply-tone">{reply.tone}</span>
                  <span className="reply-confidence">{Math.round(reply.confidence * 100)}%</span>
                </button>
              ))}
              {smartReplies.length === 0 && (
                <p className="no-replies">No suggestions available. Start a conversation to get smart replies.</p>
              )}
            </div>
            {contextMessage && (
              <button className="refresh-btn" onClick={() => loadSmartReplies(contextMessage)}>
                Refresh Suggestions
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistant;
