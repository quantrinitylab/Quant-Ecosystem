import { describe, expect, it } from 'vitest';
import {
  filterExploreBySearchQuery,
  formatExploreViews,
  formatVideoDuration,
  isAsymmetricLargeItem,
  type ExploreGridItem,
} from '../features/explore/explore-matrix';

describe('QuantGram Explore 3-Column Asymmetric Masonry Grid (Task W39-G05)', () => {
  it('formats view count pills into Instagram-accurate short labels', () => {
    expect(formatExploreViews(2_400_000)).toBe('2.4M');
    expect(formatExploreViews(439_000)).toBe('439K');
    expect(formatExploreViews(980)).toBe('980');
  });

  it('formats video duration into mm:ss badges with leading zero padding', () => {
    expect(formatVideoDuration(32)).toBe('0:32');
    expect(formatVideoDuration(75)).toBe('1:15');
    expect(formatVideoDuration(5)).toBe('0:05');
  });

  it('accurately identifies asymmetric 2x2 large grid spans across 9-item repeating blocks', () => {
    // In block 1 (0..8)
    expect(isAsymmetricLargeItem(0)).toBe(true);
    expect(isAsymmetricLargeItem(1)).toBe(false);
    expect(isAsymmetricLargeItem(2)).toBe(false);
    expect(isAsymmetricLargeItem(3)).toBe(false);
    expect(isAsymmetricLargeItem(4)).toBe(true);
    expect(isAsymmetricLargeItem(5)).toBe(false);

    // In block 2 (9..17)
    expect(isAsymmetricLargeItem(9)).toBe(true);
    expect(isAsymmetricLargeItem(13)).toBe(true);
  });

  it('filters explore items across captions and tags with Quanty AI search bar', () => {
    const items: ExploreGridItem[] = [
      {
        id: '1',
        thumbnailUrl: '/thumb1.jpg',
        type: 'reel',
        caption: 'Superhuman UI/UX 60fps design system',
        tags: ['tech', 'design'],
      },
      {
        id: '2',
        thumbnailUrl: '/thumb2.jpg',
        type: 'post',
        caption: 'Delicious street food in Mumbai',
        tags: ['food', 'travel'],
      },
      {
        id: '3',
        thumbnailUrl: '/thumb3.jpg',
        type: 'reel',
        caption: 'Autonomous multi-agent swarm in action',
        tags: ['ai', 'swarm'],
      },
    ];

    const techResults = filterExploreBySearchQuery(items, 'tech');
    expect(techResults).toHaveLength(1);
    expect(techResults[0].id).toBe('1');

    const aiResults = filterExploreBySearchQuery(items, 'swarm');
    expect(aiResults).toHaveLength(1);
    expect(aiResults[0].id).toBe('3');

    const emptyResults = filterExploreBySearchQuery(items, '');
    expect(emptyResults).toHaveLength(3);
  });
});
