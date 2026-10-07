// ============================================================================
// QuantChat - Message Reactions Component
// Emoji reactions display under messages with add/remove functionality
// ============================================================================

import React from 'react';
import type { ReactionSummary } from '../services/reactions.service';

export interface MessageReactionsProps {
  reactions: ReactionSummary[];
  onReact: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  currentUserId: string;
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  reactions,
  onReact,
  onRemoveReaction,
  currentUserId,
}) => {
  if (reactions.length === 0) {
    return null;
  }

  const handleClick = (reaction: ReactionSummary) => {
    if (reaction.hasReacted) {
      onRemoveReaction(reaction.emoji);
    } else {
      onReact(reaction.emoji);
    }
  };

  return (
    <div className="message-reactions" role="group" aria-label="Message reactions">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          className={`reaction-badge ${reaction.hasReacted ? 'reacted' : ''}`}
          onClick={() => handleClick(reaction)}
          title={`${reaction.users.join(', ')} reacted with ${reaction.emoji}`}
          aria-pressed={reaction.hasReacted}
          data-user={currentUserId}
        >
          <span className="reaction-emoji">{reaction.emoji}</span>
          <span className="reaction-count">{reaction.count}</span>
        </button>
      ))}
      <button className="add-reaction-btn" onClick={() => onReact('+')} aria-label="Add reaction">
        +
      </button>
    </div>
  );
};

export default MessageReactions;
