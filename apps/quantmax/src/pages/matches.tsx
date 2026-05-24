// ============================================================================
// QuantMax - Matches Page (Conversations and match list)
// ============================================================================

import type { Match, Message, UserProfile } from '../types';

interface MatchesPageProps {
  matches: Match[];
  conversations: Map<string, Message[]>;
  onOpenChat: (matchId: string) => void;
  onUnmatch: (matchId: string) => void;
}

export function MatchesPage({ matches, conversations, onOpenChat, onUnmatch }: MatchesPageProps) {
  const newMatches = matches.filter(m => !m.lastMessage);
  const activeChats = matches.filter(m => m.lastMessage);

  return {
    type: 'div',
    className: 'matches-page',
    children: [
      { type: 'h1', text: 'Messages' },
      newMatches.length > 0 ? { type: 'section', className: 'new-matches', children: [
        { type: 'h2', text: 'New Matches' },
        { type: 'div', className: 'matches-carousel', children: newMatches.map(match => ({
          type: 'div', className: 'match-avatar', onClick: () => onOpenChat(match.id), children: [
            { type: 'div', className: 'avatar-ring' },
            { type: 'span', text: `${match.compatibility}%` },
            match.type === 'superlike' ? { type: 'span', className: 'superlike-badge', text: 'Super' } : null,
          ],
        }))},
      ]} : null,
      { type: 'section', className: 'conversations', children: [
        { type: 'h2', text: 'Conversations' },
        ...activeChats.map(match => ({
          type: 'div', className: 'conversation-item', onClick: () => onOpenChat(match.id), children: [
            { type: 'div', className: 'avatar' },
            { type: 'div', className: 'chat-preview', children: [
              { type: 'span', text: match.lastMessage?.content || match.icebreaker || 'Start chatting!', className: 'last-msg' },
              { type: 'span', text: match.lastMessage?.createdAt || match.matchedAt, className: 'time' },
            ]},
            match.unreadCount > 0 ? { type: 'span', className: 'unread-badge', text: String(match.unreadCount) } : null,
          ],
        })),
      ]},
    ],
  };
}

export default MatchesPage;
