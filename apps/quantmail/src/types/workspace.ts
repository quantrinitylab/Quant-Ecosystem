// ============================================================================
// Workspace collaboration types (shared workspace + roles + email invites)
// ============================================================================

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type InviteRole = Exclude<WorkspaceRole, 'OWNER'>;
export type WorkspaceInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan: string;
  role: WorkspaceRole;
  memberCount: number;
  pendingInviteCount: number;
  joinedAt: string;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  email: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isYou: boolean;
}

export interface WorkspaceInvite {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: WorkspaceInviteStatus;
  message: string | null;
  invitedByName: string | null;
  expiresAt: string;
  lastSentAt: string;
  sendCount: number;
  createdAt: string;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan: string;
  createdAt: string;
  role: WorkspaceRole;
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
}

export interface InviteSendResult {
  email: string;
  status: 'invited' | 'already_member' | 'failed';
  inviteId?: string;
  inviteUrl?: string;
  emailSent?: boolean;
  reason?: string;
}

export interface InvitePreview {
  email: string;
  role: WorkspaceRole;
  status: WorkspaceInviteStatus;
  message: string | null;
  expiresAt: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    memberCount: number;
  };
  invitedBy: { name: string; email: string | null; avatarUrl: string | null };
}

/** Capability matrix — one place that decides which buttons a role may use. */
export const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export function can(
  role: WorkspaceRole | undefined,
  action: 'invite' | 'manageMembers' | 'editWorkspace' | 'deleteWorkspace' | 'transferOwnership',
): boolean {
  if (!role) return false;
  switch (action) {
    case 'invite':
    case 'manageMembers':
    case 'editWorkspace':
      return WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK.ADMIN;
    case 'deleteWorkspace':
    case 'transferOwnership':
      return role === 'OWNER';
    default:
      return false;
  }
}

export const ROLE_COPY: Record<WorkspaceRole, { label: string; blurb: string }> = {
  OWNER: { label: 'Owner', blurb: 'Full control — billing, deletion, ownership transfer.' },
  ADMIN: { label: 'Admin', blurb: 'Invite people, manage roles and workspace settings.' },
  MEMBER: { label: 'Member', blurb: 'Work on the project: mail, drive, calendar, CodeHub.' },
  VIEWER: { label: 'Viewer', blurb: 'Read-only access — can look, cannot change.' },
};
