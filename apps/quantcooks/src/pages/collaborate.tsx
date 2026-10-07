// ============================================================================
// QuantEdits - Collaboration Page
// Members and comments are loaded from the real /api/collaboration/[id]
// endpoints; invites, permission changes, removals, new comments and
// resolve-toggles all call the API. Shared projects, change history, replies
// and share links have no backend, so they show honest "not available" states
// instead of fabricated data.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageTransition } from '../components/PageTransition';
import { apiFetchRaw } from '@quant/api-client';

/** Backend roles from the collaboration service. */
type ApiRole = 'owner' | 'editor' | 'viewer' | 'commenter';

interface ApiCollaborator {
  userId: string;
  username: string;
  role: ApiRole;
  joinedAt: string;
  isOnline: boolean;
}

interface ApiComment {
  id: string;
  projectId: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
  layerId?: string;
  position?: { x: number; y: number };
  resolved: boolean;
  replies: ApiComment[];
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface Collaborator {
  userId: string;
  name: string;
  permission: 'view' | 'comment' | 'edit';
  isOnline: boolean;
  lastActive: string;
  isOwner: boolean;
}

interface CommentThread {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  resolved: boolean;
  replies: { id: string; userName: string; content: string; timestamp: string }[];
}

interface CollaboratePageProps {
  projectId: string;
  currentUserId: string;
}

function apiRoleToPermission(role: ApiRole): Collaborator['permission'] {
  if (role === 'viewer') return 'view';
  if (role === 'commenter') return 'comment';
  return 'edit';
}

function permissionToApiRole(permission: 'view' | 'comment' | 'edit'): ApiRole {
  if (permission === 'view') return 'viewer';
  if (permission === 'comment') return 'commenter';
  return 'editor';
}

const CollaboratePage: React.FC<CollaboratePageProps> = ({ projectId, currentUserId }) => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [invitePermission, setInvitePermission] = useState<'view' | 'comment' | 'edit'>('edit');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [activeTab, setActiveTab] = useState<'team' | 'history' | 'comments'>('team');
  const [newComment, setNewComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);

  const membersUrl = `/api/collaboration/${encodeURIComponent(projectId)}/members`;
  const commentsUrl = `/api/collaboration/${encodeURIComponent(projectId)}/comments`;
  const inviteUrl = `/api/collaboration/${encodeURIComponent(projectId)}/invite`;

  const mapCollaborators = useCallback((rows: ApiCollaborator[]): Collaborator[] => {
    return rows.map((c) => ({
      userId: c.userId,
      name: c.username || c.userId,
      permission: apiRoleToPermission(c.role),
      isOnline: c.isOnline,
      lastActive: c.joinedAt,
      isOwner: c.role === 'owner',
    }));
  }, []);

  const mapComments = useCallback((rows: ApiComment[]): CommentThread[] => {
    const mapOne = (c: ApiComment): CommentThread => ({
      id: c.id,
      userId: c.userId,
      userName: c.username || c.userId,
      content: c.content,
      timestamp: new Date(c.timestamp).toISOString(),
      resolved: c.resolved,
      replies: (c.replies || []).map((r) => ({
        id: r.id,
        userName: r.username || r.userId,
        content: r.content,
        timestamp: new Date(r.timestamp).toISOString(),
      })),
    });
    return rows.map(mapOne);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, commentsRes] = await Promise.all([
        apiFetchRaw(membersUrl),
        apiFetchRaw(commentsUrl),
      ]);
      const membersPayload = (await membersRes.json().catch(() => null)) as ApiResponse<
        ApiCollaborator[]
      > | null;
      const commentsPayload = (await commentsRes.json().catch(() => null)) as ApiResponse<
        ApiComment[]
      > | null;
      if (!membersRes.ok || !membersPayload?.success) {
        throw new Error(
          membersPayload?.error?.message ||
            `Failed to load collaborators (HTTP ${membersRes.status})`,
        );
      }
      if (!commentsRes.ok || !commentsPayload?.success) {
        throw new Error(
          commentsPayload?.error?.message || `Failed to load comments (HTTP ${commentsRes.status})`,
        );
      }
      setCollaborators(mapCollaborators(membersPayload.data ?? []));
      setComments(mapComments(commentsPayload.data ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collaboration data');
    } finally {
      setLoading(false);
    }
  }, [membersUrl, commentsUrl, mapCollaborators, mapComments]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshComments = useCallback(async () => {
    try {
      const res = await apiFetchRaw(commentsUrl);
      const payload = (await res.json().catch(() => null)) as ApiResponse<ApiComment[]> | null;
      if (res.ok && payload?.success) {
        setComments(mapComments(payload.data ?? []));
      }
    } catch {
      /* keep existing comments on refresh failure */
    }
  }, [commentsUrl, mapComments]);

  const refreshMembers = useCallback(async () => {
    try {
      const res = await apiFetchRaw(membersUrl);
      const payload = (await res.json().catch(() => null)) as ApiResponse<ApiCollaborator[]> | null;
      if (res.ok && payload?.success) {
        setCollaborators(mapCollaborators(payload.data ?? []));
      }
    } catch {
      /* keep existing members on refresh failure */
    }
  }, [membersUrl, mapCollaborators]);

  const handleInvite = useCallback(async () => {
    const identifier = inviteIdentifier.trim();
    if (!identifier || inviting) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await apiFetchRaw(inviteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: identifier, role: permissionToApiRole(invitePermission) }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || `Invite failed (HTTP ${res.status})`);
      }
      setInviteIdentifier('');
      setShowInviteModal(false);
      await refreshMembers();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }, [inviteIdentifier, invitePermission, inviting, inviteUrl, refreshMembers]);

  const handleChangePermission = useCallback(
    async (userId: string, permission: Collaborator['permission']) => {
      // The backend invite endpoint upserts, so re-inviting with a new role
      // is the real way to change a collaborator's role.
      try {
        const res = await apiFetchRaw(inviteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, role: permissionToApiRole(permission) }),
        });
        const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error?.message || `Role update failed (HTTP ${res.status})`);
        }
        await refreshMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Role update failed');
      }
    },
    [inviteUrl, refreshMembers],
  );

  const handleRemoveCollaborator = useCallback(
    async (userId: string) => {
      try {
        const res = await apiFetchRaw(
          `/api/collaboration/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
          { method: 'DELETE' },
        );
        const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error?.message || `Remove failed (HTTP ${res.status})`);
        }
        await refreshMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Remove failed');
      }
    },
    [projectId, refreshMembers],
  );

  const handleAddComment = useCallback(async () => {
    const content = newComment.trim();
    if (!content || postingComment) return;
    setPostingComment(true);
    setCommentError(null);
    try {
      const res = await apiFetchRaw(commentsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || `Posting comment failed (HTTP ${res.status})`);
      }
      setNewComment('');
      await refreshComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Posting comment failed');
    } finally {
      setPostingComment(false);
    }
  }, [newComment, postingComment, commentsUrl, refreshComments]);

  const handleResolveComment = useCallback(
    async (commentId: string, currentlyResolved: boolean) => {
      try {
        const res = await apiFetchRaw(
          `/api/collaboration/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/resolve`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolved: !currentlyResolved }),
          },
        );
        const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error?.message || `Resolve failed (HTTP ${res.status})`);
        }
        await refreshComments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Resolve failed');
      }
    },
    [projectId, refreshComments],
  );

  const onlineCount = useMemo(
    () => collaborators.filter((c) => c.isOnline).length,
    [collaborators],
  );

  if (loading) {
    return (
      <div className="collab-loading">
        <div className="loading-spinner" />
        <p>Loading collaboration data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="collab-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={() => void loadData()}>Retry</button>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="collaborate-page">
        <header className="collab-header">
          <h1>Collaboration</h1>
          <div className="online-indicator">
            <span className="online-dot" />
            <span>{onlineCount} online now</span>
          </div>
          <button className="invite-btn" onClick={() => setShowInviteModal(true)}>
            + Invite
          </button>
        </header>

        <div className="collab-tabs">
          <button
            className={`tab ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            Team ({collaborators.length})
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button
            className={`tab ${activeTab === 'comments' ? 'active' : ''}`}
            onClick={() => setActiveTab('comments')}
          >
            Comments ({comments.filter((c) => !c.resolved).length})
          </button>
        </div>

        <div className="collab-content">
          {activeTab === 'team' && (
            <div className="team-panel">
              <div className="share-link-section">
                <h4>Share Link</h4>
                <p className="unavailable-note">
                  Share links aren&apos;t available yet — invite collaborators directly instead.
                </p>
              </div>
              {collaborators.length === 0 ? (
                <div className="team-empty">
                  <p>No collaborators yet. Invite someone to get started.</p>
                </div>
              ) : (
                <div className="team-list">
                  {collaborators.map((collab) => (
                    <div key={collab.userId} className="team-member">
                      <div className="member-avatar">
                        <span className="avatar-initials">
                          {collab.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className={`status-dot ${collab.isOnline ? 'online' : 'offline'}`} />
                      </div>
                      <div className="member-info">
                        <span className="member-name">
                          {collab.name}
                          {collab.isOwner && <span className="owner-badge">Owner</span>}
                        </span>
                        <span className="member-email">{collab.userId}</span>
                      </div>
                      <select
                        value={collab.permission}
                        onChange={(e) =>
                          void handleChangePermission(
                            collab.userId,
                            e.target.value as Collaborator['permission'],
                          )
                        }
                        disabled={collab.userId === currentUserId || collab.isOwner}
                        title={
                          collab.isOwner ? 'Owner role cannot be changed' : 'Change permission'
                        }
                      >
                        <option value="view">Viewer</option>
                        <option value="comment">Commenter</option>
                        <option value="edit">Editor</option>
                      </select>
                      {collab.userId !== currentUserId && !collab.isOwner && (
                        <button
                          className="remove-btn"
                          onClick={() => void handleRemoveCollaborator(collab.userId)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-panel">
              <div className="history-empty">
                <p>Change history isn&apos;t available yet.</p>
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="comments-panel">
              <div className="new-comment">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                />
                <button onClick={() => void handleAddComment()} disabled={!newComment.trim() || postingComment}>
                  {postingComment ? 'Posting…' : 'Post'}
                </button>
              </div>
              {commentError && <p className="comment-error">{commentError}</p>}
              {comments.length === 0 ? (
                <div className="comments-empty">
                  <p>No comments yet. Start the discussion.</p>
                </div>
              ) : (
                <div className="comments-list">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`comment-thread ${comment.resolved ? 'resolved' : ''}`}
                    >
                      <div className="comment-main">
                        <div className="comment-avatar">
                          <span className="avatar-initials">
                            {comment.userName.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="comment-body">
                          <div className="comment-header">
                            <span className="comment-author">{comment.userName}</span>
                            <span className="comment-time">
                              {new Date(comment.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="comment-content">{comment.content}</p>
                          <div className="comment-actions">
                            <button
                              onClick={() => void handleResolveComment(comment.id, comment.resolved)}
                            >
                              {comment.resolved ? 'Unresolve' : 'Resolve'}
                            </button>
                          </div>
                        </div>
                      </div>
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="comment-reply">
                          <span className="reply-author">{reply.userName}</span>
                          <p className="reply-content">{reply.content}</p>
                          <span className="reply-time">
                            {new Date(reply.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                      <p
                        className="unavailable-note"
                        title="The comments API has no reply endpoint"
                      >
                        Replies aren&apos;t supported yet.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {showInviteModal && (
          <div className="invite-modal-overlay" onClick={() => setShowInviteModal(false)}>
            <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Invite Collaborators</h2>
              <div className="invite-form">
                <input
                  type="text"
                  value={inviteIdentifier}
                  onChange={(e) => setInviteIdentifier(e.target.value)}
                  placeholder="User ID or email"
                />
                <select
                  value={invitePermission}
                  onChange={(e) => setInvitePermission(e.target.value as typeof invitePermission)}
                >
                  <option value="view">Viewer</option>
                  <option value="comment">Commenter</option>
                  <option value="edit">Editor</option>
                </select>
                <button onClick={() => void handleInvite()} disabled={!inviteIdentifier.trim() || inviting}>
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
              {inviteError && <p className="invite-error">{inviteError}</p>}
              <button className="close-modal" onClick={() => setShowInviteModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default CollaboratePage;
