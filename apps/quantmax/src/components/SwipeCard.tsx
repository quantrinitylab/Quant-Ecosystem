// ============================================================================
// QuantMax - Swipe Card Component
// Tinder-style swipe card with animation support
// ============================================================================

import type { UserProfile, MatchAction } from '../types';

interface SwipeCardProps {
  profile: UserProfile;
  onSwipe: (action: MatchAction) => void;
  onViewDetails: () => void;
  swipeDirection: 'left' | 'right' | 'up' | null;
  isAnimating: boolean;
}

export function SwipeCard({ profile, onSwipe, onViewDetails, swipeDirection, isAnimating }: SwipeCardProps) {
  const getSwipeStyle = () => {
    if (!swipeDirection || !isAnimating) return {};
    const rotations = { left: -15, right: 15, up: 0 };
    const offsets = { left: -500, right: 500, up: 0 };
    return { transform: `translateX(${offsets[swipeDirection]}px) rotate(${rotations[swipeDirection]}deg)`, opacity: 0, transition: 'all 0.3s ease-out' };
  };

  return {
    type: 'div',
    className: 'swipe-card',
    style: getSwipeStyle(),
    children: [
      { type: 'div', className: 'card-image', style: { backgroundImage: `url(${profile.photos[0]?.url || profile.avatarUrl})` }, children: [
        // Swipe indicators
        swipeDirection === 'right' ? { type: 'div', className: 'like-indicator', text: 'LIKE' } : null,
        swipeDirection === 'left' ? { type: 'div', className: 'nope-indicator', text: 'NOPE' } : null,
        swipeDirection === 'up' ? { type: 'div', className: 'super-indicator', text: 'SUPER LIKE' } : null,
        // Verification badge
        profile.verified === 'verified' ? { type: 'div', className: 'verified-badge' } : null,
      ]},
      { type: 'div', className: 'card-content', onClick: onViewDetails, children: [
        { type: 'h2', text: `${profile.displayName}, ${profile.age}` },
        profile.job ? { type: 'p', className: 'job', text: profile.job } : null,
        { type: 'p', className: 'distance', text: `${profile.location.city}` },
        { type: 'div', className: 'interests-preview', children: profile.interests.slice(0, 4).map(i => ({ type: 'span', className: 'tag', text: i })) },
      ]},
      // Swipe action buttons
      { type: 'div', className: 'card-actions', children: [
        { type: 'button', className: 'btn-pass', onClick: () => onSwipe('pass'), children: [{ type: 'span', text: 'X' }] },
        { type: 'button', className: 'btn-superlike', onClick: () => onSwipe('superlike'), children: [{ type: 'span', text: '*' }] },
        { type: 'button', className: 'btn-like', onClick: () => onSwipe('like'), children: [{ type: 'span', text: 'H' }] },
      ]},
    ],
  };
}

export default SwipeCard;
