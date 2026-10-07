"use client";
// ============================================================================
// Shared UI - Chat Bubble Component
// ============================================================================

import React, { useState } from 'react';

export interface ChatBubbleProps {
  message: string;
  sender: 'self' | 'other';
  senderName?: string;
  avatarUrl?: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isEdited?: boolean;
  reactions?: { emoji: string; count: number }[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  replyTo?: { sender: string; message: string };
  className?: string;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onDelete?: () => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  sender,
  senderName,
  timestamp,
  status,
  isEdited = false,
  reactions,
  mediaUrl,
  mediaType,
  replyTo,
  className = '',
  onReact,
  onReply,
  onDelete,
}) => {
  const isSelf = sender === 'self';
  // P1 mobile fix: hover-only action buttons are unreachable on touch
  // devices. A tap-to-reveal (⋯) toggle shows them on coarse pointers.
  const [actionsOpen, setActionsOpen] = useState(false);
  const hasActions = Boolean(onReply || onReact || onDelete);

  const bubbleStyles = isSelf
    ? 'bg-blue-600 text-white ml-auto rounded-br-sm'
    : 'bg-gray-100 text-gray-900 mr-auto rounded-bl-sm';

  const statusIcons: Record<string, string> = {
    sending: '\u23F3',
    sent: '\u2713',
    delivered: '\u2713\u2713',
    read: '\u2713\u2713',
  };

  return (
    <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} mb-2 ${className}`}>
      {senderName && !isSelf && (
        <span className="text-xs text-gray-500 mb-1 ml-1">{senderName}</span>
      )}
      {replyTo && (
        <div
          className={`text-xs px-3 py-1 mb-1 rounded border-l-2 ${isSelf ? 'border-blue-300 bg-blue-500/20 text-blue-100' : 'border-gray-400 bg-gray-200 text-gray-600'} max-w-xs`}
        >
          <span className="font-medium">{replyTo.sender}</span>
          <p className="truncate">{replyTo.message}</p>
        </div>
      )}
      <div className={`group relative max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${bubbleStyles}`}>
        {mediaUrl && mediaType === 'image' && (
          <img src={mediaUrl} alt="Shared image" className="rounded-lg mb-2 max-w-full" />
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message}</p>
        <div className={`flex items-center gap-1 mt-1 ${isSelf ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-xs ${isSelf ? 'text-blue-200' : 'text-gray-400'}`}>
            {timestamp}
          </span>
          {isEdited && (
            <span className={`text-xs ${isSelf ? 'text-blue-200' : 'text-gray-400'}`}>edited</span>
          )}
          {isSelf && status && (
            // WhatsApp tick convention: sent/delivered = grey, read = blue.
            // Delivered grey #8696a0 and read blue #53bdeb are WhatsApp's exact
            // palette so the two states are instantly distinguishable.
            <span
              className={`text-xs ${status === 'read' ? 'text-[#53bdeb]' : 'text-[#8696a0]'}`}
              aria-label={`Message ${status}`}
              title={`Message ${status}`}
            >
              {statusIcons[status]}
            </span>
          )}
        </div>
        {/* Action buttons: hover-reveal on desktop, tap-to-reveal (⋯) on touch */}
        {hasActions && (
          <div className="absolute top-0 right-0 -mt-2 -mr-2 flex items-start gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActionsOpen((v) => !v);
              }}
              aria-label="Message actions"
              aria-expanded={actionsOpen}
              className="min-h-[44px] min-w-[44px] items-center justify-center bg-white rounded-full shadow text-gray-500 hover:text-gray-700 text-lg leading-none hidden [@media(pointer:fine)]:group-hover:flex [@media(pointer:coarse)]:flex"
            >
              \u22EF
            </button>
            <div
              className={`items-center gap-1 ${actionsOpen ? 'flex' : 'hidden'} [@media(pointer:fine)]:group-hover:flex`}
            >
              {onReply && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionsOpen(false);
                    onReply();
                  }}
                  aria-label="Reply to message"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-white rounded-full shadow text-gray-500 hover:text-gray-700 text-xs"
                >
                  \u21A9
                </button>
              )}
              {onReact && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionsOpen(false);
                    onReact('\u2764\uFE0F');
                  }}
                  aria-label="React to message"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-white rounded-full shadow text-gray-500 hover:text-gray-700 text-xs"
                >
                  +
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionsOpen(false);
                    onDelete();
                  }}
                  aria-label="Delete message"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-white rounded-full shadow text-gray-500 hover:text-red-600 text-xs"
                >
                  \u2715
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {reactions && reactions.length > 0 && (
        <div className="flex gap-1 mt-1">
          {reactions.map((r, i) => (
            <span key={i} className="text-xs bg-gray-100 rounded-full px-1.5 py-0.5">
              {r.emoji} {r.count > 1 && r.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
