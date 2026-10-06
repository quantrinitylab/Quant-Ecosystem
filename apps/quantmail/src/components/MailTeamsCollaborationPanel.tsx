'use client';

// ============================================================================
// QuantMail — Workspaces & Teams Collaboration Panel
// Real-time repository collaboration, teammate invite selector, live activity
// stream with automated git events, presence indicators & role management.
// Obsidian luxury palette (#090A0E / #111318 / #1F2430), strictly ZERO raw Unicode emojis.
// ============================================================================

import React, { useState, useMemo, useRef, useEffect } from 'react';

// ============================================================================
// Pure SVG Vector Icons (Strictly Zero Raw Unicode Emojis)
// ============================================================================

function IconBuilding({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01M8 18h.01M16 18h.01" strokeWidth="2.5" />
    </svg>
  );
}

function IconGitRepo({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h7" />
    </svg>
  );
}

function IconGitBranch({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function IconGitCommit({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  );
}

function IconGitPullRequest({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IconUserPlus({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function IconUsers({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconSend({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconChevronDown({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconCheck({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconShieldLock({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconRocket({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-2.05 9a22 22 0 0 1-3.95 2l-3-3z" />
      <path d="M9 12l2 2" />
    </svg>
  );
}

function IconSearch({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconMessageSquare({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconCodeSlash({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function IconSparkles({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function IconArrowLeft({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

// ============================================================================
// Types & Domain Models
// ============================================================================

export type MemberPresence = 'active' | 'in_review' | 'off_grid';
export type MemberRole = 'Admin' | 'Maintainer' | 'Contributor' | 'Viewer';

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  tier: string;
  repoCount: number;
  memberCount: number;
  color: string;
}

export interface RepositoryItem {
  id: string;
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  openPrCount: number;
  commitCount: number;
  lastActive: string;
  collaboratorIds: string[];
}

export interface CollaboratorMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  presence: MemberPresence;
  avatarColor: string;
  statusText: string;
  isCurrentUser?: boolean;
}

export type StreamEventType = 'chat' | 'commit' | 'pull_request' | 'deploy' | 'issue';

export interface ActivityStreamEvent {
  id: string;
  type: StreamEventType;
  authorName: string;
  authorEmail: string;
  authorAvatarColor: string;
  timestamp: string;
  content: string;
  repoName: string;
  meta?: {
    commitSha?: string;
    branch?: string;
    prNumber?: number;
    prStatus?: 'open' | 'merged' | 'changes_requested';
    deployEnv?: string;
    deployStatus?: 'success' | 'running' | 'failed';
    codeSnippet?: string;
    tags?: string[];
  };
}

// ============================================================================
// Initial Mock Data (Enterprise Parity & High-Fidelity)
// ============================================================================

const INITIAL_WORKSPACES: WorkspaceItem[] = [
  {
    id: 'ws-sovereign-core',
    name: 'Quant Sovereign Core',
    slug: 'quant-core',
    tier: 'Enterprise Sovereign',
    repoCount: 8,
    memberCount: 24,
    color: '#FF8C42',
  },
  {
    id: 'ws-mobile-team',
    name: 'QuantMobile Team',
    slug: 'quant-mobile',
    tier: 'Dedicated Fleet',
    repoCount: 4,
    memberCount: 16,
    color: '#38BDF8',
  },
  {
    id: 'ws-alpha-ai',
    name: 'Alpha AI Labs',
    slug: 'alpha-ai-labs',
    tier: 'Autonomous Swarm',
    repoCount: 12,
    memberCount: 32,
    color: '#A78BFA',
  },
  {
    id: 'ws-cloud-infra',
    name: 'Quant Cloud Infra',
    slug: 'cloud-infra',
    tier: 'EKS Staging Grid',
    repoCount: 6,
    memberCount: 12,
    color: '#10B981',
  },
];

const INITIAL_REPOSITORIES: RepositoryItem[] = [
  {
    id: 'repo-quant-ecosystem',
    name: 'Quant-Ecosystem',
    fullName: 'quantrinitylab/Quant-Ecosystem',
    description: 'Master enterprise monorepo housing QuantMail, QuantDrive, Calendar & QuantGit.',
    defaultBranch: 'main',
    openPrCount: 4,
    commitCount: 1428,
    lastActive: '2m ago',
    collaboratorIds: ['mem-1', 'mem-2', 'mem-3', 'mem-4', 'mem-5', 'mem-6'],
  },
  {
    id: 'repo-quantmail',
    name: 'quantmail',
    fullName: 'quantrinitylab/quantmail',
    description: 'Next.js 15 sovereign email client with Superhuman shortcuts and local ONNX lenses.',
    defaultBranch: 'main',
    openPrCount: 2,
    commitCount: 890,
    lastActive: '8m ago',
    collaboratorIds: ['mem-1', 'mem-2', 'mem-4'],
  },
  {
    id: 'repo-mobile-apk',
    name: 'quant-mobile-apk',
    fullName: 'quantrinitylab/quant-mobile-apk',
    description: 'Android APK Jetpack Compose suite with bottom navigation and zero stubs.',
    defaultBranch: 'release-v39',
    openPrCount: 1,
    commitCount: 420,
    lastActive: '24m ago',
    collaboratorIds: ['mem-3', 'mem-5'],
  },
  {
    id: 'repo-swarm-runtime',
    name: 'quant-swarm-runtime',
    fullName: 'quantrinitylab/quant-swarm-runtime',
    description: 'Tripartite Swarm Orchestrator (Node A, B, C) and Notion AI Astra runtime.',
    defaultBranch: 'main',
    openPrCount: 3,
    commitCount: 612,
    lastActive: '1h ago',
    collaboratorIds: ['mem-1', 'mem-2', 'mem-6'],
  },
];

const INITIAL_COLLABORATORS: CollaboratorMember[] = [
  {
    id: 'mem-1',
    name: 'Astra Executive Lead',
    email: 'astra.ceo@quantmail.in',
    role: 'Admin',
    presence: 'active',
    avatarColor: '#FF8C42',
    statusText: 'Reviewing PR #298 Staging Cluster',
  },
  {
    id: 'mem-2',
    name: 'Node A Orchestrator',
    email: 'node-a@quantmail.in',
    role: 'Maintainer',
    presence: 'active',
    avatarColor: '#A78BFA',
    statusText: 'Track 3 Sovereign GitHub Parity',
  },
  {
    id: 'mem-3',
    name: 'Dev 6 CodeHub Lead',
    email: 'dev6.repos@quantmail.in',
    role: 'Maintainer',
    presence: 'in_review',
    avatarColor: '#38BDF8',
    statusText: 'Merging 3-way tree diffs',
  },
  {
    id: 'mem-4',
    name: 'Security Sentinel (Dev 2)',
    email: 'sentinel.qa@quantmail.in',
    role: 'Admin',
    presence: 'active',
    avatarColor: '#10B981',
    statusText: 'Vitest & SAIF Compliance 100% Green',
  },
  {
    id: 'mem-5',
    name: 'Mobile Core Architect',
    email: 'mobile.compose@quantmail.in',
    role: 'Contributor',
    presence: 'in_review',
    avatarColor: '#F59E0B',
    statusText: 'Compiling quant-mail.apk release build',
  },
  {
    id: 'mem-6',
    name: 'Node C CLI Worker',
    email: 'node-c.agy@quantmail.in',
    role: 'Contributor',
    presence: 'off_grid',
    avatarColor: '#6B7280',
    statusText: 'Background telemetry poll sync',
  },
];

const INITIAL_EVENTS: ActivityStreamEvent[] = [
  {
    id: 'evt-1',
    type: 'deploy',
    authorName: 'Node C CLI Worker',
    authorEmail: 'node-c.agy@quantmail.in',
    authorAvatarColor: '#10B981',
    timestamp: 'Just now',
    content: 'Automated deployment succeeded on Kubernetes staging cluster',
    repoName: 'Quant-Ecosystem',
    meta: {
      deployEnv: 'quant-staging',
      deployStatus: 'success',
      tags: ['20/20 Pods Healthy', 'Zero Downtime Rolling Update'],
    },
  },
  {
    id: 'evt-2',
    type: 'pull_request',
    authorName: 'Dev 6 CodeHub Lead',
    authorEmail: 'dev6.repos@quantmail.in',
    authorAvatarColor: '#38BDF8',
    timestamp: '4m ago',
    content: 'Opened PR #299: Sovereign Teams Collaboration & Swarm Access Matrix',
    repoName: 'Quant-Ecosystem',
    meta: {
      prNumber: 299,
      prStatus: 'open',
      branch: 'wave39/collaboration-hub',
    },
  },
  {
    id: 'evt-3',
    type: 'chat',
    authorName: 'Astra Executive Lead',
    authorEmail: 'astra.ceo@quantmail.in',
    authorAvatarColor: '#FF8C42',
    timestamp: '7m ago',
    content: 'All team members invited to collaborate on QuantGit repos now receive instant notifications inside QuantMail with real-time presence indicators.',
    repoName: 'Quant-Ecosystem',
  },
  {
    id: 'evt-4',
    type: 'commit',
    authorName: 'Node A Orchestrator',
    authorEmail: 'node-a@quantmail.in',
    authorAvatarColor: '#A78BFA',
    timestamp: '14m ago',
    content: 'feat(git): add live activity streaming webhook listener and collaborator permissions matrix',
    repoName: 'Quant-Ecosystem',
    meta: {
      commitSha: '9a7f3c1',
      branch: 'main',
      tags: ['+184', '-12', 'Verified Signed Commit'],
    },
  },
  {
    id: 'evt-5',
    type: 'chat',
    authorName: 'Security Sentinel (Dev 2)',
    authorEmail: 'sentinel.qa@quantmail.in',
    authorAvatarColor: '#10B981',
    timestamp: '22m ago',
    content: 'Strictly zero raw Unicode emojis policy verified across all collaboration panels. Hairline obsidian aesthetic complies with luxury standard.',
    repoName: 'Quant-Ecosystem',
  },
];

// ============================================================================
// Props
// ============================================================================

export interface MailTeamsCollaborationPanelProps {
  onBackToInbox?: () => void;
  onNavigateTab?: (tab: string) => void;
}

// ============================================================================
// Mobile single-pane helpers (exported for tests)
// ============================================================================

/** Which pane is visible on mobile (<md). Desktop always shows all three. */
export type TeamsMobilePane = 'repos' | 'stream' | 'team';

/**
 * Returns the mobile visibility class for a Teams pane.
 * The active pane is `flex`; inactive panes are `hidden` on mobile.
 * Desktop (md+) always renders all panes — callers append `md:flex`.
 */
export function teamsPaneVisibility(activePane: TeamsMobilePane, pane: TeamsMobilePane): string {
  return activePane === pane ? 'flex' : 'hidden';
}

// ============================================================================
// Main Component: MailTeamsCollaborationPanel
// ============================================================================

export function MailTeamsCollaborationPanel({
  onBackToInbox,
  onNavigateTab,
}: MailTeamsCollaborationPanelProps) {
  // State
  const [workspaces] = useState<WorkspaceItem[]>(INITIAL_WORKSPACES);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('ws-sovereign-core');
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  const [repositories] = useState<RepositoryItem[]>(INITIAL_REPOSITORIES);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('repo-quant-ecosystem');

  // Mobile single-pane navigation: 'repos' (repo list), 'stream' (collaboration
  // stream), or 'team' (collaborators). Desktop (md+) always shows all three
  // panes side-by-side; this state only gates which pane is visible below md.
  const [mobilePane, setMobilePane] = useState<TeamsMobilePane>('repos');

  const [collaborators, setCollaborators] = useState<CollaboratorMember[]>(INITIAL_COLLABORATORS);
  const [activityStream, setActivityStream] = useState<ActivityStreamEvent[]>(INITIAL_EVENTS);

  // Filters & Search
  const [streamFilter, setStreamFilter] = useState<'all' | 'chat' | 'events'>('all');
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [chatMessage, setChatMessage] = useState('');

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('Maintainer');
  const [inviteTargetRepo, setInviteTargetRepo] = useState<string>('all');
  const [inviteSuccessToast, setInviteSuccessToast] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Active items
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) || workspaces[0],
    [workspaces, selectedWorkspaceId],
  );

  const activeRepo = useMemo(
    () => repositories.find((r) => r.id === selectedRepoId) || repositories[0],
    [repositories, selectedRepoId],
  );

  // Filtered collaborators for active repo
  const repoCollaborators = useMemo(() => {
    const q = collaboratorSearch.trim().toLowerCase();
    return collaborators.filter((m) => {
      const isAssigned = activeRepo.collaboratorIds.includes(m.id);
      if (!isAssigned) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
    });
  }, [collaborators, activeRepo, collaboratorSearch]);

  // Filtered activity stream
  const filteredStream = useMemo(() => {
    return activityStream.filter((ev) => {
      if (ev.repoName !== activeRepo.name && ev.repoName !== 'Quant-Ecosystem') return false;
      if (streamFilter === 'all') return true;
      if (streamFilter === 'chat') return ev.type === 'chat';
      if (streamFilter === 'events') return ev.type !== 'chat';
      return true;
    });
  }, [activityStream, activeRepo, streamFilter]);

  // Scroll to bottom of chat when new message arrives
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [filteredStream]);

  // Select a repo; on mobile this also switches to the single-pane detail view.
  const handleSelectRepo = (repoId: string) => {
    setSelectedRepoId(repoId);
    setMobilePane('stream');
  };

  // Handle send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const newEvt: ActivityStreamEvent = {
      id: `evt-${Date.now()}`,
      type: 'chat',
      authorName: 'Astra Executive Lead',
      authorEmail: 'astra.ceo@quantmail.in',
      authorAvatarColor: '#FF8C42',
      timestamp: 'Just now',
      content: chatMessage.trim(),
      repoName: activeRepo.name,
    };

    setActivityStream((prev) => [...prev, newEvt]);
    setChatMessage('');
  };

  // Handle fast slash trigger
  const handleSlashAction = (action: string) => {
    if (action === 'pr') {
      const prEvt: ActivityStreamEvent = {
        id: `evt-${Date.now()}`,
        type: 'pull_request',
        authorName: 'Astra Executive Lead',
        authorEmail: 'astra.ceo@quantmail.in',
        authorAvatarColor: '#FF8C42',
        timestamp: 'Just now',
        content: `Created PR #${Math.floor(Math.random() * 800) + 300}: Sync collaboration states with QuantGit branch ${activeRepo.defaultBranch}`,
        repoName: activeRepo.name,
        meta: {
          prNumber: Math.floor(Math.random() * 800) + 300,
          prStatus: 'open',
          branch: activeRepo.defaultBranch,
        },
      };
      setActivityStream((prev) => [...prev, prEvt]);
    } else if (action === 'commit') {
      const commitSha = Math.random().toString(16).substring(2, 9);
      const commitEvt: ActivityStreamEvent = {
        id: `evt-${Date.now()}`,
        type: 'commit',
        authorName: 'Astra Executive Lead',
        authorEmail: 'astra.ceo@quantmail.in',
        authorAvatarColor: '#FF8C42',
        timestamp: 'Just now',
        content: `commit ${commitSha}: update workspace collaborator policy and stream telemetry`,
        repoName: activeRepo.name,
        meta: {
          commitSha,
          branch: activeRepo.defaultBranch,
          tags: ['+48', '-3', 'GPG Verified'],
        },
      };
      setActivityStream((prev) => [...prev, commitEvt]);
    } else if (action === 'deploy') {
      const deployEvt: ActivityStreamEvent = {
        id: `evt-${Date.now()}`,
        type: 'deploy',
        authorName: 'Astra Executive Lead',
        authorEmail: 'astra.ceo@quantmail.in',
        authorAvatarColor: '#FF8C42',
        timestamp: 'Just now',
        content: `Triggered staging deployment to EKS cluster (${activeRepo.name})`,
        repoName: activeRepo.name,
        meta: {
          deployEnv: 'quant-staging',
          deployStatus: 'success',
          tags: ['All pods healthy'],
        },
      };
      setActivityStream((prev) => [...prev, deployEvt]);
    } else if (action === 'invite') {
      setShowInviteModal(true);
    }
  };

  // Handle send invitation
  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const newCollab: CollaboratorMember = {
      id: `mem-${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail.trim(),
      role: inviteRole,
      presence: 'active',
      avatarColor: '#10B981',
      statusText: `Invited to ${inviteTargetRepo === 'all' ? 'All repositories' : activeRepo.name}`,
    };

    setCollaborators((prev) => [newCollab, ...prev]);

    // Also add to active repo
    activeRepo.collaboratorIds.push(newCollab.id);

    // Activity log event
    const inviteEvt: ActivityStreamEvent = {
      id: `evt-${Date.now()}`,
      type: 'chat',
      authorName: 'Astra Executive Lead',
      authorEmail: 'astra.ceo@quantmail.in',
      authorAvatarColor: '#FF8C42',
      timestamp: 'Just now',
      content: `Invited ${inviteEmail.trim()} as ${inviteRole} to collaborate on ${activeRepo.name}. Invitation email dispatched via QuantMail.`,
      repoName: activeRepo.name,
    };
    setActivityStream((prev) => [...prev, inviteEvt]);

    setInviteSuccessToast(`Invitation sent to ${inviteEmail}`);
    setTimeout(() => setInviteSuccessToast(null), 4000);

    setInviteEmail('');
    setShowInviteModal(false);
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#090A0E] text-[#EDEDED] font-sans overflow-hidden">
      {/* Top Banner / Workspace Switcher Header */}
      <header className="shrink-0 border-b border-[#1F2430] bg-[#0E1015]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back button + Workspace Switcher */}
          <div className="flex items-center gap-3">
            {onBackToInbox && (
              <button
                type="button"
                onClick={onBackToInbox}
                className="flex size-8 items-center justify-center rounded-lg border border-[#282C35] bg-[#14171F] text-[#A1A4AC] hover:border-[#FF8C42]/50 hover:text-white transition-all shadow-sm"
                title="Back to Inbox"
                aria-label="Back to Inbox"
              >
                <IconArrowLeft className="size-4" />
              </button>
            )}

            {/* Workspace Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                className="flex items-center gap-2.5 rounded-xl border border-[#282C35] bg-[#14171F] px-3 py-1.5 hover:border-[#FF8C42]/40 transition-all text-left shadow-sm"
                aria-haspopup="true"
                aria-expanded={isWorkspaceMenuOpen}
              >
                <div
                  className="flex size-6 items-center justify-center rounded-lg font-bold text-[11px] text-black shrink-0"
                  style={{ backgroundColor: activeWorkspace.color }}
                >
                  <IconBuilding className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate max-w-[160px] sm:max-w-[200px]">
                      {activeWorkspace.name}
                    </span>
                    <IconChevronDown className="size-3 text-[#A1A4AC]" />
                  </div>
                  <div className="text-[10px] text-[#A1A4AC] flex items-center gap-1">
                    <span className="text-[#FF8C42] font-semibold">{activeWorkspace.tier}</span>
                    <span>•</span>
                    <span>{activeWorkspace.memberCount} members</span>
                  </div>
                </div>
              </button>

              {/* Dropdown Menu */}
              {isWorkspaceMenuOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-[#282C35] bg-[#111318] p-1.5 shadow-2xl backdrop-blur-xl">
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#A1A4AC]">
                    Select Enterprise Workspace
                  </div>
                  <div className="space-y-1">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkspaceId(ws.id);
                          setIsWorkspaceMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-all ${
                          ws.id === activeWorkspace.id
                            ? 'bg-[#FF8C42]/15 border border-[#FF8C42]/40 text-white'
                            : 'hover:bg-[#1A1D24] text-[#A1A4AC] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: ws.color }}
                          />
                          <div className="truncate">
                            <div className="text-xs font-medium text-white truncate">{ws.name}</div>
                            <div className="text-[10px] text-[#A1A4AC]">{ws.tier}</div>
                          </div>
                        </div>
                        {ws.id === activeWorkspace.id && (
                          <IconCheck className="size-3.5 text-[#FF8C42] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Switch between Panels */}
            {onNavigateTab && (
              <div className="hidden sm:flex items-center gap-1 rounded-lg border border-[#282C35] bg-[#111318] p-0.5">
                <button
                  type="button"
                  onClick={() => onNavigateTab('teams')}
                  className="rounded-md bg-[#FF8C42]/20 px-2.5 py-1 text-[11px] font-semibold text-[#FF8C42] border border-[#FF8C42]/40"
                >
                  Teams
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('agents')}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#A1A4AC] hover:text-white hover:bg-[#1A1D24] transition-all flex items-center gap-1"
                >
                  <IconSparkles className="size-3 text-[#A78BFA]" />
                  <span>Swarm Agents</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: Invite Teammate Button + Fast Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] px-3.5 py-1.5 text-xs font-bold text-black transition-all shadow-[0_0_15px_rgba(255,140,66,0.25)] active:scale-95"
            >
              <IconUserPlus className="size-3.5 text-black" />
              <span>Invite Teammate</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile single-pane nav: back + Stream/Team tabs (mobile only).
          On md+ all three panes render side-by-side and this strip is hidden. */}
      {mobilePane !== 'repos' && (
        <div className="md:hidden shrink-0 flex items-center gap-2 border-b border-[#1F2430] bg-[#0E1015]/95 px-3 py-2">
          <button
            type="button"
            onClick={() => setMobilePane('repos')}
            className="flex size-8 items-center justify-center rounded-lg border border-[#282C35] bg-[#14171F] text-[#A1A4AC] hover:text-white transition-all shrink-0"
            aria-label="Back to repositories"
            title="Back to repositories"
          >
            <IconArrowLeft className="size-4" />
          </button>
          <span className="text-xs font-bold text-white truncate flex-1 min-w-0">
            {activeRepo.name}
          </span>
          <div
            className="flex items-center gap-0.5 rounded-lg border border-[#282C35] bg-[#111318] p-0.5 shrink-0"
            role="tablist"
            aria-label="Detail view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === 'stream'}
              onClick={() => setMobilePane('stream')}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-all ${
                mobilePane === 'stream'
                  ? 'bg-[#FF8C42]/20 text-[#FF8C42] border border-[#FF8C42]/40'
                  : 'text-[#A1A4AC] hover:text-white border border-transparent'
              }`}
            >
              Stream
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === 'team'}
              onClick={() => setMobilePane('team')}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-all ${
                mobilePane === 'team'
                  ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                  : 'text-[#A1A4AC] hover:text-white border border-transparent'
              }`}
            >
              Team
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Left Repositories + Middle Activity/Chat + Right Collaborators.
          Desktop (md+): three-pane grid. Mobile: single visible pane fills the
          row (grid-rows-1) via the mobilePane state above. */}
      <div className="flex-1 grid grid-cols-1 grid-rows-1 md:grid-cols-12 md:grid-rows-none min-h-0 divide-y md:divide-y-0 md:divide-x divide-[#1F2430]">
        
        {/* Left Column: Repository Selector & Git Overview (3 Cols).
            Mobile: visible only in 'repos' pane; full-width single pane. */}
        <aside className={`md:col-span-3 ${teamsPaneVisibility(mobilePane, 'repos')} md:flex flex-col min-h-0 bg-[#0C0E12]/80 p-3 sm:p-4 space-y-3 overflow-y-auto no-scrollbar`}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#A1A4AC] flex items-center gap-1.5">
              <IconGitRepo className="size-3.5 text-[#38BDF8]" />
              <span>QuantGit Repositories</span>
            </h2>
            <span className="text-[10px] font-mono text-[#A1A4AC] px-1.5 py-0.5 rounded bg-[#161820] border border-[#282C35]">
              {repositories.length} Active
            </span>
          </div>

          {/* Repo list */}
          <div className="space-y-1.5">
            {repositories.map((repo) => {
              const isSelected = repo.id === selectedRepoId;
              return (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => handleSelectRepo(repo.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[#FF8C42]/50 bg-[#FF8C42]/10 shadow-[0_0_12px_rgba(255,140,66,0.12)]'
                      : 'border-[#282C35] bg-[#12141A]/70 hover:border-[#38BDF8]/40 hover:bg-[#161922]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-white truncate">{repo.name}</span>
                    <span className="text-[10px] text-[#A1A4AC] shrink-0">{repo.lastActive}</span>
                  </div>
                  <p className="text-[11px] text-[#A1A4AC] line-clamp-1 mt-0.5 leading-snug">
                    {repo.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-[#A1A4AC]">
                    <span className="flex items-center gap-1 text-[#38BDF8]">
                      <IconGitBranch className="size-3" />
                      {repo.defaultBranch}
                    </span>
                    <span className="flex items-center gap-1 text-[#A78BFA]">
                      <IconGitPullRequest className="size-3" />
                      {repo.openPrCount} PRs
                    </span>
                    <span className="flex items-center gap-1 text-[#10B981]">
                      <IconGitCommit className="size-3" />
                      {repo.commitCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Repo Metadata Box */}
          <div className="rounded-xl border border-[#282C35] bg-[#111318] p-3 space-y-2 mt-auto">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#A1A4AC]">Active Context:</span>
              <span className="font-bold text-white truncate max-w-[130px]">{activeRepo.fullName}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#A1A4AC]">Security Sync:</span>
              <span className="text-[#10B981] font-semibold flex items-center gap-1">
                <IconShieldLock className="size-3" />
                Signed & Verified
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#A1A4AC]">Collaborators:</span>
              <span className="text-[#EDEDED] font-mono">{activeRepo.collaboratorIds.length} members</span>
            </div>
          </div>
        </aside>

        {/* Center Column: Live Activity Stream & Real-Time Chat (6 Cols).
            Mobile: visible only in 'stream' pane; full-width single pane. */}
        <main className={`md:col-span-6 ${teamsPaneVisibility(mobilePane, 'stream')} md:flex flex-col min-h-0 bg-[#090A0E]`}>
          {/* Header Filters */}
          <div className="shrink-0 flex items-center justify-between border-b border-[#1F2430] bg-[#0E1015] px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <IconMessageSquare className="size-4 text-[#FF8C42] shrink-0" />
              <div className="truncate">
                <h3 className="text-xs font-bold text-white truncate">
                  {activeRepo.name} Collaboration Stream
                </h3>
                <p className="text-[10px] text-[#A1A4AC]">Real-time discussions & automated git webhooks</p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 rounded-lg border border-[#282C35] bg-[#14171F] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setStreamFilter('all')}
                className={`rounded px-2 py-0.5 transition-all ${
                  streamFilter === 'all' ? 'bg-[#FF8C42] font-bold text-black' : 'text-[#A1A4AC] hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStreamFilter('chat')}
                className={`rounded px-2 py-0.5 transition-all ${
                  streamFilter === 'chat' ? 'bg-[#FF8C42] font-bold text-black' : 'text-[#A1A4AC] hover:text-white'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setStreamFilter('events')}
                className={`rounded px-2 py-0.5 transition-all ${
                  streamFilter === 'events' ? 'bg-[#FF8C42] font-bold text-black' : 'text-[#A1A4AC] hover:text-white'
                }`}
              >
                Git Events
              </button>
            </div>
          </div>

          {/* Activity Scroll View */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3.5 scroll-smooth"
          >
            {filteredStream.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <IconMessageSquare className="size-8 text-[#282C35] mb-3" />
                <p className="text-xs font-bold text-[#A1A4AC]">No activity in this stream yet</p>
                <p className="text-[11px] text-[#7D8590] mt-1.5 max-w-[240px] leading-relaxed">
                  Send a message below or use the quick triggers to log a PR, commit, or deploy event.
                </p>
              </div>
            )}
            {filteredStream.map((item) => {
              const isGitEvent = item.type !== 'chat';

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 transition-all ${
                    isGitEvent
                      ? 'border-[#282C35] bg-[#11141C]/80 hover:border-[#38BDF8]/40'
                      : 'border-[#232732] bg-[#141722]/90 hover:border-[#FF8C42]/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-black shrink-0"
                        style={{ backgroundColor: item.authorAvatarColor }}
                      >
                        {item.authorName.charAt(0)}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white">{item.authorName}</span>
                        <span className="text-[10px] text-[#A1A4AC] ml-1.5">{item.authorEmail}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#A1A4AC] shrink-0 font-mono">{item.timestamp}</span>
                  </div>

                  {/* Body Content */}
                  <div className="mt-2 text-xs leading-relaxed text-[#EDEDED] pl-8">
                    {item.content}
                  </div>

                  {/* Git Event Metadata Pill Box */}
                  {item.meta && (
                    <div className="mt-2.5 pl-8 flex flex-wrap items-center gap-2">
                      {item.meta.commitSha && (
                        <span className="flex items-center gap-1 rounded bg-[#1C202B] px-2 py-0.5 text-[10px] font-mono text-[#38BDF8] border border-[#2B3140]">
                          <IconGitCommit className="size-3" />
                          {item.meta.commitSha}
                        </span>
                      )}
                      {item.meta.prNumber && (
                        <span className="flex items-center gap-1 rounded bg-[#8B5CF6]/20 px-2 py-0.5 text-[10px] font-mono text-[#A78BFA] border border-[#8B5CF6]/40">
                          <IconGitPullRequest className="size-3" />
                          PR #{item.meta.prNumber} ({item.meta.prStatus})
                        </span>
                      )}
                      {item.meta.deployEnv && (
                        <span className="flex items-center gap-1 rounded bg-[#10B981]/20 px-2 py-0.5 text-[10px] font-mono text-[#10B981] border border-[#10B981]/40">
                          <IconRocket className="size-3" />
                          {item.meta.deployEnv}: {item.meta.deployStatus}
                        </span>
                      )}
                      {item.meta.tags?.map((tag, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-[#161820] px-1.5 py-0.5 text-[10px] text-[#A1A4AC] border border-[#282C35]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Slash Commands Strip */}
          <div className="shrink-0 px-4 py-1.5 bg-[#0E1015] border-t border-[#1F2430] flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] uppercase font-bold text-[#A1A4AC] tracking-wider shrink-0">
              Quick Triggers:
            </span>
            <button
              type="button"
              onClick={() => handleSlashAction('pr')}
              className="flex items-center gap-1 rounded-md border border-[#282C35] bg-[#14171F] px-2 py-0.5 text-[10px] text-[#A78BFA] hover:border-[#A78BFA] transition-colors"
            >
              <IconGitPullRequest className="size-3" />
              <span>/pr</span>
            </button>
            <button
              type="button"
              onClick={() => handleSlashAction('commit')}
              className="flex items-center gap-1 rounded-md border border-[#282C35] bg-[#14171F] px-2 py-0.5 text-[10px] text-[#38BDF8] hover:border-[#38BDF8] transition-colors"
            >
              <IconGitCommit className="size-3" />
              <span>/commit</span>
            </button>
            <button
              type="button"
              onClick={() => handleSlashAction('deploy')}
              className="flex items-center gap-1 rounded-md border border-[#282C35] bg-[#14171F] px-2 py-0.5 text-[10px] text-[#10B981] hover:border-[#10B981] transition-colors"
            >
              <IconRocket className="size-3" />
              <span>/deploy</span>
            </button>
            <button
              type="button"
              onClick={() => handleSlashAction('invite')}
              className="flex items-center gap-1 rounded-md border border-[#282C35] bg-[#14171F] px-2 py-0.5 text-[10px] text-[#FF8C42] hover:border-[#FF8C42] transition-colors"
            >
              <IconUserPlus className="size-3" />
              <span>/invite</span>
            </button>
          </div>

          {/* Real-time Chat Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="shrink-0 p-3 bg-[#111318] border-t border-[#1F2430] flex items-center gap-2"
          >
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder={`Message #${activeRepo.name} collaborators or type /slash commands…`}
              className="flex-1 bg-[#090A0E] border border-[#282C35] focus:border-[#FF8C42] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#7D8590] focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!chatMessage.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] px-4 py-2 text-xs font-bold text-black transition-all disabled:opacity-40 shadow-sm active:scale-95"
            >
              <span>Send</span>
              <IconSend className="size-3.5" />
            </button>
          </form>
        </main>

        {/* Right Column: Collaborator Selector & Presence Badges (3 Cols).
            Mobile: visible only in 'team' pane; full-width single pane. */}
        <aside className={`md:col-span-3 ${teamsPaneVisibility(mobilePane, 'team')} md:flex flex-col min-h-0 bg-[#0C0E12]/80 p-3 sm:p-4 space-y-3 overflow-y-auto no-scrollbar`}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#A1A4AC] flex items-center gap-1.5">
              <IconUsers className="size-3.5 text-[#10B981]" />
              <span>Repo Collaborators</span>
            </h2>
            <span className="text-[10px] font-mono text-[#10B981] px-1.5 py-0.5 rounded bg-[#10B981]/15 border border-[#10B981]/30">
              {repoCollaborators.length} Members
            </span>
          </div>

          {/* Collaborator Search Input */}
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-2.5 size-3.5 text-[#7D8590]" />
            <input
              type="text"
              value={collaboratorSearch}
              onChange={(e) => setCollaboratorSearch(e.target.value)}
              placeholder="Filter collaborators..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#282C35] bg-[#111318] text-xs text-white placeholder-[#7D8590] focus:border-[#10B981] focus:outline-none transition-colors"
            />
          </div>

          {/* Collaborators List */}
          <div className="space-y-2">
            {repoCollaborators.map((collab) => {
              const presenceColor =
                collab.presence === 'active'
                  ? '#10B981'
                  : collab.presence === 'in_review'
                  ? '#F59E0B'
                  : '#6B7280';

              const presenceLabel =
                collab.presence === 'active'
                  ? 'Active'
                  : collab.presence === 'in_review'
                  ? 'In Review'
                  : 'Off-grid';

              return (
                <div
                  key={collab.id}
                  className="p-2.5 rounded-xl border border-[#282C35] bg-[#12141A] hover:border-[#10B981]/40 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative">
                        <div
                          className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-black"
                          style={{ backgroundColor: collab.avatarColor }}
                        >
                          {collab.name.charAt(0)}
                        </div>
                        {/* Presence Dot Badge */}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#12141A]"
                          style={{ backgroundColor: presenceColor }}
                          title={presenceLabel}
                        />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate">{collab.name}</div>
                        <div className="text-[10px] text-[#A1A4AC] truncate">{collab.email}</div>
                      </div>
                    </div>
                    {/* Role badge */}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        collab.role === 'Admin'
                          ? 'bg-[#FF8C42]/20 text-[#FF8C42] border border-[#FF8C42]/40'
                          : collab.role === 'Maintainer'
                          ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                          : 'bg-[#A78BFA]/20 text-[#A78BFA] border border-[#A78BFA]/40'
                      }`}
                    >
                      {collab.role}
                    </span>
                  </div>

                  <p className="text-[10px] text-[#7D8590] pl-9 italic truncate">
                    "{collab.statusText}"
                  </p>
                </div>
              );
            })}
          </div>

          {/* Invite via header button — sidebar duplicate removed */}
        </aside>
      </div>

      {/* Toast Notification */}
      {inviteSuccessToast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-[#10B981]/50 bg-[#0E1B15] px-4 py-2.5 text-xs text-[#10B981] shadow-2xl animate-fade-in">
          <IconCheck className="size-4 shrink-0" />
          <span>{inviteSuccessToast}</span>
        </div>
      )}

      {/* Modal: Invite Collaborator to QuantGit Repository */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#282C35] bg-[#111318] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1F2430] pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#FF8C42]/20 text-[#FF8C42] border border-[#FF8C42]/40">
                  <IconUserPlus className="size-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Invite Collaborator to Repository</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-[#A1A4AC] hover:text-white transition-colors"
                aria-label="Close invite modal"
              >
                <IconX className="size-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[#A1A4AC] mb-1">
                  Teammate Email (QuantMail Address Book or External)
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="collaborator@quantmail.in"
                  className="w-full rounded-xl border border-[#282C35] bg-[#090A0E] px-3.5 py-2 text-xs text-white placeholder-[#7D8590] focus:border-[#FF8C42] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#A1A4AC] mb-1">
                  Access Level & Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                  className="w-full rounded-xl border border-[#282C35] bg-[#090A0E] px-3.5 py-2 text-xs text-white focus:border-[#FF8C42] focus:outline-none transition-colors"
                >
                  <option value="Admin">Admin (Full Repository Governance & Settings)</option>
                  <option value="Maintainer">Maintainer (PR Review, Commit, Branch Push)</option>
                  <option value="Contributor">Contributor (Create PR, Issues, Comments)</option>
                  <option value="Viewer">Viewer (Read-only Code Inspection)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#A1A4AC] mb-1">
                  Target Repository Scope
                </label>
                <select
                  value={inviteTargetRepo}
                  onChange={(e) => setInviteTargetRepo(e.target.value)}
                  className="w-full rounded-xl border border-[#282C35] bg-[#090A0E] px-3.5 py-2 text-xs text-white focus:border-[#FF8C42] focus:outline-none transition-colors"
                >
                  <option value="all">All repositories in {activeWorkspace.name}</option>
                  {repositories.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name} ({r.defaultBranch})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#1F2430]">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#282C35] bg-[#14171F] text-xs font-semibold text-[#A1A4AC] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] text-xs font-bold text-black transition-all shadow-md active:scale-95"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
