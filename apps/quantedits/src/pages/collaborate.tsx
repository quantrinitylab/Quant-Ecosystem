// ============================================================================
// QuantEdits - Collaboration Page
// Shared projects, invite, permissions, real-time cursors, change history
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  permission: 'view' | 'comment' | 'edit';
  isOnline: boolean;
  lastActive: string;
  cursor?: { x: number; y: number; color: string };
}

interface SharedProject {
  id: string;
  title: string;
  thumbnail: string;
  owner: string;
  collaborators: Collaborator[];
  lastEdited: string;
  status: 'active' | 'archived';
}

interface ChangeEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  description: string;
  timestamp: string;
  canRevert: boolean;
}

interface CommentThread {
  id: string;
  userId: string;
  userName: string;
  avatar: string;
  content: string;
  timestamp: string;
  timelinePosition: number;
  resolved: boolean;
  replies: { id: string; userName: string; content: string; timestamp: string }[];
}

interface CollaboratePageProps {
  projectId: string;
  currentUserId: string;
}

const CollaboratePage: React.FC<CollaboratePageProps> = ({ projectId, currentUserId }) => {
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [changeHistory, setChangeHistory] = useState<ChangeEntry[]>([]);
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<'view' | 'comment' | 'edit'>('edit');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [linkPermission, setLinkPermission] = useState<'view' | 'comment' | 'edit'>('view');
  const [activeTab, setActiveTab] = useState<'team' | 'history' | 'comments'>('team');
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        setCollaborators([
          { id: 'user-1', name: 'You', email: 'you@example.com', avatar: '/avatars/you.jpg', permission: 'edit', isOnline: true, lastActive: new Date().toISOString(), cursor: { x: 450, y: 300, color: '#6366f1' } },
          { id: 'user-2', name: 'Alice Chen', email: 'alice@example.com', avatar: '/avatars/alice.jpg', permission: 'edit', isOnline: true, lastActive: new Date().toISOString(), cursor: { x: 200, y: 150, color: '#10b981' } },
          { id: 'user-3', name: 'Bob Smith', email: 'bob@example.com', avatar: '/avatars/bob.jpg', permission: 'comment', isOnline: false, lastActive: new Date(Date.now() - 3600000).toISOString() },
          { id: 'user-4', name: 'Carol Davis', email: 'carol@example.com', avatar: '/avatars/carol.jpg', permission: 'view', isOnline: true, lastActive: new Date().toISOString() },
        ]);
        setSharedProjects(Array.from({ length: 5 }, (_, i) => ({
          id: `shared-${i}`,
          title: `Shared Project ${i + 1}`,
          thumbnail: `/thumbnails/shared-${i}.jpg`,
          owner: i === 0 ? 'You' : ['Alice', 'Bob', 'Carol'][i % 3],
          collaborators: [],
          lastEdited: new Date(Date.now() - i * 86400000).toISOString(),
          status: i > 3 ? 'archived' : 'active' as const,
        })));
        setChangeHistory(Array.from({ length: 15 }, (_, i) => ({
          id: `change-${i}`,
          userId: `user-${(i % 3) + 1}`,
          userName: ['You', 'Alice', 'Bob'][i % 3],
          action: ['edit', 'add', 'delete', 'move', 'resize'][i % 5],
          description: [`Modified clip on Video Track`, `Added text overlay`, `Removed audio clip`, `Moved element to position`, `Resized image element`][i % 5],
          timestamp: new Date(Date.now() - i * 600000).toISOString(),
          canRevert: i < 5,
        })));
        setComments([
          { id: 'cmt-1', userId: 'user-2', userName: 'Alice Chen', avatar: '/avatars/alice.jpg', content: 'Can we make the intro shorter?', timestamp: new Date(Date.now() - 7200000).toISOString(), timelinePosition: 5, resolved: false, replies: [{ id: 'reply-1', userName: 'You', content: 'Sure, trimming to 3 seconds', timestamp: new Date(Date.now() - 3600000).toISOString() }] },
          { id: 'cmt-2', userId: 'user-3', userName: 'Bob Smith', avatar: '/avatars/bob.jpg', content: 'Love the color grading here!', timestamp: new Date(Date.now() - 86400000).toISOString(), timelinePosition: 25, resolved: true, replies: [] },
        ]);
        setShareLink(`https://quantedits.app/share/${projectId}?token=abc123`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load collaboration data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId]);

  const handleInvite = useCallback(() => {
    if (!inviteEmail.trim()) return;
    const newCollab: Collaborator = {
      id: `user-${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      avatar: '',
      permission: invitePermission,
      isOnline: false,
      lastActive: '',
    };
    setCollaborators(prev => [...prev, newCollab]);
    setInviteEmail('');
    setShowInviteModal(false);
  }, [inviteEmail, invitePermission]);

  const handleChangePermission = useCallback((userId: string, permission: Collaborator['permission']) => {
    setCollaborators(prev => prev.map(c => c.id === userId ? { ...c, permission } : c));
  }, []);

  const handleRemoveCollaborator = useCallback((userId: string) => {
    setCollaborators(prev => prev.filter(c => c.id !== userId));
  }, []);

  const handleRevertChange = useCallback((changeId: string) => {
    setChangeHistory(prev => prev.filter(c => c.id !== changeId));
  }, []);

  const handleAddComment = useCallback(() => {
    if (!newComment.trim()) return;
    const comment: CommentThread = {
      id: `cmt-${Date.now()}`,
      userId: currentUserId,
      userName: 'You',
      avatar: '/avatars/you.jpg',
      content: newComment,
      timestamp: new Date().toISOString(),
      timelinePosition: 0,
      resolved: false,
      replies: [],
    };
    setComments(prev => [comment, ...prev]);
    setNewComment('');
  }, [newComment, currentUserId]);

  const handleReply = useCallback((commentId: string) => {
    if (!replyContent.trim()) return;
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, replies: [...c.replies, { id: `reply-${Date.now()}`, userName: 'You', content: replyContent, timestamp: new Date().toISOString() }] } : c));
    setReplyContent('');
    setReplyingTo(null);
  }, [replyContent]);

  const handleResolveComment = useCallback((commentId: string) => {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: !c.resolved } : c));
  }, []);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard?.writeText(shareLink);
  }, [shareLink]);

  const onlineCount = useMemo(() => collaborators.filter(c => c.isOnline).length, [collaborators]);

  if (loading) {
    return (<div className="collab-loading"><div className="loading-spinner" /><p>Loading collaboration data...</p></div>);
  }

  if (error) {
    return (<div className="collab-error"><h3>Error</h3><p>{error}</p><button onClick={() => window.location.reload()}>Retry</button></div>);
  }

  return (
    <div className="collaborate-page">
      <header className="collab-header">
        <h1>Collaboration</h1>
        <div className="online-indicator">
          <span className="online-dot" />
          <span>{onlineCount} online now</span>
        </div>
        <button className="invite-btn" onClick={() => setShowInviteModal(true)}>+ Invite</button>
      </header>

      <div className="collab-cursors-preview">
        {collaborators.filter(c => c.isOnline && c.cursor && c.id !== currentUserId).map(c => (
          <div key={c.id} className="cursor-indicator" style={{ left: c.cursor!.x, top: c.cursor!.y }}>
            <div className="cursor-arrow" style={{ borderColor: c.cursor!.color }} />
            <span className="cursor-name" style={{ backgroundColor: c.cursor!.color }}>{c.name}</span>
          </div>
        ))}
      </div>

      <div className="collab-tabs">
        <button className={`tab ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>Team ({collaborators.length})</button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>History ({changeHistory.length})</button>
        <button className={`tab ${activeTab === 'comments' ? 'active' : ''}`} onClick={() => setActiveTab('comments')}>Comments ({comments.filter(c => !c.resolved).length})</button>
      </div>

      <div className="collab-content">
        {activeTab === 'team' && (
          <div className="team-panel">
            <div className="share-link-section">
              <h4>Share Link</h4>
              <div className="share-link-row">
                <input type="text" readOnly value={shareLink} className="share-link-input" />
                <button onClick={handleCopyLink}>Copy</button>
              </div>
              <select value={linkPermission} onChange={(e) => setLinkPermission(e.target.value as typeof linkPermission)}>
                <option value="view">Anyone with link can view</option>
                <option value="comment">Anyone with link can comment</option>
                <option value="edit">Anyone with link can edit</option>
              </select>
            </div>
            <div className="team-list">
              {collaborators.map(collab => (
                <div key={collab.id} className="team-member">
                  <div className="member-avatar">
                    <img src={collab.avatar || '/default-avatar.jpg'} alt={collab.name} />
                    <span className={`status-dot ${collab.isOnline ? 'online' : 'offline'}`} />
                  </div>
                  <div className="member-info">
                    <span className="member-name">{collab.name}</span>
                    <span className="member-email">{collab.email}</span>
                  </div>
                  <select value={collab.permission} onChange={(e) => handleChangePermission(collab.id, e.target.value as Collaborator['permission'])} disabled={collab.id === currentUserId}>
                    <option value="view">Viewer</option>
                    <option value="comment">Commenter</option>
                    <option value="edit">Editor</option>
                  </select>
                  {collab.id !== currentUserId && (
                    <button className="remove-btn" onClick={() => handleRemoveCollaborator(collab.id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-panel">
            {changeHistory.map(change => (
              <div key={change.id} className="history-entry">
                <div className="entry-info">
                  <span className="entry-user">{change.userName}</span>
                  <span className="entry-action">{change.description}</span>
                  <span className="entry-time">{new Date(change.timestamp).toLocaleTimeString()}</span>
                </div>
                {change.canRevert && (
                  <button className="revert-btn" onClick={() => handleRevertChange(change.id)}>Revert</button>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="comments-panel">
            <div className="new-comment">
              <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." />
              <button onClick={handleAddComment} disabled={!newComment.trim()}>Post</button>
            </div>
            <div className="comments-list">
              {comments.map(comment => (
                <div key={comment.id} className={`comment-thread ${comment.resolved ? 'resolved' : ''}`}>
                  <div className="comment-main">
                    <img src={comment.avatar} alt={comment.userName} className="comment-avatar" />
                    <div className="comment-body">
                      <div className="comment-header">
                        <span className="comment-author">{comment.userName}</span>
                        <span className="comment-time">{new Date(comment.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="comment-content">{comment.content}</p>
                      <div className="comment-actions">
                        <button onClick={() => setReplyingTo(comment.id)}>Reply</button>
                        <button onClick={() => handleResolveComment(comment.id)}>{comment.resolved ? 'Unresolve' : 'Resolve'}</button>
                      </div>
                    </div>
                  </div>
                  {comment.replies.map(reply => (
                    <div key={reply.id} className="comment-reply">
                      <span className="reply-author">{reply.userName}</span>
                      <p className="reply-content">{reply.content}</p>
                      <span className="reply-time">{new Date(reply.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                  {replyingTo === comment.id && (
                    <div className="reply-input">
                      <input type="text" value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="Write a reply..." onKeyDown={(e) => e.key === 'Enter' && handleReply(comment.id)} />
                      <button onClick={() => handleReply(comment.id)}>Reply</button>
                      <button onClick={() => setReplyingTo(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showInviteModal && (
        <div className="invite-modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Invite Collaborators</h2>
            <div className="invite-form">
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" />
              <select value={invitePermission} onChange={(e) => setInvitePermission(e.target.value as typeof invitePermission)}>
                <option value="view">Viewer</option>
                <option value="comment">Commenter</option>
                <option value="edit">Editor</option>
              </select>
              <button onClick={handleInvite} disabled={!inviteEmail.trim()}>Send Invite</button>
            </div>
            <button className="close-modal" onClick={() => setShowInviteModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollaboratePage;
