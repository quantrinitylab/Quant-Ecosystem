'use client';

import React, { useState, useMemo } from 'react';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ContextSubViewTab = 'repos' | 'prs' | 'issues' | 'actions' | 'copilot';

export interface RepositoryItem {
  id: string;
  name: string;
  fullName: string;
  description: string;
  language: string;
  languageColor: string;
  stars: number;
  forks: number;
  branches: { name: string; isProtected: boolean }[];
  defaultBranch: string;
  isPrivate: boolean;
  updatedAt: string;
}

export interface PullRequestItem {
  id: string;
  prNumber: number;
  title: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'approved_ready' | 'review_in_progress' | 'ci_passing' | 'merged' | 'closed';
  statusText: string;
  diffStats: {
    additions: number;
    deletions: number;
    filesChanged: number;
  };
  labels: string[];
  createdAt: string;
}

export interface IssueTrackItem {
  id: string;
  issueNumber: number;
  title: string;
  priority: 'P0 Critical' | 'P1 High' | 'P2 Medium' | 'P3 Low';
  priorityColor: string;
  labels: string[];
  state: 'open' | 'closed';
  author: string;
  createdAt: string;
  commentsCount: number;
}

export interface BuildJob {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'running' | 'queued';
  duration: string;
}

export interface WorkflowRun {
  id: string;
  name: string;
  branch: string;
  status: 'success' | 'running' | 'failed';
  duration: string;
  commitSha: string;
  author: string;
  triggerEvent: string;
  jobs: BuildJob[];
  createdAt: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  promptChip?: string;
}

// ============================================================================
// Default Datasets conforming to Wave 75 Spec
// ============================================================================

export const DEFAULT_SUBVIEW_REPOS: RepositoryItem[] = [
  {
    id: 'repo-1',
    name: 'quant-ecosystem',
    fullName: 'quantrinitylab/quant-ecosystem',
    description: 'Sovereign monorepo, web client, android APK & distributed engine',
    language: 'TypeScript',
    languageColor: '#3178C6',
    stars: 1420,
    forks: 184,
    branches: [
      { name: 'main', isProtected: true },
      { name: 'feat/sovereign', isProtected: false },
    ],
    defaultBranch: 'main',
    isPrivate: false,
    updatedAt: 'Just now',
  },
  {
    id: 'repo-2',
    name: 'quant-kernel',
    fullName: 'quantrinitylab/quant-kernel',
    description: 'High-performance native core engine, SQLite FTS5 & cryptographic primitives',
    language: 'Rust',
    languageColor: '#DEA584',
    stars: 890,
    forks: 92,
    branches: [
      { name: 'main', isProtected: true },
      { name: 'feat/simd-v2', isProtected: false },
    ],
    defaultBranch: 'main',
    isPrivate: false,
    updatedAt: '3 hours ago',
  },
  {
    id: 'repo-3',
    name: 'quant-ai-engine',
    fullName: 'quantrinitylab/quant-ai-engine',
    description: 'Local ONNX inference runtime, dynamic memory graphs & agent orchestrator',
    language: 'Python',
    languageColor: '#3572A5',
    stars: 2150,
    forks: 340,
    branches: [
      { name: 'main', isProtected: true },
      { name: 'feat/speculative-decoding', isProtected: false },
    ],
    defaultBranch: 'main',
    isPrivate: false,
    updatedAt: '12 mins ago',
  },
];

export const DEFAULT_SUBVIEW_PRS: PullRequestItem[] = [
  {
    id: 'pr-347',
    prNumber: 347,
    title: 'Per-App Platform Presence & Super-App Navigation',
    author: 'astra-lead',
    sourceBranch: 'feat/super-app-nav',
    targetBranch: 'main',
    status: 'approved_ready',
    statusText: 'Approved · Ready to Merge',
    diffStats: {
      additions: 420,
      deletions: 85,
      filesChanged: 12,
    },
    labels: ['ui', 'navigation', 'wave-74'],
    createdAt: '1 hour ago',
  },
  {
    id: 'pr-348',
    prNumber: 348,
    title: 'FastCDC Chunk Deduplication & Vault E2EE Encryption',
    author: 'sarah-chen',
    sourceBranch: 'feat/fastcdc-vault',
    targetBranch: 'main',
    status: 'review_in_progress',
    statusText: 'Review in Progress',
    diffStats: {
      additions: 1240,
      deletions: 110,
      filesChanged: 8,
    },
    labels: ['storage', 'encryption'],
    createdAt: '3 hours ago',
  },
  {
    id: 'pr-349',
    prNumber: 349,
    title: 'Sub-5ms FTS5 SQLite Search & Triage Heuristics',
    author: 'dev-sentinel',
    sourceBranch: 'feat/fts5-triage',
    targetBranch: 'main',
    status: 'ci_passing',
    statusText: 'Approved · CI Passing',
    diffStats: {
      additions: 315,
      deletions: 42,
      filesChanged: 5,
    },
    labels: ['search', 'sqlite', 'perf'],
    createdAt: '5 hours ago',
  },
];

export const DEFAULT_SUBVIEW_ISSUES: IssueTrackItem[] = [
  {
    id: 'issue-89',
    issueNumber: 89,
    title: 'CalDAV recurrence synchronization optimization',
    priority: 'P1 High',
    priorityColor: '#EF4444',
    labels: ['backend', 'calendar'],
    state: 'open',
    author: 'linus-dev',
    createdAt: '2 hours ago',
    commentsCount: 6,
  },
  {
    id: 'issue-90',
    issueNumber: 90,
    title: 'Memory leak in ONNX runtime session cleanup',
    priority: 'P0 Critical',
    priorityColor: '#DC2626',
    labels: ['ai-engine', 'performance'],
    state: 'open',
    author: 'astra-lead',
    createdAt: '4 hours ago',
    commentsCount: 14,
  },
  {
    id: 'issue-91',
    issueNumber: 91,
    title: 'FastCDC chunk boundaries alignment with 64KB target',
    priority: 'P2 Medium',
    priorityColor: '#F59E0B',
    labels: ['drive', 'storage'],
    state: 'open',
    author: 'sarah-chen',
    createdAt: 'yesterday',
    commentsCount: 3,
  },
  {
    id: 'issue-74',
    issueNumber: 74,
    title: 'Zero-clipPath Skia safety on Android Compose',
    priority: 'P0 Critical',
    priorityColor: '#DC2626',
    labels: ['android', 'skia'],
    state: 'closed',
    author: 'dev-sentinel',
    createdAt: '2 days ago',
    commentsCount: 19,
  },
  {
    id: 'issue-78',
    issueNumber: 78,
    title: 'Yjs CRDT real-time sync conflict resolution',
    priority: 'P1 High',
    priorityColor: '#EF4444',
    labels: ['sync', 'crdt'],
    state: 'closed',
    author: 'astra-lead',
    createdAt: '3 days ago',
    commentsCount: 11,
  },
];

export const DEFAULT_SUBVIEW_WORKFLOWS: WorkflowRun[] = [
  {
    id: 'wf-1',
    name: 'Master CI Gate on main',
    branch: 'main',
    status: 'success',
    duration: '12m 40s',
    commitSha: 'd7192416',
    author: 'dev-sentinel',
    triggerEvent: 'push',
    createdAt: '14 mins ago',
    jobs: [
      { id: 'job-1', name: 'lint: pass', status: 'pass', duration: '1m 15s' },
      { id: 'job-2', name: 'typecheck: pass', status: 'pass', duration: '2m 45s' },
      { id: 'job-3', name: 'vitest: 317/317 pass', status: 'pass', duration: '4m 20s' },
      { id: 'job-4', name: 'build: pass', status: 'pass', duration: '4m 20s' },
    ],
  },
  {
    id: 'wf-2',
    name: 'Android APK Native Build',
    branch: 'main',
    status: 'success',
    duration: '4m 11s',
    commitSha: 'e819b402',
    author: 'astra-lead',
    triggerEvent: 'push',
    createdAt: '1 hour ago',
    jobs: [
      { id: 'job-21', name: 'assembleQuantmailDebug: pass', status: 'pass', duration: '4m 11s' },
    ],
  },
  {
    id: 'wf-3',
    name: 'E2E Playwright Gate',
    branch: 'main',
    status: 'success',
    duration: '8m 02s',
    commitSha: 'd7192416',
    author: 'dev-sentinel',
    triggerEvent: 'pull_request',
    createdAt: '2 hours ago',
    jobs: [
      { id: 'job-31', name: 'e2e: 48/48 pass', status: 'pass', duration: '8m 02s' },
    ],
  },
];

// ============================================================================
// Pure SVG Vector Icons (Strictly ZERO Raw Unicode Emojis)
// ============================================================================

function SvgRepoIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h7" />
    </svg>
  );
}

function SvgPullRequestIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function SvgIssueIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SvgActionsIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function SvgCopilotIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function SvgCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SvgBranchIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function SvgShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SvgStarIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function SvgCommitIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  );
}

function SvgClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SvgSendIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function SvgMergeIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

function SvgMessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ============================================================================
// Sub-View 1: Repositories (`repos`)
// ============================================================================

export interface QuantGitReposSubViewProps {
  repos?: RepositoryItem[];
  onSelectRepo?: (repoName: string) => void;
  onNewRepo?: () => void;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
}

export function QuantGitReposSubView({
  repos = DEFAULT_SUBVIEW_REPOS,
  onSelectRepo,
  onNewRepo,
  searchQuery: externalSearchQuery,
  onSearchChange: externalOnSearchChange,
}: QuantGitReposSubViewProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery =
    externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = externalOnSearchChange || setInternalSearchQuery;
  const [typeFilter, setTypeFilter] = useState<'all' | 'public' | 'private'>('all');
  const [langFilter, setLangFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return repos.filter((r) => {
      const matchesSearch =
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType =
        typeFilter === 'all' ? true : typeFilter === 'private' ? r.isPrivate : !r.isPrivate;
      const matchesLang =
        langFilter === 'all' ? true : r.language.toLowerCase() === langFilter.toLowerCase();
      return matchesSearch && matchesType && matchesLang;
    });
  }, [repos, searchQuery, typeFilter, langFilter]);

  return (
    <div
      data-testid="quantgit-repos-subview"
      className="flex-1 w-full min-h-0 overflow-y-auto bg-[#090A0E] text-[#E6EDF3] p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#232938]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA]">
              <SvgRepoIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Sovereign Repositories</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30">
                  {filtered.length} ACTIVE
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5">
                Zero-mock git smart HTTP repositories & sovereign microservices
              </p>
            </div>
          </div>

          {onNewRepo && (
            <button
              type="button"
              onClick={onNewRepo}
              className="px-4 py-2 rounded-xl bg-[#A78BFA] hover:bg-[#906FFA] text-black font-bold text-xs shadow-lg shadow-[#A78BFA]/20 transition-all flex items-center gap-2"
            >
              <span>+</span>
              <span>New Repository</span>
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find a repository..."
              className="w-full bg-[#12151E] border border-[#232938] rounded-xl px-3.5 py-2 text-xs text-[#E6EDF3] placeholder-[#6E7681] focus:outline-none focus:border-[#A78BFA] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="bg-[#12151E] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#A78BFA]"
            >
              <option value="all">Type: All</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              className="bg-[#12151E] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#A78BFA]"
            >
              <option value="all">Language: All</option>
              <option value="typescript">TypeScript</option>
              <option value="rust">Rust</option>
              <option value="python">Python</option>
            </select>
          </div>
        </div>

        {/* Repository Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((repo) => (
            <div
              key={repo.id}
              data-testid={`repo-card-${repo.name}`}
              className="rounded-2xl border border-[#232938] bg-[#12151E] p-5 flex flex-col justify-between hover:border-[#A78BFA]/50 transition-all shadow-md group"
            >
              <div>
                {/* Header: Title & Badges */}
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectRepo?.(repo.name)}
                    className="text-left font-bold text-sm text-white group-hover:text-[#A78BFA] hover:underline transition-colors flex items-center gap-2"
                  >
                    <SvgRepoIcon className="size-4 text-[#A78BFA]" />
                    <span>{repo.name}</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[#232938] bg-[#181C28] text-[#8B949E]">
                    {repo.isPrivate ? 'Private' : 'Public'}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-[#8B949E] mt-2.5 leading-relaxed line-clamp-2">
                  {repo.description}
                </p>

                {/* Branch Pills with Protected Branch Badge */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {repo.branches.map((b) => (
                    <span
                      key={b.name}
                      data-testid={`branch-pill-${repo.name}-${b.name}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-[#181C28] border border-[#232938] text-[#C9D1D9]"
                    >
                      <SvgBranchIcon className="size-3 text-[#8B949E]" />
                      <span>{b.name}</span>
                      {b.isProtected && (
                        <span
                          title="Protected branch (enforces CI gates and signed PR reviews)"
                          data-testid="protected-branch-badge"
                          className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-[#A78BFA] bg-[#A78BFA]/10 px-1 py-0.2 rounded border border-[#A78BFA]/30"
                        >
                          <SvgShieldIcon className="size-2.5" />
                          <span>Protected</span>
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer: Language Colored Dot & Star Count */}
              <div className="mt-5 pt-3.5 border-t border-[#232938] flex items-center justify-between text-xs text-[#8B949E]">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full inline-block"
                    style={{ backgroundColor: repo.languageColor }}
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-[#C9D1D9]">{repo.language}</span>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    data-testid={`star-count-${repo.name}`}
                    className="flex items-center gap-1 text-[#C9D1D9] hover:text-[#A78BFA] cursor-pointer"
                  >
                    <SvgStarIcon className="size-3.5 text-[#F59E0B]" />
                    <span>{repo.stars.toLocaleString()}</span>
                  </div>
                  <span className="text-[11px] text-[#6E7681]">{repo.updatedAt}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-View 2: Pull Requests Dashboard (`prs`)
// ============================================================================

export interface QuantGitPrsSubViewProps {
  prs?: PullRequestItem[];
  onMergePR?: (prId: string) => void;
  onOpenPR?: (prId: string) => void;
  showToast?: (msg: string) => void;
}

export function QuantGitPrsSubView({
  prs = DEFAULT_SUBVIEW_PRS,
  onMergePR,
  onOpenPR,
  showToast,
}: QuantGitPrsSubViewProps) {
  const [filterState, setFilterState] = useState<'open' | 'merged' | 'closed'>('open');
  const [mergedPrs, setMergedPrs] = useState<Record<string, boolean>>({});

  const handleMergeClick = (pr: PullRequestItem) => {
    setMergedPrs((prev) => ({ ...prev, [pr.id]: true }));
    onMergePR?.(pr.id);
    showToast?.(`1-Click 3-Way Merge completed for PR #${pr.prNumber}!`);
  };

  const openCount = prs.filter((p) => !mergedPrs[p.id] && p.status !== 'closed').length;
  const mergedCount = Object.keys(mergedPrs).length + prs.filter((p) => p.status === 'merged').length;
  const closedCount = prs.filter((p) => p.status === 'closed').length;

  return (
    <div
      data-testid="quantgit-prs-subview"
      className="flex-1 w-full min-h-0 overflow-y-auto bg-[#090A0E] text-[#E6EDF3] p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Hero */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#232938]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA]">
              <SvgPullRequestIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Pull Requests Dashboard</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                  3-WAY MERGE READY
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5">
                Continuous integration, atomic 3-way tree diffs & automated signed approvals
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterState('open')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterState === 'open'
                  ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                  : 'bg-[#12151E] text-[#8B949E] border border-[#232938] hover:text-white'
              }`}
            >
              <SvgPullRequestIcon className="size-3.5" />
              <span>Open ({openCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterState('merged')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterState === 'merged'
                  ? 'bg-[#A78BFA]/20 text-[#A78BFA] border border-[#A78BFA]/40'
                  : 'bg-[#12151E] text-[#8B949E] border border-[#232938] hover:text-white'
              }`}
            >
              <SvgMergeIcon className="size-3.5" />
              <span>Merged ({mergedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterState('closed')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterState === 'closed'
                  ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40'
                  : 'bg-[#12151E] text-[#8B949E] border border-[#232938] hover:text-white'
              }`}
            >
              <span>Closed ({closedCount})</span>
            </button>
          </div>
        </div>

        {/* PR List */}
        <div className="space-y-4">
          {prs.map((pr) => {
            const isMerged = mergedPrs[pr.id] || pr.status === 'merged';

            return (
              <div
                key={pr.id}
                data-testid={`pr-card-${pr.prNumber}`}
                className="rounded-2xl border border-[#232938] bg-[#12151E] p-5 shadow-md hover:border-[#A78BFA]/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isMerged
                          ? 'bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30'
                          : pr.status === 'approved_ready'
                          ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
                          : 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                      }`}
                    >
                      {isMerged ? (
                        <>
                          <SvgMergeIcon className="size-3.5" />
                          <span>Merged (Fast-Forward)</span>
                        </>
                      ) : (
                        <>
                          <SvgCheckIcon className="size-3.5" />
                          <span>{pr.statusText}</span>
                        </>
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={() => onOpenPR?.(pr.id)}
                      className="font-bold text-sm text-white hover:text-[#A78BFA] hover:underline transition-colors text-left"
                    >
                      PR #{pr.prNumber}: {pr.title}
                    </button>
                  </div>

                  {/* Branch and Author metadata */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#8B949E]">
                    <span className="font-semibold text-[#C9D1D9]">@{pr.author}</span>
                    <span>wants to merge</span>
                    <span className="px-2 py-0.5 rounded bg-[#181C28] border border-[#232938] text-[#C9D1D9] font-mono text-[11px]">
                      {pr.sourceBranch}
                    </span>
                    <span>into</span>
                    <span className="px-2 py-0.5 rounded bg-[#181C28] border border-[#232938] text-[#C9D1D9] font-mono text-[11px]">
                      {pr.targetBranch}
                    </span>
                    <span>· {pr.createdAt}</span>
                  </div>

                  {/* Labels */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {pr.labels.map((lbl) => (
                      <span
                        key={lbl}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#181C28] border border-[#232938] text-[#8B949E]"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right Column: Diff Stats Pill & Merge Button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
                  {/* Diff Stats Pill */}
                  <div
                    data-testid={`diff-stats-${pr.prNumber}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#181C28] border border-[#232938] text-xs font-mono font-medium"
                  >
                    <span className="text-[#10B981]">+{pr.diffStats.additions}</span>
                    <span className="text-[#8B949E]">/</span>
                    <span className="text-[#EF4444]">-{pr.diffStats.deletions} lines</span>
                    <span className="text-[#6E7681]">·</span>
                    <span className="text-[#C9D1D9]">{pr.diffStats.filesChanged} files changed</span>
                  </div>

                  {/* Merge Button */}
                  <button
                    type="button"
                    disabled={isMerged}
                    onClick={() => handleMergeClick(pr)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2 ${
                      isMerged
                        ? 'bg-[#181C28] text-[#8B949E] border border-[#232938] cursor-not-allowed'
                        : 'bg-[#A78BFA] hover:bg-[#906FFA] text-black shadow-[#A78BFA]/20 active:scale-95'
                    }`}
                  >
                    <SvgMergeIcon className="size-4" />
                    <span>{isMerged ? 'Merged' : '1-Click 3-Way Merge'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-View 3: Sovereign Issue Tracker (`issues`)
// ============================================================================

export interface QuantGitIssuesSubViewProps {
  issues?: IssueTrackItem[];
  onSelectIssue?: (issueId: string) => void;
  onNewIssue?: () => void;
}

export function QuantGitIssuesSubView({
  issues = DEFAULT_SUBVIEW_ISSUES,
  onSelectIssue,
  onNewIssue,
}: QuantGitIssuesSubViewProps) {
  const [filterState, setFilterState] = useState<'open' | 'closed'>('open');

  const openIssues = useMemo(() => issues.filter((i) => i.state === 'open'), [issues]);
  const closedIssues = useMemo(() => issues.filter((i) => i.state === 'closed'), [issues]);

  const displayedIssues = filterState === 'open' ? openIssues : closedIssues;

  return (
    <div
      data-testid="quantgit-issues-subview"
      className="flex-1 w-full min-h-0 overflow-y-auto bg-[#090A0E] text-[#E6EDF3] p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Hero */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#232938]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA]">
              <SvgIssueIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Sovereign Issue Tracker</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30">
                  PRIORITY RADAR
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5">
                Sub-5ms triage, CalDAV recurrence tracking & cryptographic session diagnostics
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterState('open')}
              data-testid="filter-pill-open"
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterState === 'open'
                  ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                  : 'bg-[#12151E] text-[#8B949E] border border-[#232938] hover:text-white'
              }`}
            >
              <SvgIssueIcon className="size-3.5" />
              <span>Open (14)</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterState('closed')}
              data-testid="filter-pill-closed"
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterState === 'closed'
                  ? 'bg-[#A78BFA]/20 text-[#A78BFA] border border-[#A78BFA]/40'
                  : 'bg-[#12151E] text-[#8B949E] border border-[#232938] hover:text-white'
              }`}
            >
              <SvgCheckIcon className="size-3.5" />
              <span>Closed (82)</span>
            </button>

            {onNewIssue && (
              <button
                type="button"
                onClick={onNewIssue}
                className="ml-2 px-3.5 py-1.5 rounded-xl bg-[#A78BFA] hover:bg-[#906FFA] text-black font-bold text-xs shadow-md transition-all"
              >
                + New Issue
              </button>
            )}
          </div>
        </div>

        {/* Issue Cards */}
        <div className="space-y-3.5">
          {displayedIssues.map((issue) => (
            <div
              key={issue.id}
              data-testid={`issue-card-${issue.issueNumber}`}
              className="rounded-2xl border border-[#232938] bg-[#12151E] p-4 sm:p-5 shadow-md hover:border-[#A78BFA]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Priority Badge */}
                  <span
                    className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold tracking-wide uppercase border"
                    style={{
                      backgroundColor: `${issue.priorityColor}15`,
                      borderColor: `${issue.priorityColor}40`,
                      color: issue.priorityColor,
                    }}
                  >
                    {issue.priority}
                  </span>

                  {/* Title */}
                  <button
                    type="button"
                    onClick={() => onSelectIssue?.(issue.id)}
                    className="font-bold text-sm text-white hover:text-[#A78BFA] hover:underline transition-colors text-left"
                  >
                    Issue #{issue.issueNumber}: {issue.title}
                  </button>
                </div>

                {/* Labels and Author */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#8B949E]">
                  <span>by @{issue.author} · {issue.createdAt}</span>
                  <span className="text-[#484F58]">·</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {issue.labels.map((lbl) => (
                      <span
                        key={lbl}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#181C28] border border-[#232938] text-[#C9D1D9]"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Comments Count */}
              <div className="flex items-center gap-1.5 text-xs text-[#8B949E] px-3 py-1 rounded-lg bg-[#181C28] border border-[#232938] shrink-0">
                <SvgMessageIcon className="size-3.5 text-[#A78BFA]" />
                <span className="font-semibold">{issue.commentsCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-View 4: CI/CD Pipeline Streaming View (`actions`)
// ============================================================================

export interface QuantGitActionsSubViewProps {
  workflows?: WorkflowRun[];
  onTriggerWorkflow?: () => void;
}

export function QuantGitActionsSubView({
  workflows = DEFAULT_SUBVIEW_WORKFLOWS,
  onTriggerWorkflow,
}: QuantGitActionsSubViewProps) {
  const masterRun = workflows[0];
  const secondaryRuns = workflows.slice(1);

  return (
    <div
      data-testid="quantgit-actions-subview"
      className="flex-1 w-full min-h-0 overflow-y-auto bg-[#090A0E] text-[#E6EDF3] p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Hero */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#232938]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA]">
              <SvgActionsIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">CI/CD Pipeline Streaming View</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                  ALL GATES PASSING
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5">
                Real-time job execution telemetry, typecheck gates & vitest test runners
              </p>
            </div>
          </div>

          {onTriggerWorkflow && (
            <button
              type="button"
              onClick={onTriggerWorkflow}
              className="px-4 py-2 rounded-xl bg-[#A78BFA] hover:bg-[#906FFA] text-black font-bold text-xs shadow-lg shadow-[#A78BFA]/20 transition-all flex items-center gap-2"
            >
              <SvgActionsIcon className="size-3.5" />
              <span>Trigger Pipeline</span>
            </button>
          )}
        </div>

        {/* Master CI Gate Card with Real-time Build Jobs Breakdown */}
        {masterRun && (
          <div
            data-testid="workflow-master-gate"
            className="rounded-2xl border border-[#232938] bg-[#12151E] p-6 shadow-xl space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#232938]">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981]">
                  <SvgCheckIcon className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    {masterRun.name}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-[#8B949E] mt-0.5">
                    <span className="inline-flex items-center gap-1 font-mono text-[#C9D1D9]">
                      <SvgCommitIcon className="size-3" />
                      commit {masterRun.commitSha}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-[#10B981]">
                      <SvgClockIcon className="size-3" />
                      {masterRun.duration}
                    </span>
                    <span>·</span>
                    <span>triggered by @{masterRun.author}</span>
                  </div>
                </div>
              </div>

              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1.5">
                <SvgCheckIcon className="size-3.5" />
                <span>Passed</span>
              </span>
            </div>

            {/* Real-time Build Jobs Breakdown */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B949E] mb-3">
                Real-Time Build Jobs Breakdown
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {masterRun.jobs.map((job) => (
                  <div
                    key={job.id}
                    data-testid={`job-${job.name.replace(/[^a-zA-Z0-9]/g, '-')}`}
                    className="p-3.5 rounded-xl border border-[#232938] bg-[#181C28] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-6 items-center justify-center rounded-lg bg-[#10B981]/20 text-[#10B981]">
                        <SvgCheckIcon className="size-3.5" />
                      </div>
                      <span className="text-xs font-bold text-white">{job.name}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#8B949E]">{job.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Secondary Pipeline Runs */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">
            Recent Pipeline Runs
          </h3>
          {secondaryRuns.map((run) => (
            <div
              key={run.id}
              className="rounded-2xl border border-[#232938] bg-[#12151E] p-4.5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#10B981]/15 text-[#10B981]">
                  <SvgCheckIcon className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{run.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-[#8B949E]">
                    <span className="font-mono">commit {run.commitSha}</span>
                    <span>·</span>
                    <span>{run.duration}</span>
                    <span>·</span>
                    <span>{run.createdAt}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {run.jobs.map((j) => (
                  <span
                    key={j.id}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-[#181C28] border border-[#232938] text-[#C9D1D9]"
                  >
                    {j.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-View 5: In-Repo Quanty AI Copilot Interactive Panel (`copilot`)
// ============================================================================

export interface QuantGitCopilotSubViewProps {
  onPromptSelect?: (prompt: string) => void;
}

export function QuantGitCopilotSubView({ onPromptSelect }: QuantGitCopilotSubViewProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'msg-initial',
      role: 'assistant',
      content:
        'Quanty AI Copilot ready. I have indexed PR #347, repository AST trees, and CI pipeline telemetry. Select a prompt chip below or type an autonomous instruction.',
      timestamp: 'Just now',
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [activeSuggestion, setActiveSuggestion] = useState<string | null>(null);

  const promptChips = [
    { label: 'Explain PR #347', query: 'Explain PR #347: Per-App Platform Presence & Super-App Navigation' },
    { label: 'Security Audit', query: 'Run Security Audit on dependencies and cryptographic vault' },
    { label: 'Generate Test', query: 'Generate Vitest test suite for ContextBottomNavBar sub-tabs' },
  ];

  const handleChipClick = (label: string, query: string) => {
    onPromptSelect?.(query);
    setActiveSuggestion(label);

    const userMsg: CopilotMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: 'Just now',
      promptChip: label,
    };

    let reply = '';
    if (label === 'Explain PR #347') {
      reply =
        'PR #347 introduces unified Per-App Platform Presence & Super-App Navigation across Web, Desktop, and Android Compose. Key architectural highlights:\n• QuantPillarTopBar with 5 squircle mode tiles & frosted Dynamic Island capsule.\n• ContextBottomNavBar with 5 contextual sub-views synchronized with `?tab=...`.\n• Zero-clipPath Skia safety physics and full Vitest regression coverage.';
    } else if (label === 'Security Audit') {
      reply =
        'Security Audit complete for monorepo:\n• SAIF compliance score: 100% PASS.\n• High/Critical CVEs: 0 detected.\n• E2EE Vault primitives: AES-256-GCM verified.\n• RBAC & OAuth token rotation: Verified.';
    } else {
      reply =
        'Generated Vitest test suite preview:\n```tsx\ndescribe("QuantGit Sub-Views", () => {\n  it("synchronizes with ?tab=... and renders all 5 views", () => {\n    // 100% green coverage\n  });\n});\n```';
    }

    const aiMsg: CopilotMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: reply,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputVal.trim()) return;

    const userText = inputVal.trim();
    setInputVal('');

    const userMsg: CopilotMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: 'Just now',
    };

    const aiMsg: CopilotMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: `Analyzed workspace query: "${userText}". All monorepo AST nodes, Git Smart HTTP endpoints, and CI pipelines are synchronized.`,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
  };

  return (
    <div
      data-testid="quantgit-copilot-subview"
      className="flex-1 w-full min-h-0 overflow-y-auto bg-[#090A0E] text-[#E6EDF3] p-4 sm:p-6 lg:p-8 flex flex-col justify-between"
    >
      <div className="max-w-4xl mx-auto w-full space-y-6 flex-1 flex flex-col">
        {/* Header Hero */}
        <div className="flex items-center justify-between pb-5 border-b border-[#232938]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#A78BFA]/15 border border-[#A78BFA]/30 text-[#A78BFA] shadow-lg shadow-[#A78BFA]/10">
              <SvgCopilotIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Quanty AI In-Repo Copilot</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A78BFA]/20 text-[#A78BFA] border border-[#A78BFA]/30">
                  NODE B AGENT OS
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5">
                Autonomous code intelligence, PR review explanations & automated test generation
              </p>
            </div>
          </div>
        </div>

        {/* Prompt Chips Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold text-[#8B949E]">Prompt Chips:</span>
          {promptChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              data-testid={`prompt-chip-${chip.label.replace(/[^a-zA-Z0-9]/g, '-')}`}
              onClick={() => handleChipClick(chip.label, chip.query)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#12151E] hover:bg-[#1A1F2C] text-[#C9D1D9] hover:text-white border border-[#232938] hover:border-[#A78BFA]/60 shadow-sm transition-all flex items-center gap-1.5"
            >
              <SvgCopilotIcon className="size-3 text-[#A78BFA]" />
              <span>[{chip.label}]</span>
            </button>
          ))}
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${
                m.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4.5 text-xs leading-relaxed shadow-md ${
                  m.role === 'user'
                    ? 'bg-[#A78BFA] text-black font-semibold'
                    : 'bg-[#12151E] text-[#E6EDF3] border border-[#232938]'
                }`}
              >
                {m.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#232938] text-[11px] font-bold text-[#A78BFA]">
                    <SvgCopilotIcon className="size-3.5" />
                    <span>Quanty Assistant Preview</span>
                  </div>
                )}
                <div className="whitespace-pre-wrap">{m.content}</div>
                <div
                  className={`mt-2 text-[10px] text-right ${
                    m.role === 'user' ? 'text-black/60' : 'text-[#6E7681]'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          ))}

          {/* Dynamic Suggestion Bubble */}
          {activeSuggestion && (
            <div
              data-testid="suggestion-bubble"
              className="rounded-xl border border-[#A78BFA]/30 bg-[#A78BFA]/10 p-3 text-xs text-[#C4B5FD] flex items-center gap-2 animate-in fade-in"
            >
              <SvgCopilotIcon className="size-4 shrink-0 text-[#A78BFA]" />
              <span>
                Active inspection: <strong>{activeSuggestion}</strong> context loaded into reasoning buffer.
              </span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="pt-2">
          <div className="flex items-center gap-2 bg-[#12151E] border border-[#232938] rounded-2xl p-1.5 focus-within:border-[#A78BFA] transition-colors shadow-lg">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Ask Quanty about repositories, PR #347 diffs, or architecture..."
              className="flex-1 bg-transparent px-3 py-2 text-xs text-[#E6EDF3] placeholder-[#6E7681] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputVal.trim()}
              className="px-4 py-2 rounded-xl bg-[#A78BFA] hover:bg-[#906FFA] text-black font-bold text-xs disabled:opacity-40 transition-all flex items-center gap-1.5"
            >
              <span>Send</span>
              <SvgSendIcon className="size-3" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Master Sub-Views Container (Synchronized with ContextBottomNavBar)
// ============================================================================

export interface QuantGitSubViewsProps {
  activeTab?: ContextSubViewTab;
  onSelectTab?: (tab: ContextSubViewTab) => void;
  onSelectRepo?: (repoName: string) => void;
  onMergePR?: (prId: string) => void;
  onOpenPR?: (prId: string) => void;
  onSelectIssue?: (issueId: string) => void;
  onNewRepo?: () => void;
  onNewIssue?: () => void;
  showToast?: (msg: string) => void;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
}

export function QuantGitSubViews({
  activeTab = 'repos',
  onSelectTab,
  onSelectRepo,
  onMergePR,
  onOpenPR,
  onSelectIssue,
  onNewRepo,
  onNewIssue,
  showToast,
  searchQuery,
  onSearchChange,
}: QuantGitSubViewsProps) {
  return (
    <div data-testid="quantgit-subviews-container" className="flex-1 w-full min-h-0 flex flex-col">
      {activeTab === 'repos' && (
        <QuantGitReposSubView
          onSelectRepo={onSelectRepo}
          onNewRepo={onNewRepo}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
      )}

      {activeTab === 'prs' && (
        <QuantGitPrsSubView
          onMergePR={onMergePR}
          onOpenPR={onOpenPR}
          showToast={showToast}
        />
      )}

      {activeTab === 'issues' && (
        <QuantGitIssuesSubView
          onSelectIssue={onSelectIssue}
          onNewIssue={onNewIssue}
        />
      )}

      {activeTab === 'actions' && (
        <QuantGitActionsSubView />
      )}

      {activeTab === 'copilot' && (
        <QuantGitCopilotSubView />
      )}
    </div>
  );
}
