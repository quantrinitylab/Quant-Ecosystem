// ============================================================================
// QuantMail - AI Assistant Component
// AI sidebar for email/code assistance
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { Quanty } from './Quanty';

export interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onCompose: (instructions: string, tone: string) => Promise<{ subject: string; body: string }>;
  onSummarize: (text: string) => Promise<string>;
  onSuggestReplies: (emailContent: string) => Promise<string[]>;
  onCategorize: (emailIds: string[]) => Promise<Array<{ emailId: string; category: string }>>;
  onAsk: (question: string, context?: string) => Promise<string>;
  currentContext?: { type: 'email' | 'code' | 'general'; content?: string; emailId?: string };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: string;
}

export function AIAssistant(props: AIAssistantProps): React.ReactElement {
  const { isOpen, onClose, onCompose, onSummarize, onSuggestReplies, onAsk, currentContext } =
    props;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        'Hi! I am Quanty — your QuantAI assistant. I can help you compose emails, summarize threads, suggest replies, and answer questions about your inbox or code.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [quickActions, setQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (role: 'user' | 'assistant', content: string, action?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date(),
        action,
      },
    ]);
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setIsProcessing(true);

    try {
      // Detect intent and route to appropriate handler
      const lower = userMessage.toLowerCase();
      if (lower.includes('compose') || lower.includes('write') || lower.includes('draft')) {
        const result = await onCompose(userMessage, 'professional');
        addMessage(
          'assistant',
          `Here is a draft:\n\nSubject: ${result.subject}\n\n${result.body}`,
          'compose',
        );
      } else if (lower.includes('summarize') || lower.includes('summary')) {
        const summary = await onSummarize(currentContext?.content || userMessage);
        addMessage('assistant', `Summary: ${summary}`, 'summarize');
      } else if (lower.includes('reply') || lower.includes('respond')) {
        if (currentContext?.content) {
          const suggestions = await onSuggestReplies(currentContext.content);
          addMessage(
            'assistant',
            `Here are some reply options:\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n\n')}`,
            'suggest_replies',
          );
        } else {
          addMessage(
            'assistant',
            'Please select an email first so I can suggest appropriate replies.',
          );
        }
      } else {
        const response = await onAsk(userMessage, currentContext?.content);
        addMessage('assistant', response);
      }
    } catch (error) {
      addMessage(
        'assistant',
        'Sorry, I encountered an error processing your request. Please try again.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAction = async (action: string) => {
    setIsProcessing(true);
    setQuickActions(false);

    try {
      switch (action) {
        case 'summarize':
          addMessage('user', 'Summarize this email');
          if (currentContext?.content) {
            const summary = await onSummarize(currentContext.content);
            addMessage('assistant', summary, 'summarize');
          } else {
            addMessage('assistant', 'Please select an email to summarize.');
          }
          break;
        case 'replies':
          addMessage('user', 'Suggest replies');
          if (currentContext?.content) {
            const replies = await onSuggestReplies(currentContext.content);
            addMessage(
              'assistant',
              `Suggested replies:\n\n${replies.map((r, i) => `${i + 1}. "${r}"`).join('\n\n')}`,
              'suggest_replies',
            );
          } else {
            addMessage('assistant', 'Please select an email to get reply suggestions.');
          }
          break;
        case 'compose':
          addMessage('user', 'Help me compose an email');
          addMessage(
            'assistant',
            'Sure! What would you like the email to be about? You can tell me the recipient, topic, and desired tone.',
          );
          break;
        case 'prioritize':
          addMessage('user', 'Prioritize my inbox');
          addMessage(
            'assistant',
            'I can analyze your unread emails and sort them by priority. This helps you focus on what matters most. Would you like me to proceed?',
          );
          break;
      }
    } catch {
      addMessage('assistant', 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return <></>;

  return (
    <div className="ai-assistant">
      {/* Header */}
      <div className="ai-header">
        <div className="ai-title">
          <Quanty expression={isProcessing ? 'thinking' : 'idle'} size={36} />
          <h3>Quanty</h3>
        </div>
        <button className="btn-icon" onClick={onClose}>
          X
        </button>
      </div>

      {/* Context indicator */}
      {currentContext && (
        <div className="ai-context">
          <span className="context-type">{currentContext.type}</span>
          {currentContext.emailId && <span className="context-id">Email selected</span>}
        </div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-message ai-message-${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'assistant' ? <Quanty size={26} /> : 'You'}
            </div>
            <div className="message-content">
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              <span className="message-time">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="ai-message ai-message-assistant">
            <div className="message-avatar">
              <Quanty size={26} expression="thinking" />
            </div>
            <div className="message-content typing">
              <span className="typing-dots">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {quickActions && messages.length <= 1 && (
        <div className="ai-quick-actions">
          <button className="quick-action" onClick={() => handleQuickAction('summarize')}>
            Summarize email
          </button>
          <button className="quick-action" onClick={() => handleQuickAction('replies')}>
            Suggest replies
          </button>
          <button className="quick-action" onClick={() => handleQuickAction('compose')}>
            Compose email
          </button>
          <button className="quick-action" onClick={() => handleQuickAction('prioritize')}>
            Prioritize inbox
          </button>
        </div>
      )}

      {/* Input */}
      <div className="ai-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Quanty anything..."
          rows={2}
          disabled={isProcessing}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default AIAssistant;
