// ============================================================================
// QuantMax - Profile Page
// ============================================================================

import type { UserProfile } from '../types';

interface ProfilePageProps {
  profile: UserProfile;
  isOwn: boolean;
  onEditProfile: () => void;
  onEditPhotos: () => void;
  onAddPrompt: () => void;
  onVerify: () => void;
}

export function ProfilePage({ profile, isOwn, onEditProfile, onEditPhotos, onAddPrompt, onVerify }: ProfilePageProps) {
  return {
    type: 'div',
    className: 'profile-page',
    children: [
      { type: 'div', className: 'profile-header', children: [
        { type: 'div', className: 'photos-carousel', children: profile.photos.map(photo => ({
          type: 'img', src: photo.url, className: `photo ${photo.isMain ? 'main' : ''}`,
        }))},
        { type: 'div', className: 'profile-info', children: [
          { type: 'h1', text: `${profile.displayName}, ${profile.age}` },
          profile.verified === 'verified' ? { type: 'span', className: 'verified', text: 'Verified' } : null,
          { type: 'p', text: profile.bio },
          profile.job ? { type: 'p', text: `${profile.job}${profile.company ? ` at ${profile.company}` : ''}` } : null,
          profile.education ? { type: 'p', text: profile.education } : null,
          { type: 'p', text: `${profile.location.city}, ${profile.location.country}` },
        ]},
      ]},
      { type: 'div', className: 'interests-section', children: [
        { type: 'h3', text: 'Interests' },
        { type: 'div', className: 'interests-grid', children: profile.interests.map(i => ({ type: 'span', className: 'interest-chip', text: i })) },
      ]},
      { type: 'div', className: 'prompts-section', children: [
        { type: 'h3', text: 'Prompts' },
        ...profile.prompts.map(p => ({
          type: 'div', className: 'prompt-card', children: [
            { type: 'h4', text: p.question },
            { type: 'p', text: p.answer },
          ],
        })),
        isOwn ? { type: 'button', text: '+ Add Prompt', onClick: onAddPrompt } : null,
      ]},
      { type: 'div', className: 'stats', children: [
        { type: 'span', text: `${profile.followers} followers` },
        { type: 'span', text: `${profile.following} following` },
        { type: 'span', text: `${profile.likes} likes` },
      ]},
      isOwn ? { type: 'div', className: 'profile-actions', children: [
        { type: 'button', text: 'Edit Profile', onClick: onEditProfile },
        { type: 'button', text: 'Edit Photos', onClick: onEditPhotos },
        profile.verified !== 'verified' ? { type: 'button', text: 'Get Verified', onClick: onVerify, className: 'btn-verify' } : null,
      ]} : null,
    ],
  };
}

export default ProfilePage;
