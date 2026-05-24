// ============================================================================
// Shared UI - Chat Bubble Component
// ============================================================================

import React from 'react';

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
        <div className={`text-xs px-3 py-1 mb-1 rounded border-l-2 ${isSelf ? 'border-blue-300 bg-blue-500/20 text-blue-100' : 'border-gray-400 bg-gray-200 text-gray-600'} max-w-xs`}>
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
          {isEdited && <span className={`text-xs ${isSelf ? 'text-blue-200' : 'text-gray-400'}`}>edited</span>}
          {isSelf && status && (
            <span className={`text-xs ${status === 'read' ? 'text-blue-200' : 'text-blue-300'}`}>
              {statusIcons[status]}
            </span>
          )}
        </div>
        {/* Action buttons on hover */}
        <div className="absolute top-0 right-0 -mt-2 -mr-2 hidden group-hover:flex gap-1">
          {onReply && (
            <button onClick={onReply} className="p-1 bg-white rounded-full shadow text-gray-500 hover:text-gray-700 text-xs">
              \u21A9
            </button>
          )}
          {onReact && (
            <button onClick={() => onReact('\u2764\uFE0F')} className="p-1 bg-white rounded-full shadow text-gray-500 hover:text-gray-700 text-xs">
              +
            </button>
          )}
        </div>
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
