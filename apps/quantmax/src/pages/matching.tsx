// ============================================================================
// QuantMax - Matching Page (Tinder-style swipe interface)
// ============================================================================

import type { UserProfile, MatchAction } from '../types';

interface MatchingPageProps {
  profiles: UserProfile[];
  currentIndex: number;
  onSwipe: (action: MatchAction) => void;
  onViewProfile: (userId: string) => void;
}

export function MatchingPage({ profiles, currentIndex, onSwipe, onViewProfile }: MatchingPageProps) {
  const currentProfile = profiles[currentIndex];
  if (!currentProfile) return { type: 'div', className: 'no-more', children: [{ type: 'h2', text: 'No more profiles' }, { type: 'p', text: 'Check back later for new people near you' }] };

  return {
    type: 'div',
    className: 'matching-page',
    children: [
      { type: 'div', className: 'card-stack', children: [
        { type: 'div', className: 'profile-card', onClick: () => onViewProfile(currentProfile.id), children: [
          { type: 'div', className: 'card-photos', children: [
            { type: 'img', src: currentProfile.photos[0]?.url || currentProfile.avatarUrl, className: 'main-photo' },
            currentProfile.verified === 'verified' ? { type: 'span', className: 'verified-badge', text: 'Verified' } : null,
          ]},
          { type: 'div', className: 'card-info', children: [
            { type: 'h2', children: [
              { type: 'span', text: currentProfile.displayName },
              { type: 'span', text: `, ${currentProfile.age}`, className: 'age' },
            ]},
            { type: 'p', text: currentProfile.bio, className: 'bio' },
            currentProfile.job ? { type: 'div', className: 'detail', children: [
              { type: 'span', className: 'icon-job' },
              { type: 'span', text: `${currentProfile.job}${currentProfile.company ? ` at ${currentProfile.company}` : ''}` },
            ]} : null,
            { type: 'div', className: 'interests', children: currentProfile.interests.slice(0, 5).map(i => ({ type: 'span', className: 'interest-tag', text: i })) },
            currentProfile.prompts.length > 0 ? { type: 'div', className: 'prompt', children: [
              { type: 'h4', text: currentProfile.prompts[0].question },
              { type: 'p', text: currentProfile.prompts[0].answer },
            ]} : null,
          ]},
        ]},
      ]},
      { type: 'div', className: 'swipe-actions', children: [
        { type: 'button', className: 'action-btn pass', onClick: () => onSwipe('pass'), children: [{ type: 'span', text: 'X' }] },
        { type: 'button', className: 'action-btn superlike', onClick: () => onSwipe('superlike'), children: [{ type: 'span', text: 'Star' }] },
        { type: 'button', className: 'action-btn like', onClick: () => onSwipe('like'), children: [{ type: 'span', text: 'Heart' }] },
      ]},
    ],
  };
}

export default MatchingPage;
