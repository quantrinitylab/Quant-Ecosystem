// ============================================================================
// QuantGram (QuantNeon) — Reels Comments State Engine & Helpers
// Forensic 98-Screen Instagram Parity (Task W39-G02)
// ============================================================================

export interface CommentNode {
  id: string;
  username: string;
  avatar: string;
  text: string;
  timestamp: string;
  likes: number;
  isLiked?: boolean;
  isVerified?: boolean;
  replies?: CommentNode[];
}

export const REELS_QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'] as const;

export function toggleCommentLike(comments: CommentNode[], commentId: string): CommentNode[] {
  return comments.map((c) => {
    if (c.id === commentId) {
      const isLiked = !c.isLiked;
      return { ...c, isLiked, likes: isLiked ? c.likes + 1 : Math.max(0, c.likes - 1) };
    }
    if (c.replies && c.replies.length > 0) {
      return {
        ...c,
        replies: toggleCommentLike(c.replies, commentId),
      };
    }
    return c;
  });
}

export function addCommentNode(
  comments: CommentNode[],
  newComment: CommentNode,
  parentId?: string,
): CommentNode[] {
  if (!parentId) {
    return [newComment, ...comments];
  }

  return comments.map((c) => {
    if (c.id === parentId) {
      return {
        ...c,
        replies: [...(c.replies || []), newComment],
      };
    }
    if (c.replies && c.replies.length > 0) {
      return {
        ...c,
        replies: addCommentNode(c.replies, newComment, parentId),
      };
    }
    return c;
  });
}

export function countTotalComments(comments: CommentNode[]): number {
  return comments.reduce((sum, c) => sum + 1 + (c.replies ? countTotalComments(c.replies) : 0), 0);
}
