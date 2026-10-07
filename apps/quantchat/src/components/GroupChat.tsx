// ============================================================================
// QuantChat - GroupChat Component
// Member list, admin panel, polls, shared album, pinned messages, @mention
// ============================================================================
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

interface GroupMember {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: string;
  isOnline: boolean;
}
interface PinnedMessage {
  id: string;
  content: string;
  author: string;
  pinnedAt: string;
}
interface Poll {
  id: string;
  question: string;
  options: { id: string; text: string; votes: number; voters: string[] }[];
  createdBy: string;
  expiresAt?: string;
  isMultiChoice: boolean;
  totalVotes: number;
}
interface SharedPhoto {
  id: string;
  url: string;
  thumbnailUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}
interface GroupChatProps {
  groupId: string;
  currentUserId: string;
  isAdmin: boolean;
}

export const GroupChat: React.FC<GroupChatProps> = ({ groupId, currentUserId, isAdmin }) => {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [sharedPhotos, setSharedPhotos] = useState<SharedPhoto[]>([]);
  const [activeTab, setActiveTab] = useState<
    'members' | 'pinned' | 'polls' | 'photos' | 'settings'
  >('members');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState<boolean>(false);
  const [addMemberQuery, setAddMemberQuery] = useState<string>('');
  const [showCreatePoll, setShowCreatePoll] = useState<boolean>(false);
  const [pollQuestion, setPollQuestion] = useState<string>('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMultiChoice, setPollMultiChoice] = useState<boolean>(false);
  const [mentionQuery, setMentionQuery] = useState<string>('');
  const [showMentions, setShowMentions] = useState<boolean>(false);
  const [mentionResults, setMentionResults] = useState<GroupMember[]>([]);
  const [groupName, setGroupName] = useState<string>('');
  const [groupDescription, setGroupDescription] = useState<string>('');

  const fetchGroupData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to load group');
      const data = await response.json();
      setMembers(data.members || []);
      setPinnedMessages(data.pinnedMessages || []);
      setPolls(data.polls || []);
      setSharedPhotos(data.sharedPhotos || []);
      setGroupName(data.name || '');
      setGroupDescription(data.description || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  const handleAddMember = useCallback(
    async (userId: string) => {
      try {
        await fetch(`/api/groups/${groupId}/members`, {
          method: 'POST',
          headers: {
            ...getAuthHeadersWithContent(),
          },
          body: JSON.stringify({ userId }),
        });
        fetchGroupData();
        setShowAddMember(false);
      } catch (err) {
        logger.error('Add member failed:', err);
      }
    },
    [groupId, fetchGroupData],
  );

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      try {
        await fetch(`/api/groups/${groupId}/members/${userId}`, {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
        });
        setMembers((prev) => prev.filter((m) => m.id !== userId));
      } catch (err) {
        logger.error('Remove failed:', err);
      }
    },
    [groupId],
  );

  const handlePromoteMember = useCallback(
    async (userId: string, role: string) => {
      try {
        await fetch(`/api/groups/${groupId}/members/${userId}/role`, {
          method: 'PUT',
          headers: {
            ...getAuthHeadersWithContent(),
          },
          body: JSON.stringify({ role }),
        });
        setMembers((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, role: role as GroupMember['role'] } : m)),
        );
      } catch (err) {
        logger.error('Promote failed:', err);
      }
    },
    [groupId],
  );

  const handleCreatePoll = useCallback(async () => {
    if (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) return;
    try {
      const response = await fetch(`/api/groups/${groupId}/polls`, {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({
          question: pollQuestion,
          options: pollOptions.filter((o) => o.trim()),
          isMultiChoice: pollMultiChoice,
        }),
      });
      if (response.ok) {
        const poll = await response.json();
        setPolls((prev) => [poll, ...prev]);
        setShowCreatePoll(false);
        setPollQuestion('');
        setPollOptions(['', '']);
      }
    } catch (err) {
      logger.error('Create poll failed:', err);
    }
  }, [groupId, pollQuestion, pollOptions, pollMultiChoice]);

  const handleVote = useCallback(
    async (pollId: string, optionId: string) => {
      try {
        await fetch(`/api/groups/${groupId}/polls/${pollId}/vote`, {
          method: 'POST',
          headers: {
            ...getAuthHeadersWithContent(),
          },
          body: JSON.stringify({ optionId }),
        });
        setPolls((prev) =>
          prev.map((p) =>
            p.id === pollId
              ? {
                  ...p,
                  options: p.options.map((o) =>
                    o.id === optionId
                      ? { ...o, votes: o.votes + 1, voters: [...o.voters, currentUserId] }
                      : o,
                  ),
                  totalVotes: p.totalVotes + 1,
                }
              : p,
          ),
        );
      } catch (err) {
        logger.error('Vote failed:', err);
      }
    },
    [groupId, currentUserId],
  );

  const handleUnpin = useCallback(
    async (messageId: string) => {
      try {
        await fetch(`/api/groups/${groupId}/pinned/${messageId}`, {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
        });
        setPinnedMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err) {
        logger.error('Unpin failed:', err);
      }
    },
    [groupId],
  );

  const handleMentionSearch = useCallback(
    (query: string) => {
      setMentionQuery(query);
      setShowMentions(query.length > 0);
      const results = members.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          m.username.toLowerCase().includes(query.toLowerCase()),
      );
      setMentionResults(results.slice(0, 5));
    },
    [members],
  );

  const handleUpdateSettings = useCallback(async () => {
    try {
      await fetch(`/api/groups/${groupId}/settings`, {
        method: 'PUT',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ name: groupName, description: groupDescription }),
      });
    } catch (err) {
      logger.error('Update failed:', err);
    }
  }, [groupId, groupName, groupDescription]);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const roleOrder = { admin: 0, moderator: 1, member: 2 };
        return roleOrder[a.role] - roleOrder[b.role];
      }),
    [members],
  );

  if (loading) return <div className="group-loading">Loading group...</div>;
  if (error)
    return (
      <div className="group-error">
        <p>{error}</p>
        <button onClick={fetchGroupData}>Retry</button>
      </div>
    );

  return (
    <div className="group-chat-panel">
      <nav className="group-tabs">
        {(['members', 'pinned', 'polls', 'photos', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? 'active' : ''}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'members' && ` (${members.length})`}
          </button>
        ))}
      </nav>

      {activeTab === 'members' && (
        <div className="members-section">
          {isAdmin && (
            <button onClick={() => setShowAddMember(true)} className="add-member-btn">
              + Add Member
            </button>
          )}
          <div className="members-list">
            {sortedMembers.map((member) => (
              <div key={member.id} className="member-item">
                <div className="member-avatar">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" />
                  ) : (
                    <span>{member.name.charAt(0)}</span>
                  )}
                  {member.isOnline && <span className="online-dot"></span>}
                </div>
                <div className="member-info">
                  <span className="member-name">{member.name}</span>
                  <span className="member-role">{member.role}</span>
                </div>
                {isAdmin && member.id !== currentUserId && (
                  <div className="member-actions">
                    <select
                      value={member.role}
                      onChange={(e) => handlePromoteMember(member.id, e.target.value)}
                    >
                      <option value="admin">Admin</option>
                      <option value="moderator">Mod</option>
                      <option value="member">Member</option>
                    </select>
                    <button onClick={() => handleRemoveMember(member.id)} className="remove-btn">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {showAddMember && (
            <div className="add-member-form">
              <input
                type="text"
                value={addMemberQuery}
                onChange={(e) => setAddMemberQuery(e.target.value)}
                placeholder="Search by username..."
              />
              <button onClick={() => handleAddMember(addMemberQuery)}>Add</button>
              <button onClick={() => setShowAddMember(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pinned' && (
        <div className="pinned-section">
          {pinnedMessages.length === 0 ? (
            <p className="empty">No pinned messages.</p>
          ) : (
            pinnedMessages.map((msg) => (
              <div key={msg.id} className="pinned-item">
                <div className="pinned-content">
                  <span className="pinned-author">{msg.author}</span>
                  <p>{msg.content}</p>
                  <span className="pinned-date">{new Date(msg.pinnedAt).toLocaleDateString()}</span>
                </div>
                {isAdmin && <button onClick={() => handleUnpin(msg.id)}>Unpin</button>}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'polls' && (
        <div className="polls-section">
          <button onClick={() => setShowCreatePoll(true)} className="create-poll-btn">
            Create Poll
          </button>
          {polls.map((poll) => (
            <div key={poll.id} className="poll-card">
              <h4>{poll.question}</h4>
              <div className="poll-options">
                {poll.options.map((opt) => {
                  const percentage =
                    poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
                  const hasVoted = opt.voters.includes(currentUserId);
                  return (
                    <div
                      key={opt.id}
                      className={`poll-option ${hasVoted ? 'voted' : ''}`}
                      onClick={() => !hasVoted && handleVote(poll.id, opt.id)}
                    >
                      <div className="option-bar" style={{ width: `${percentage}%` }}></div>
                      <span className="option-text">{opt.text}</span>
                      <span className="option-votes">
                        {percentage}% ({opt.votes})
                      </span>
                    </div>
                  );
                })}
              </div>
              <span className="poll-total">{poll.totalVotes} votes</span>
            </div>
          ))}
          {showCreatePoll && (
            <div className="create-poll-form">
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a question..."
              />
              {pollOptions.map((opt, i) => (
                <input
                  key={i}
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const n = [...pollOptions];
                    n[i] = e.target.value;
                    setPollOptions(n);
                  }}
                  placeholder={`Option ${i + 1}`}
                />
              ))}
              <button onClick={() => setPollOptions((prev) => [...prev, ''])}>+ Add Option</button>
              <label>
                <input
                  type="checkbox"
                  checked={pollMultiChoice}
                  onChange={(e) => setPollMultiChoice(e.target.checked)}
                />{' '}
                Allow multiple choices
              </label>
              <div className="form-actions">
                <button onClick={handleCreatePoll} disabled={!pollQuestion.trim()}>
                  Create
                </button>
                <button onClick={() => setShowCreatePoll(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'photos' && (
        <div className="photos-section">
          {sharedPhotos.length === 0 ? (
            <p className="empty">No shared photos.</p>
          ) : (
            <div className="photo-grid">
              {sharedPhotos.map((photo) => (
                <div key={photo.id} className="photo-item">
                  <img src={photo.thumbnailUrl} alt="" />
                  <span className="photo-info">{photo.uploadedBy}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && isAdmin && (
        <div className="settings-section">
          <div className="form-group">
            <label>Group Name</label>
            <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              rows={3}
            />
          </div>
          <button onClick={handleUpdateSettings}>Save Settings</button>
        </div>
      )}

      {showMentions && (
        <div className="mention-autocomplete">
          {mentionResults.map((m) => (
            <button key={m.id} className="mention-item">
              <span>@{m.username}</span>
              <span className="mention-name">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupChat;
