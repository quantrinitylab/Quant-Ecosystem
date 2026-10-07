// ============================================================================
// QuantChat - GroupInfo Component
// Group details, member list, settings panel
// ============================================================================

import React, { useState } from 'react';
import type { Group, GroupMember, GroupSettings, GroupRole } from '../types';
import { apiClient } from '../services/api-client';

interface GroupInfoProps {
  group: Group;
  currentUserId: string;
  onClose: () => void;
  onUpdate: (group: Group) => void;
}

export const GroupInfo: React.FC<GroupInfoProps> = ({ group, currentUserId, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'members' | 'settings' | 'media'>('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  const currentMember = group.members.find(m => m.userId === currentUserId);
  const isAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const filteredMembers = group.members.filter(m =>
    m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRemoveMember = async (memberId: string) => {
    await apiClient.leaveGroup(group.id); // Simplified
  };

  const handleLeaveGroup = async () => {
    await apiClient.leaveGroup(group.id);
    onClose();
  };

  const getRoleBadge = (role: GroupRole): string => {
    switch (role) {
      case 'owner': return '👑';
      case 'admin': return '⭐';
      case 'moderator': return '🛡️';
      default: return '';
    }
  };

  return (
    <div className="group-info-panel">
      {/* Header */}
      <div className="group-info-header">
        <button className="back-btn" onClick={onClose}>&#8592;</button>
        <h2>Group Info</h2>
        {isAdmin && <button className="edit-btn">Edit</button>}
      </div>

      {/* Group avatar and name */}
      <div className="group-profile">
        <div className="group-avatar">
          {group.avatarUrl ? (
            <img src={group.avatarUrl} alt={group.name} />
          ) : (
            <div className="avatar-placeholder">{group.name.charAt(0).toUpperCase()}</div>
          )}
        </div>
        <h3>{group.name}</h3>
        {group.description && <p className="group-description">{group.description}</p>}
        <span className="member-count">{group.memberCount} members</span>
      </div>

      {/* Tabs */}
      <div className="info-tabs">
        <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>
          Members ({group.memberCount})
        </button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>
          Settings
        </button>
        <button className={activeTab === 'media' ? 'active' : ''} onClick={() => setActiveTab('media')}>
          Media
        </button>
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="members-tab">
          <div className="members-search">
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {isAdmin && (
            <button className="add-member-btn" onClick={() => setShowInvite(true)}>
              + Add Member
            </button>
          )}

          <div className="members-list">
            {filteredMembers.map(member => (
              <div key={member.userId} className="member-item">
                <div className="member-avatar">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt={member.displayName} />
                  ) : (
                    <div className="avatar-sm">{member.displayName.charAt(0)}</div>
                  )}
                </div>
                <div className="member-info">
                  <span className="member-name">
                    {member.displayName} {getRoleBadge(member.role)}
                    {member.userId === currentUserId && ' (You)'}
                  </span>
                  <span className="member-username">@{member.username}</span>
                </div>
                {isAdmin && member.userId !== currentUserId && member.role !== 'owner' && (
                  <div className="member-actions">
                    <button onClick={() => handleRemoveMember(member.userId)}>Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="settings-tab">
          <div className="setting-item">
            <span>Disappearing Messages</span>
            <select value={group.settings.disappearMode} disabled={!isAdmin}>
              <option value="off">Off</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </div>
          <div className="setting-item">
            <span>Allow Member Invites</span>
            <input type="checkbox" checked={group.settings.allowMemberInvites} disabled={!isAdmin} readOnly />
          </div>
          <div className="setting-item">
            <span>Admin Only Post</span>
            <input type="checkbox" checked={group.settings.adminOnlyPost} disabled={!isAdmin} readOnly />
          </div>
          <div className="setting-item">
            <span>Slow Mode (seconds)</span>
            <span>{group.settings.slowMode || 'Off'}</span>
          </div>
          <div className="setting-item">
            <span>Join Approval Required</span>
            <input type="checkbox" checked={group.settings.joinApproval} disabled={!isAdmin} readOnly />
          </div>

          {/* Invite link */}
          {group.inviteLink && (
            <div className="invite-link-section">
              <span>Invite Link:</span>
              <code>{group.inviteLink}</code>
              <button onClick={() => navigator.clipboard?.writeText(group.inviteLink || '')}>Copy</button>
            </div>
          )}
        </div>
      )}

      {/* Media Tab */}
      {activeTab === 'media' && (
        <div className="media-tab">
          <p className="empty-state">Shared media will appear here</p>
        </div>
      )}

      {/* Actions */}
      <div className="group-actions">
        {group.inviteCode && (
          <button className="action-btn">Share Invite Code: {group.inviteCode}</button>
        )}
        <button className="action-btn danger" onClick={handleLeaveGroup}>
          Leave Group
        </button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="invite-modal">
          <div className="modal-content">
            <h3>Invite Members</h3>
            <input type="text" placeholder="Search contacts..." />
            <button onClick={() => setShowInvite(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupInfo;
