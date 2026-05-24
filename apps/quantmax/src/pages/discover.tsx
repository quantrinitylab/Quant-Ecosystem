// ============================================================================
// QuantMax - Discover Page
// ============================================================================

import type { UserProfile, LiveEvent, InterestGroup } from '../types';

interface DiscoverPageProps {
  nearbyPeople: UserProfile[];
  events: LiveEvent[];
  groups: InterestGroup[];
  onViewProfile: (userId: string) => void;
  onJoinEvent: (eventId: string) => void;
  onJoinGroup: (groupId: string) => void;
}

export function DiscoverPage({ nearbyPeople, events, groups, onViewProfile, onJoinEvent, onJoinGroup }: DiscoverPageProps) {
  return {
    type: 'div',
    className: 'discover-page',
    children: [
      { type: 'h1', text: 'Discover' },
      { type: 'section', children: [
        { type: 'h2', text: 'People Nearby' },
        { type: 'div', className: 'people-grid', children: nearbyPeople.map(p => ({
          type: 'div', className: 'person-card', onClick: () => onViewProfile(p.id), children: [
            { type: 'img', src: p.avatarUrl },
            { type: 'span', text: `${p.displayName}, ${p.age}` },
          ],
        }))},
      ]},
      { type: 'section', children: [
        { type: 'h2', text: 'Live Events' },
        { type: 'div', className: 'events-list', children: events.map(e => ({
          type: 'div', className: 'event-card', onClick: () => onJoinEvent(e.id), children: [
            { type: 'img', src: e.thumbnailUrl },
            { type: 'h3', text: e.title },
            { type: 'span', text: `${e.viewerCount} watching` },
          ],
        }))},
      ]},
      { type: 'section', children: [
        { type: 'h2', text: 'Interest Groups' },
        { type: 'div', className: 'groups-grid', children: groups.map(g => ({
          type: 'div', className: 'group-card', onClick: () => onJoinGroup(g.id), children: [
            { type: 'img', src: g.imageUrl },
            { type: 'h3', text: g.name },
            { type: 'span', text: `${g.memberCount} members` },
          ],
        }))},
      ]},
    ],
  };
}

export default DiscoverPage;
