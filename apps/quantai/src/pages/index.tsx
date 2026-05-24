// ============================================================================
// QuantAI - AI Assistant Chat Page
// ============================================================================

import type { Conversation, ConversationMessage } from '../types';

interface AssistantPageProps { conversations: Conversation[]; activeConversation: Conversation | null; isProcessing: boolean; onSendMessage: (message: string, attachments?: any[]) => void; onNewConversation: () => void; onSelectConversation: (id: string) => void; onDeleteConversation: (id: string) => void; }

export function AssistantPage({ conversations, activeConversation, isProcessing, onSendMessage, onNewConversation, onSelectConversation, onDeleteConversation }: AssistantPageProps) {
  return { type: 'div', className: 'assistant-page', children: [
    { type: 'aside', className: 'sidebar', children: [
      { type: 'button', text: '+ New Chat', onClick: onNewConversation, className: 'btn-new' },
      { type: 'div', className: 'conversation-list', children: conversations.map(c => ({
        type: 'div', className: `conv-item ${activeConversation?.id === c.id ? 'active' : ''}`, onClick: () => onSelectConversation(c.id), children: [
          { type: 'span', text: c.title },
          { type: 'small', text: new Date(c.updatedAt).toLocaleDateString() },
          { type: 'button', text: 'x', onClick: (e: any) => { e.stopPropagation(); onDeleteConversation(c.id); } },
        ],
      }))},
    ]},
    { type: 'main', className: 'chat-area', children: [
      { type: 'div', className: 'messages', children: activeConversation?.messages.map(msg => ({
        type: 'div', className: `message ${msg.role}`, children: [
          { type: 'div', className: 'message-content', text: msg.content },
          msg.toolCalls ? { type: 'div', className: 'tool-calls', children: msg.toolCalls.map(tc => ({ type: 'span', className: 'tool-badge', text: tc.name })) } : null,
          { type: 'small', text: `${msg.metadata.model || ''} - ${msg.metadata.latency}ms` },
        ],
      })) || [{ type: 'div', className: 'empty-state', children: [{ type: 'h2', text: 'QuantAI Assistant' }, { type: 'p', text: 'Ask me anything, control your devices, or automate tasks.' }] }] },
      isProcessing ? { type: 'div', className: 'typing', text: 'AI is thinking...' } : null,
      { type: 'div', className: 'input-area', children: [
        { type: 'input', placeholder: 'Message QuantAI...', className: 'chat-input' },
        { type: 'button', text: 'Send', className: 'send-btn' },
      ]},
    ]},
  ]};
}

export default AssistantPage;
