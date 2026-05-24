// ============================================================================
// QuantMax - Match Profile Component
// ============================================================================

import type { UserProfile } from '../types';

interface MatchProfileProps {
  profile: UserProfile;
  compatibility: number;
  onMessage: () => void;
  onUnmatch: () => void;
}

export function MatchProfile({ profile, compatibility, onMessage, onUnmatch }: MatchProfileProps) {
  return {
    type: 'div',
    className: 'match-profile',
    children: [
      { type: 'div', className: 'compatibility-score', children: [
        { type: 'span', text: `${compatibility}% Compatible` },
      ]},
      { type: 'img', src: profile.photos[0]?.url || profile.avatarUrl, className: 'profile-photo' },
      { type: 'h2', text: `${profile.displayName}, ${profile.age}` },
      { type: 'p', text: profile.bio },
      { type: 'div', className: 'actions', children: [
        { type: 'button', text: 'Message', onClick: onMessage, className: 'btn-primary' },
        { type: 'button', text: 'Unmatch', onClick: onUnmatch, className: 'btn-danger' },
      ]},
    ],
  };
}

export default MatchProfile;
