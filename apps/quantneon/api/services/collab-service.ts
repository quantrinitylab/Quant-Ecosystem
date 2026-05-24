// ============================================================================
// QuantNeon API - Collab Service
// Collaboration invites, shared content, split engagement
// ============================================================================

interface CollabPost {
  id: string;
  initiatorId: string;
  collaboratorId: string;
  postId: string | null;
  mediaUrl: string;
  caption: string;
  status: 'pending' | 'accepted' | 'declined' | 'published';
  likeCount: number;
  commentCount: number;
  createdAt: string;
  publishedAt: string | null;
}

interface CollabInvite {
  id: string;
  fromUserId: string;
  toUserId: string;
  mediaUrl: string;
  caption: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
  expiresAt: string;
}

class CollabService {
  private collabs: Map<string, CollabPost> = new Map();
  private invites: Map<string, CollabInvite> = new Map();

  async createInvite(data: { fromUserId: string; toUserId: string; mediaUrl: string; caption: string; message?: string }): Promise<CollabInvite> {
    const invite: CollabInvite = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      fromUserId: data.fromUserId,
      toUserId: data.toUserId,
      mediaUrl: data.mediaUrl,
      caption: data.caption,
      message: data.message || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.invites.set(invite.id, invite);
    return invite;
  }

  async acceptInvite(inviteId: string, userId: string): Promise<CollabPost> {
    const invite = this.invites.get(inviteId);
    if (!invite) throw new Error('Invite not found');
    if (invite.toUserId !== userId) throw new Error('Unauthorized');
    invite.status = 'accepted';
    const collab: CollabPost = {
      id: `collab_${Date.now()}`,
      initiatorId: invite.fromUserId,
      collaboratorId: invite.toUserId,
      postId: null,
      mediaUrl: invite.mediaUrl,
      caption: invite.caption,
      status: 'published',
      likeCount: 0,
      commentCount: 0,
      createdAt: invite.createdAt,
      publishedAt: new Date().toISOString(),
    };
    this.collabs.set(collab.id, collab);
    return collab;
  }

  async declineInvite(inviteId: string, userId: string): Promise<void> {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toUserId !== userId) throw new Error('Unauthorized');
    invite.status = 'declined';
  }

  async getPendingInvites(userId: string): Promise<CollabInvite[]> {
    return Array.from(this.invites.values())
      .filter(inv => inv.toUserId === userId && inv.status === 'pending');
  }

  async getSentInvites(userId: string): Promise<CollabInvite[]> {
    return Array.from(this.invites.values())
      .filter(inv => inv.fromUserId === userId);
  }

  async getUserCollabs(userId: string): Promise<CollabPost[]> {
    return Array.from(this.collabs.values())
      .filter(c => c.initiatorId === userId || c.collaboratorId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getCollab(collabId: string): Promise<CollabPost | null> {
    return this.collabs.get(collabId) || null;
  }

  async likeCollab(collabId: string): Promise<void> {
    const collab = this.collabs.get(collabId);
    if (collab) collab.likeCount++;
  }

  async commentOnCollab(collabId: string): Promise<void> {
    const collab = this.collabs.get(collabId);
    if (collab) collab.commentCount++;
  }

  async deleteCollab(collabId: string, userId: string): Promise<void> {
    const collab = this.collabs.get(collabId);
    if (!collab) throw new Error('Not found');
    if (collab.initiatorId !== userId && collab.collaboratorId !== userId) throw new Error('Unauthorized');
    this.collabs.delete(collabId);
  }
}

export const collabService = new CollabService();
export default CollabService;
