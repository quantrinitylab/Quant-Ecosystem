// ============================================================================
// QuantAI - Chat Interface Component
// AI chat with multi-modal input, tool calls display
// ============================================================================

import type { ConversationMessage } from '../types';

interface ChatInterfaceProps { messages: ConversationMessage[]; isProcessing: boolean; onSend: (message: string) => void; onAttach: (type: string) => void; }

export function ChatInterface({ messages, isProcessing, onSend, onAttach }: ChatInterfaceProps) {
  return { type: 'div', className: 'chat-interface', children: [
    { type: 'div', className: 'message-list', children: messages.map(msg => ({
      type: 'div', className: `msg msg-${msg.role}`, children: [
        { type: 'div', className: 'msg-avatar', text: msg.role === 'user' ? 'U' : 'AI' },
        { type: 'div', className: 'msg-body', children: [
          { type: 'p', text: msg.content },
          msg.toolCalls ? { type: 'div', className: 'tools-used', children: msg.toolCalls.map(tc => ({ type: 'span', className: `tool-chip ${tc.status}`, text: `${tc.name} (${tc.status})` })) } : null,
          msg.attachments ? { type: 'div', className: 'attachments', children: msg.attachments.map(a => ({ type: 'span', text: a.name, className: 'attachment-chip' })) } : null,
          { type: 'span', className: 'msg-meta', text: `${msg.metadata.tokens} tokens | ${msg.metadata.latency}ms` },
        ]},
      ],
    }))},
    isProcessing ? { type: 'div', className: 'typing-indicator', children: [{ type: 'span' }, { type: 'span' }, { type: 'span' }] } : null,
    { type: 'div', className: 'input-bar', children: [
      { type: 'button', text: '+', onClick: () => onAttach('file'), className: 'attach-btn' },
      { type: 'button', text: 'Img', onClick: () => onAttach('image'), className: 'attach-btn' },
      { type: 'input', placeholder: 'Ask QuantAI anything...', className: 'msg-input' },
      { type: 'button', text: 'Send', className: 'send-btn' },
    ]},
  ]};
}

export default ChatInterface;
