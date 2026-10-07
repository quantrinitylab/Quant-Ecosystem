import { describe, expect, it } from 'vitest';
import {
  toggleCommentLike,
  addCommentNode,
  countTotalComments,
  REELS_QUICK_EMOJIS,
  type CommentNode,
} from '../features/reels/comments';

const MOCK_COMMENTS: CommentNode[] = [
  {
    id: 'c-1',
    username: 'alex_dev',
    avatar: 'https://example.com/avatar.jpg',
    text: 'Sovereign 60FPS reels player!',
    timestamp: '2h',
    likes: 10,
    isLiked: false,
    replies: [
      {
        id: 'c-1-sub',
        username: 'creator',
        avatar: 'https://example.com/avatar2.jpg',
        text: 'Zero platform fees!',
        timestamp: '1h',
        likes: 3,
        isLiked: true,
      },
    ],
  },
  {
    id: 'c-2',
    username: 'sarah',
    avatar: 'https://example.com/avatar3.jpg',
    text: 'Love the quick reaction dock',
    timestamp: '3h',
    likes: 0,
    isLiked: false,
  },
];

describe('QuantGram Reels Comments Engine (Task W39-G02)', () => {
  it('counts total comments including nested replies accurately', () => {
    expect(countTotalComments(MOCK_COMMENTS)).toBe(3);
  });

  it('contains the forensic 8-emoji reaction dock tokens', () => {
    expect(REELS_QUICK_EMOJIS).toHaveLength(8);
    expect(REELS_QUICK_EMOJIS).toContain('❤️');
    expect(REELS_QUICK_EMOJIS).toContain('🔥');
    expect(REELS_QUICK_EMOJIS).toContain('🙌');
  });

  it('toggles like on a top-level comment', () => {
    const updated = toggleCommentLike(MOCK_COMMENTS, 'c-1');
    const comment = updated.find((c) => c.id === 'c-1');
    expect(comment?.isLiked).toBe(true);
    expect(comment?.likes).toBe(11);

    const unliked = toggleCommentLike(updated, 'c-1');
    const unlikedComment = unliked.find((c) => c.id === 'c-1');
    expect(unlikedComment?.isLiked).toBe(false);
    expect(unlikedComment?.likes).toBe(10);
  });

  it('toggles like on a nested reply comment', () => {
    const updated = toggleCommentLike(MOCK_COMMENTS, 'c-1-sub');
    const reply = updated.find((c) => c.id === 'c-1')?.replies?.find((r) => r.id === 'c-1-sub');
    expect(reply?.isLiked).toBe(false);
    expect(reply?.likes).toBe(2);
  });

  it('adds a new top-level comment to the top of the feed', () => {
    const newComment: CommentNode = {
      id: 'c-new',
      username: 'currentUser',
      avatar: 'https://example.com/me.jpg',
      text: 'Fresh comment!',
      timestamp: 'just now',
      likes: 0,
    };
    const updated = addCommentNode(MOCK_COMMENTS, newComment);
    expect(updated).toHaveLength(3);
    expect(updated[0]?.id).toBe('c-new');
  });

  it('appends a reply to the specified parent comment', () => {
    const reply: CommentNode = {
      id: 'c-sub-2',
      username: 'currentUser',
      avatar: 'https://example.com/me.jpg',
      text: 'Great reply!',
      timestamp: 'just now',
      likes: 0,
    };
    const updated = addCommentNode(MOCK_COMMENTS, reply, 'c-1');
    const parent = updated.find((c) => c.id === 'c-1');
    expect(parent?.replies).toHaveLength(2);
    expect(parent?.replies?.[1]?.id).toBe('c-sub-2');
  });
});
