// ============================================================================
// QuantMail - Sidebar Component
// Navigation sidebar with folders/labels
//
// SUPERSEDED AND UNMOUNTED. Nothing imports this file — `AppShell` renders
// `components/AppSidebar.tsx`, which is the sidebar the app actually ships.
// This one is an early prototype: `renderNavItem` prints `item.icon` as text,
// so every row would read the literal word "inbox" or "star" instead of showing
// a glyph. It is kept because `.agents/tasks/.../FEAT-002.json` still points at
// it, not because it works.
//
// Its footer used to render `3.5 GB of 15 GB used` over a 35%-wide bar, both
// hardcoded, contradicting the `1.2 / 15 GB` that AppSidebar hardcoded and the
// real figure the Drive page reads. Both are now sourced from
// `hooks/useStorageQuota.ts`; this file simply no longer claims a number.
// ============================================================================

import React, { useState } from 'react';
import type { EmailLabel } from '../types';

export type SidebarSection =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'starred'
  | 'archive'
  | 'trash'
  | 'spam'
  | 'repos'
  | 'pipelines'
  | 'calendar'
  | 'contacts'
  | 'settings';

export interface SidebarProps {
  activeSection: SidebarSection;
  labels: EmailLabel[];
  unreadCounts: Record<string, number>;
  onNavigate: (section: SidebarSection) => void;
  onLabelClick: (label: string) => void;
  onCreateLabel: (name: string, color: string) => void;
  onCompose: () => void;
  userName: string;
  userEmail: string;
  userAvatar?: string;
}

interface NavItem {
  id: SidebarSection;
  label: string;
  icon: string;
  countKey?: string;
}

const mailItems: NavItem[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', countKey: 'inbox' },
  { id: 'starred', label: 'Starred', icon: 'star', countKey: 'starred' },
  { id: 'sent', label: 'Sent', icon: 'send' },
  { id: 'drafts', label: 'Drafts', icon: 'file', countKey: 'drafts' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'spam', label: 'Spam', icon: 'alert', countKey: 'spam' },
  { id: 'trash', label: 'Trash', icon: 'trash' },
];

const codeItems: NavItem[] = [
  { id: 'repos', label: 'Repositories', icon: 'code' },
  { id: 'pipelines', label: 'CI/CD', icon: 'play' },
];

const otherItems: NavItem[] = [
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'contacts', label: 'Contacts', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar(props: SidebarProps): React.ReactElement {
  const {
    activeSection,
    labels,
    unreadCounts,
    onNavigate,
    onLabelClick,
    onCreateLabel,
    onCompose,
    userName,
    userEmail,
    userAvatar,
  } = props;

  const [showNewLabel, setShowNewLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#4285f4');
  const [labelsExpanded, setLabelsExpanded] = useState(true);

  const handleCreateLabel = () => {
    if (!newLabelName.trim()) return;
    onCreateLabel(newLabelName, newLabelColor);
    setNewLabelName('');
    setShowNewLabel(false);
  };

  const renderNavItem = (item: NavItem) => {
    const count = item.countKey ? unreadCounts[item.countKey] : undefined;
    return (
      <li key={item.id}>
        <button
          className={`sidebar-item ${activeSection === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <span className="sidebar-icon">{item.icon}</span>
          <span className="sidebar-label">{item.label}</span>
          {count !== undefined && count > 0 && (
            <span className="sidebar-count">{count > 99 ? '99+' : count}</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <aside className="sidebar">
      {/* User Profile */}
      <div className="sidebar-profile">
        <div className="profile-avatar">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} />
          ) : (
            <span className="avatar-initials">{userName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="profile-info">
          <span className="profile-name">{userName}</span>
          <span className="profile-email">{userEmail}</span>
        </div>
      </div>

      {/* Compose Button */}
      <div className="sidebar-compose">
        <button className="btn btn-primary btn-full" onClick={onCompose}>
          <span className="btn-icon">+</span> Compose
        </button>
      </div>

      {/* Mail Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section">
          <h4 className="nav-section-title">Mail</h4>
          <ul className="nav-list">{mailItems.map(renderNavItem)}</ul>
        </div>

        {/* Code Navigation */}
        <div className="nav-section">
          <h4 className="nav-section-title">Code</h4>
          <ul className="nav-list">{codeItems.map(renderNavItem)}</ul>
        </div>

        {/* Other Navigation */}
        <div className="nav-section">
          <h4 className="nav-section-title">More</h4>
          <ul className="nav-list">{otherItems.map(renderNavItem)}</ul>
        </div>

        {/* Labels */}
        <div className="nav-section">
          <div className="nav-section-header">
            <h4 className="nav-section-title" onClick={() => setLabelsExpanded(!labelsExpanded)}>
              Labels {labelsExpanded ? '▾' : '▸'}
            </h4>
            <button
              className="btn-icon btn-sm"
              onClick={() => setShowNewLabel(!showNewLabel)}
              title="Create label"
            >
              +
            </button>
          </div>

          {labelsExpanded && (
            <ul className="nav-list labels-list">
              {labels
                .filter((l) => !l.isSystem)
                .map((label) => (
                  <li key={label.id}>
                    <button
                      className="sidebar-item label-item"
                      onClick={() => onLabelClick(label.name)}
                    >
                      <span className="label-dot" style={{ backgroundColor: label.color }} />
                      <span className="sidebar-label">{label.name}</span>
                      {label.unreadCount > 0 && (
                        <span className="sidebar-count">{label.unreadCount}</span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}

          {showNewLabel && (
            <div className="new-label-form">
              <input
                type="text"
                placeholder="Label name"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                autoFocus
              />
              <input
                type="color"
                value={newLabelColor}
                onChange={(e) => setNewLabelColor(e.target.value)}
              />
              <button className="btn btn-sm btn-primary" onClick={handleCreateLabel}>
                Add
              </button>
              <button className="btn btn-sm btn-outline" onClick={() => setShowNewLabel(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}

export default Sidebar;
