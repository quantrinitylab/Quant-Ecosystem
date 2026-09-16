'use client';

// ============================================================================
// QuantGit — 1:1 Authentic GitHub Functional Parity & Pixel-Perfect Dark UI/UX
// Complete with all 10 GitHub Tabs, Two-Column Repository Workspace,
// File Tree Explorer, Line-numbered Blob Viewer, Branch/Tag Switcher,
// New Issue/PR/Repo Modals, Actions Flowchart, Projects Kanban, Security,
// Insights, Releases APK Downloads, and 4-Button Docked Bottom Deck.
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BubbleAvatar } from '@quant/shared-ui';
import type { BubbleState } from '@quant/shared-ui';
import { useAuth } from '../../providers/auth-provider';
import { browserAuthSession } from '../../services/browser-auth-session';
import { QuantGitLogo } from '../../components/QuantGitLogo';
import { AgentOfficeCanvas, type OfficeAgent } from '../../components/AgentOfficeCanvas';
import { BlobEditor, type CommitBlobInput } from '../../components/BlobEditor';
import {
  navigateQuantGit,
  parseQuantGitRoute,
  quantGitPath,
  subscribeToQuantGitRoute,
  type QuantGitRoute,
} from '../../lib/quantgit-route';

export type MainDeckTab = 'quanty' | 'repos' | 'lab';

export type GitHubTab =
  | 'code'
  | 'issues'
  | 'pulls'
  | 'agents'
  | 'discussions'
  | 'actions'
  | 'projects'
  | 'security'
  | 'insights'
  | 'settings';

export type BuildMode = 'plan' | 'build' | 'auto';
export type Effort = 'fast' | 'deep';
export type CloneProtocol = 'https' | 'ssh' | 'cli';

export type Repo = {
  id: string;
  name: string;
  fullName: string;
  description: string;
  visibility: 'public' | 'private';
  language: string;
  stars: number;
  forks: number;
  watching: number;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  latestCommit: string;
  latestCommitSha: string;
  latestCommitTime: string;
  checksStatus: 'passing' | 'pending' | 'failing';
  license: string;
  website: string;
  topics: string[];
};

export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: string;
  lastCommit?: string;
  lastCommitDate?: string;
  content?: string;
};

export type IssueItem = {
  id: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  labels: { name: string; color: string }[];
  commentsCount: number;
  createdAt: string;
  body?: string;
  assignee?: string;
};

export type IssueCommentItem = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export type PRItem = {
  id: number;
  title: string;
  state: 'open' | 'merged' | 'closed';
  author: string;
  branchSource: string;
  branchTarget: string;
  checksStatus: 'passing' | 'pending' | 'failing';
  commentsCount: number;
  createdAt: string;
  body?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
};

export type WorkflowRunItem = {
  id: number;
  name: string;
  workflow: string;
  status: 'success' | 'in_progress' | 'queued' | 'failed';
  branch: string;
  event: string;
  commitSha: string;
  duration: string;
  timeAgo: string;
  jobs: {
    name: string;
    status: 'success' | 'in_progress' | 'pending' | 'failed';
    duration: string;
  }[];
};

export type DiscussionItem = {
  id: number;
  title: string;
  category: 'Announcements' | 'General' | 'Ideas' | 'Q&A';
  author: string;
  upvotes: number;
  commentsCount: number;
  createdAt: string;
  body: string;
};

export type ProjectCard = {
  id: string;
  title: string;
  column: 'todo' | 'in_progress' | 'done';
  tag: string;
  assignee: string;
};

export type SecurityAlert = {
  id: string;
  package: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  cve: string;
  title: string;
  state: 'open' | 'resolved';
};

export type DeployedAgent = {
  id: string;
  name: string;
  role: string;
  pod: string;
  status: 'active' | 'idle' | 'building' | 'analyzing';
  currentTask: string;
  initial: string;
  color: string;
  steps?: string[];
  thoughts?: string;
};

export type ToolExecutionCard = {
  toolName: string;
  callId: string;
  status: 'succeeded' | 'failed';
  input: Record<string, any>;
  result?: any;
  error?: string;
  durationMs?: number;
};

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  mode?: BuildMode;
  model?: string;
  timestamp: string;
  suggestions?: string[];
  steps?: string[];
  thoughts?: string;
  thoughtDuration?: string;
  toolExecutions?: ToolExecutionCard[];
};

// Initial Mock Repositories
const INITIAL_REPOS: Repo[] = [
  {
    id: 'quant-ecosystem',
    name: 'Quant-Ecosystem',
    fullName: 'Quant-Ecosystem',
    description: 'Next-gen sovereign workspace, autonomous AI swarm, Git hub & Android client.',
    visibility: 'public',
    language: 'TypeScript',
    stars: 128,
    forks: 24,
    watching: 12,
    cloneUrl: 'https://quantmail.in/quantgit/Quant-Ecosystem.git',
    sshUrl: 'git@quantmail.in:Quant-Ecosystem.git',
    defaultBranch: 'main',
    latestCommit:
      'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish android testing apk',
    latestCommitSha: 'ac612198',
    latestCommitTime: '1 hour ago',
    checksStatus: 'passing',
    license: 'MIT License',
    website: 'https://quantmail.in',
    topics: [
      'email',
      'sovereign-os',
      'agentic-ai',
      'git-smart-http',
      'monorepo',
      'jetpack-compose',
    ],
  },
  {
    id: 'quantmail-core',
    name: 'quantmail-core',
    fullName: 'quantmail-core',
    description:
      'Ultra-fast sovereign mail client with inline triage lenses & local ONNX semantic search.',
    visibility: 'private',
    language: 'TypeScript',
    stars: 42,
    forks: 5,
    watching: 8,
    cloneUrl: 'https://quantmail.in/quantgit/quantmail-core.git',
    sshUrl: 'git@quantmail.in:quantmail-core.git',
    defaultBranch: 'main',
    latestCommit: 'refactor(core): unify Bayesian spam classifier with isolated tenant indexes',
    latestCommitSha: '7f9104b2',
    latestCommitTime: '12 hours ago',
    checksStatus: 'passing',
    license: 'Proprietary',
    website: 'https://quantmail.in',
    topics: ['email', 'privacy', 'onnx', 'rust-worker'],
  },
  {
    id: 'quantchat-meet',
    name: 'quantchat-meet',
    fullName: 'quantchat-meet',
    description: 'LiveKit WebRTC gateway, SFU, voice AI agent, and calendar proactive alerts.',
    visibility: 'private',
    language: 'TypeScript',
    stars: 35,
    forks: 3,
    watching: 4,
    cloneUrl: 'https://quantmail.in/quantgit/quantchat-meet.git',
    sshUrl: 'git@quantmail.in:quantchat-meet.git',
    defaultBranch: 'main',
    latestCommit: 'feat(webrtc): LiveKit SFU cluster resilience and proactive voice call dispatch',
    latestCommitSha: '4fcec52e',
    latestCommitTime: 'yesterday',
    checksStatus: 'passing',
    license: 'Proprietary',
    website: 'https://quantmail.in',
    topics: ['webrtc', 'livekit', 'voice-ai', 'messaging'],
  },
  {
    id: 'quant-mobile-android',
    name: 'quant-mobile-android',
    fullName: 'quant-mobile-android',
    description:
      'Native Jetpack Compose Android client with hardware-accelerated WebView and offline resilience.',
    visibility: 'public',
    language: 'Kotlin',
    stars: 89,
    forks: 14,
    watching: 19,
    cloneUrl: 'https://quantmail.in/quantgit/quant-mobile-android.git',
    sshUrl: 'git@quantmail.in:quant-mobile-android.git',
    defaultBranch: 'main',
    latestCommit: 'release(android): Quant v1.0 universal APK build (targetSdk 36)',
    latestCommitSha: 'fa303afb',
    latestCommitTime: '2 hours ago',
    checksStatus: 'passing',
    license: 'Apache-2.0',
    website: 'https://quantmail.in',
    topics: ['android', 'kotlin', 'compose', 'apk', 'mobile'],
  },
];

// Mock File Tree Nodes
const MOCK_FILES: FileNode[] = [
  {
    name: '.github',
    path: '.github',
    type: 'dir',
    lastCommit: 'ci: unified test matrix & gate sweep',
    lastCommitDate: '3 hours ago',
  },
  {
    name: 'android-project',
    path: 'android-project',
    type: 'dir',
    lastCommit: 'feat(mobile): native Jetpack Compose sovereign client',
    lastCommitDate: '1 hour ago',
  },
  {
    name: 'apk testing',
    path: 'apk testing',
    type: 'dir',
    lastCommit: 'release(android): Quant v1.0 universal APK build',
    lastCommitDate: '1 hour ago',
  },
  {
    name: 'apps',
    path: 'apps',
    type: 'dir',
    lastCommit: 'feat(quantmail): top command deck & 1:1 GitHub workspace',
    lastCommitDate: 'just now',
  },
  {
    name: 'backend',
    path: 'backend',
    type: 'dir',
    lastCommit: 'feat(collab): Yjs CRDT real-time persistence',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'docs',
    path: 'docs',
    type: 'dir',
    lastCommit: 'docs(architecture): update 10 keeper apps ledger',
    lastCommitDate: '2 days ago',
  },
  {
    name: 'packages',
    path: 'packages',
    type: 'dir',
    lastCommit: 'refactor(shared-ui): fluid bubble intelligence without eyes',
    lastCommitDate: '2 hours ago',
  },
  {
    name: 'AGENT_MEMORY.md',
    path: 'AGENT_MEMORY.md',
    type: 'file',
    size: '98.5 KB',
    lastCommit: 'docs(memory): master agent memory & swarm ledger',
    lastCommitDate: '1 hour ago',
    content: `# 🧠 MASTER AGENT MEMORY & SWARM LEDGER\n\n> **CRITICAL SYSTEM DIRECTIVE**: This file is the single source of truth for all sessions and new chats. Antigravity MUST read this file before replying to any message, perform 50x self-critique against hallucination, verify features with live Chrome button clicks, orchestrate Notion Agents (Opus 5 / GPT-6 Astra) to do deep coding, and write back all updates immediately.\n\n## 🌟 1. PROJECT NORTH STAR\nQuant is one account that gives you email, chat, social, video, dating, creation tools, cloud storage, and a coding platform — all controllable by a single personal AI.\n\n## 👥 SWARM FLEET (8+ AGENTS)\n- CEO Astra (Command)\n- Dev 1: Auth & Security\n- Dev 2: Sentinel & QA\n- Dev 3: Calendar & Recurrence\n- Dev 4: QuantDrive & Storage\n- Dev 5: Workspaces & Collaboration\n- Dev 6: CodeHub & Git Infrastructure\n- Dev 7: QuantAI Swarm & Shared Memory`,
  },
  {
    name: 'TASK_PLANNER.md',
    path: 'TASK_PLANNER.md',
    type: 'file',
    size: '72.1 KB',
    lastCommit: 'chore(planner): update sprint milestones and live checkmarks',
    lastCommitDate: '1 hour ago',
    content: `# 📋 QUANT ECOSYSTEM — UNIFIED MASTER TASK PLANNER\n\n- [x] PR #260 (b68b86e4): Master Consolidation PR\n- [x] PR #247 (948e3612): QuantMail v2.0 Production Integration\n- [x] Task APK-01: Setup official Android CLI and SDK 36\n- [x] Task APK-02: Native Jetpack Compose sovereign client\n- [x] Task APK-03: Universal debug APK build (11.39 MB)\n- [x] Task APK-04: Distributed in 'apk testing/' on GitHub remote\n- [x] Task GIT-03: Restored 4 bottom deck tabs & repository overview`,
  },
  {
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    size: '2.14 KB',
    lastCommit: 'chore: upgrade monorepo dependencies and strict TypeScript',
    lastCommitDate: '3 days ago',
    content: `{\n  "name": "quant-ecosystem",\n  "version": "1.0.0",\n  "private": true,\n  "scripts": {\n    "build": "turbo run build",\n    "dev": "turbo run dev",\n    "test": "turbo run test",\n    "lint": "turbo run lint",\n    "typecheck": "turbo run typecheck"\n  },\n  "devDependencies": {\n    "typescript": "^5.9.0",\n    "turbo": "^2.4.0",\n    "vitest": "^2.1.0"\n  }\n}`,
  },
  {
    name: 'pnpm-lock.yaml',
    path: 'pnpm-lock.yaml',
    type: 'file',
    size: '412 KB',
    lastCommit: 'chore: lockfile sync for shared-ui bubble avatar',
    lastCommitDate: '3 days ago',
    content: `lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      turbo: 2.4.0\n      typescript: 5.9.0`,
  },
  {
    name: 'README.md',
    path: 'README.md',
    type: 'file',
    size: '4.82 KB',
    lastCommit: 'docs: update ecosystem quickstart & architecture overview',
    lastCommitDate: 'last week',
    content: `# Quant Ecosystem — The Next NVIDIA of Software\n\nA unified sovereign operating ecosystem built for high-performance computing, intelligent mail triage, autonomous agentic development, and real git collaboration.\n\n\`\`\`bash\n# Clone the unified monorepo\ngit clone https://quantmail.in/quantgit/Quant-Ecosystem.git\n\n# Install dependencies and start development\npnpm install && pnpm dev\n\`\`\`\n\n## 📦 Features\n- **Flagship QuantMail**: Lightning-fast triage, local ONNX semantic search, offline drafts.\n- **QuantGit (CodeHub)**: 1:1 GitHub parity with Git Smart HTTP and real PR reviews.\n- **QuantChat & Meet**: WebRTC LiveKit meetings, voice AI assistants, proactive alarms.\n- **QuantDrive & Docs**: Multi-layer cloud storage, Yjs CRDT real-time document collaboration.\n- **Native Android Sovereign Shell**: Jetpack Compose + hardware-accelerated WebView client.`,
  },
];

// Initial Issues
const INITIAL_ISSUES: IssueItem[] = [
  {
    id: 259,
    title: 'Fix QuantMail composer recipient tag overflow on small viewports',
    state: 'open',
    author: 'kundan',
    labels: [
      { name: 'bug', color: '#D73A4A' },
      { name: 'mobile', color: '#0E8A16' },
    ],
    commentsCount: 3,
    createdAt: '2 hours ago',
    body: 'On mobile viewports under 400px width, recipient pills in the email composer were wrapping awkwardly and causing horizontal layout overflow. Remediated via CSS flex-wrap and max-w-full containment.',
    assignee: 'Developer 6',
  },
  {
    id: 250,
    title: 'ADR-001: Consolidate Drive AI services & aggregate sum storage quota',
    state: 'open',
    author: 'astra-ceo',
    labels: [
      { name: 'architecture', color: '#1D76DB' },
      { name: 'storage', color: '#5319E7' },
    ],
    commentsCount: 8,
    createdAt: 'yesterday',
    body: 'Ported 5 Drive AI services (extract, summarize, search, duplicate, organize) into QuantMail Drive backend and replaced client-side quota calculation with single database aggregate sum query.',
    assignee: 'Developer 4',
  },
  {
    id: 138,
    title: 'CI Gate: Upgrade Vitest runner concurrency & memory pool clamps',
    state: 'open',
    author: 'sentinel',
    labels: [
      { name: 'ci/cd', color: '#FBCA04' },
      { name: 'performance', color: '#006B75' },
    ],
    commentsCount: 2,
    createdAt: '2 days ago',
    body: 'Increased Vitest worker pool to 4 isolated threads and added memory pool limit of 2048MB per worker to eliminate sporadic memory spikes during full-sweep CI runs.',
    assignee: 'Developer 2',
  },
  {
    id: 122,
    title: 'Zero-mock Yjs collaborative document branching and paragraph write-locks',
    state: 'open',
    author: 'forge',
    labels: [
      { name: 'docs', color: '#BFD4F2' },
      { name: 'crdt', color: '#D4C5F9' },
    ],
    commentsCount: 5,
    createdAt: '3 days ago',
    body: 'Implemented real CRDT document branching with 3-way Yjs merge and fine-grained paragraph permissions for multi-tenant enterprise editing.',
    assignee: 'Developer 5',
  },
  {
    id: 109,
    title: 'QuantChat LiveKit gateway WebRTC token refresh & background alarms',
    state: 'open',
    author: 'scout',
    labels: [
      { name: 'webrtc', color: '#E99695' },
      { name: 'realtime', color: '#0075CA' },
    ],
    commentsCount: 4,
    createdAt: '4 days ago',
    body: 'Added background keep-alive loop and automatic room token refresh before expiration during 60+ minute audio/video conferencing sessions.',
    assignee: 'Developer 7',
  },
];

// Initial Pull Requests
const INITIAL_PRS: PRItem[] = [
  {
    id: 260,
    title: 'Master Consolidation PR (Waves B-F, Sprints 2-5, Wave F Deletions)',
    state: 'merged',
    author: 'astra-ceo',
    branchSource: 'feat/sprint-master-consolidation',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 14,
    createdAt: 'yesterday',
    body: 'Unified monorepo consolidation: pruned 7 dead standalone apps (-47,882 lines), integrated LiveKit WebRTC, Yjs CRDT docs, RRULE calendar recurrence, and 3-layer shared memory.',
    additions: 12450,
    deletions: 47882,
    changedFiles: 182,
  },
  {
    id: 257,
    title: 'feat(branding): Rebrand apps to @quant/quantwave, quantgram, and quantcooks',
    state: 'merged',
    author: 'pixel',
    branchSource: 'feat/app-rebranding',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 4,
    createdAt: '2 days ago',
    body: 'Cleaned up monorepo package identifiers and updated SSO permission scopes across all rebranded apps.',
    additions: 420,
    deletions: 310,
    changedFiles: 18,
  },
  {
    id: 261,
    title: 'feat(quantgit): 1:1 GitHub Full Functional Parity & Pixel-Perfect Dark UI/UX',
    state: 'open',
    author: 'Developer 6',
    branchSource: 'feat/quantgit-github-parity',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 6,
    createdAt: 'just now',
    body: 'Implemented complete 1:1 GitHub parity: all 10 tabs (Code, Issues, PRs, Agents, Discussions, Actions, Projects, Security, Insights, Settings), Two-column repository layout, line-numbered Blob Viewer, File Finder, Branch Switcher, Releases APK download drawer, and docked bottom deck.',
    additions: 2528,
    deletions: 646,
    changedFiles: 48,
  },
];

// Initial Discussions
const INITIAL_DISCUSSIONS: DiscussionItem[] = [
  {
    id: 1,
    title: '📢 Quant Ecosystem v1.0 Staging Release & Android APK Distribution',
    category: 'Announcements',
    author: 'astra-ceo',
    upvotes: 42,
    commentsCount: 18,
    createdAt: '2 hours ago',
    body: 'We are thrilled to announce that Quant v1.0 Universal APK is officially compiled and downloadable directly from GitHub remote under apk testing/! Feedback welcome.',
  },
  {
    id: 2,
    title: '💡 RFC: Unified Credits Wallet ($1 = 1 Credit) & Creator Monetization',
    category: 'Ideas',
    author: 'ledger',
    upvotes: 29,
    commentsCount: 7,
    createdAt: 'yesterday',
    body: 'Proposing a unified credit model where creator earnings in QuantWave & QuantGram flow into a single wallet, redeemable via UPI and Stripe daily.',
  },
  {
    id: 3,
    title: '🙏 Best practices for configuring local ONNX runtime embeddings in QuantMail',
    category: 'Q&A',
    author: 'scout',
    upvotes: 19,
    commentsCount: 5,
    createdAt: '3 days ago',
    body: 'What is the optimal model size and quantization format (int8 vs fp16) for client-side web worker embeddings without burning laptop battery?',
  },
];

// Initial Actions Runs
const INITIAL_ACTIONS: WorkflowRunItem[] = [
  {
    id: 34826613070,
    name: 'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish …',
    workflow: 'Deploy staging (OIDC)',
    status: 'success',
    branch: 'main',
    event: 'workflow_dispatch',
    commitSha: 'ac612198',
    duration: '4m 55s',
    timeAgo: '15 minutes ago',
    jobs: [
      { name: 'Validate immutable main release', status: 'success', duration: '4s' },
      { name: 'Build and deploy quantmail', status: 'success', duration: '4m 51s' },
    ],
  },
  {
    id: 34826179762,
    name: 'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish …',
    workflow: 'CI',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: 'ac612198',
    duration: '4m 18s',
    timeAgo: '25 minutes ago',
    jobs: [
      { name: 'gate', status: 'success', duration: '4m 18s' },
      { name: 'quantchat-coverage', status: 'success', duration: '1m 20s' },
      { name: 'memory-shadow-postgres', status: 'success', duration: '1m 45s' },
      { name: 'full-sweep', status: 'success', duration: '18m 20s' },
    ],
  },
  {
    id: 34826179781,
    name: 'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish …',
    workflow: 'CodeQL Advanced',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: 'ac612198',
    duration: '3m 22s',
    timeAgo: '28 minutes ago',
    jobs: [
      { name: 'Analyze (javascript-typescript)', status: 'success', duration: '3m 10s' },
      { name: 'Analyze (python)', status: 'success', duration: '1m 05s' },
    ],
  },
];

// Initial Projects Kanban Cards
const INITIAL_PROJECT_CARDS: ProjectCard[] = [
  {
    id: 'c1',
    title: 'Android APK Distribution on GitHub',
    column: 'done',
    tag: 'Mobile',
    assignee: 'Developer 6',
  },
  {
    id: 'c2',
    title: '1:1 GitHub Navigation & Two-Column Parity',
    column: 'done',
    tag: 'QuantGit',
    assignee: 'Pixel',
  },
  {
    id: 'c3',
    title: 'Line-Numbered File Blob Viewer & Copy Raw',
    column: 'done',
    tag: 'CodeHub',
    assignee: 'Forge',
  },
  {
    id: 'c4',
    title: 'Full 10-Tab Experience (Discussions, Projects, Security)',
    column: 'in_progress',
    tag: 'Core',
    assignee: 'Astra',
  },
  {
    id: 'c5',
    title: 'Real-time WebSocket Collaborative Terminal',
    column: 'todo',
    tag: 'QuantAI',
    assignee: 'Ledger',
  },
  {
    id: 'c6',
    title: 'Hardware YubiKey MFA Support in SSO',
    column: 'todo',
    tag: 'Auth',
    assignee: 'Developer 1',
  },
];

// Initial Security Alerts
const INITIAL_SECURITY_ALERTS: SecurityAlert[] = [
  {
    id: 'sec-1',
    package: 'tar < 6.2.1',
    severity: 'moderate',
    cve: 'CVE-2024-37890',
    title: 'Arbitrary File Overwrite via symlink directory traversal',
    state: 'open',
  },
  {
    id: 'sec-2',
    package: 'micromatch < 4.0.8',
    severity: 'moderate',
    cve: 'CVE-2024-4067',
    title: 'Regular Expression Denial of Service (ReDoS) in glob parsing',
    state: 'open',
  },
  {
    id: 'sec-3',
    package: 'ws < 8.17.1',
    severity: 'low',
    cve: 'CVE-2024-37891',
    title: 'WebSocket payload framing timing side-channel',
    state: 'open',
  },
  {
    id: 'sec-4',
    package: 'braces < 3.0.3',
    severity: 'low',
    cve: 'CVE-2024-4068',
    title: 'Uncontrolled resource consumption in string expansion',
    state: 'open',
  },
];

// Swarm Fleet Catalog
const AGENT_FLEET_CATALOG: DeployedAgent[] = [
  {
    id: 'astra',
    name: 'Astra',
    role: 'Executive Lead & Architecture Gatekeeper',
    pod: 'COMMAND',
    status: 'active',
    currentTask:
      'Enforcing 1:1 GitHub parity, two-column layout, and zero-hallucination verification.',
    initial: 'A',
    color: '#FF8C42',
    steps: [
      'Audited GitHub dark UI tokens',
      'Verified 10 repository tabs',
      'Confirmed live EKS staging build',
    ],
    thoughts:
      'All 10 tabs must have interactive functionality and reflect authentic GitHub dark theme (#0D1117).',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Audit & QA Sentinel',
    pod: 'SHIELD',
    status: 'analyzing',
    currentTask:
      'Continuous Vitest regression & CI gate surveillance across all monorepo packages.',
    initial: 'S',
    color: '#34D399',
    steps: [
      'Gate sweep passed in 4m18s',
      'Typecheck clean (zero emit errors)',
      'Zero console exceptions',
    ],
    thoughts: 'Watching test worker memory footprints and confirming zero unhandled exceptions.',
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Fullstack Monorepo Engine',
    pod: 'ENGINE',
    status: 'building',
    currentTask:
      'Building 1:1 File Tree explorer with clickable blob viewer and breadcrumb navigation.',
    initial: 'F',
    color: '#60A5FA',
    steps: [
      'Parsed GitHub table layout',
      'Added line numbers to file viewer',
      'Wired branch selector modal',
    ],
    thoughts:
      'Developers expect to click on files and see line numbers, copy raw, and commit messages.',
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Codebase Researcher',
    pod: 'RECON',
    status: 'idle',
    currentTask: 'Mapping competitor features from logged-in GitHub web sessions.',
    initial: 'R',
    color: '#A78BFA',
    steps: [
      'Inspected GitHub repo header',
      'Captured clone drawer protocol tabs',
      'Mapped Kanban project columns',
    ],
    thoughts:
      'GitHub puts Releases in the right sidebar with quick binary downloads. Quant APK must sit right there.',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    role: 'UI/UX & Design Systems',
    pod: 'CANVAS',
    status: 'active',
    currentTask:
      'Polishing GitHub dark tokens (#0D1117, #010409, #30363D) and green buttons (#238636).',
    initial: 'P',
    color: '#F472B6',
    steps: [
      'Eliminated cartoon eyes from mascot',
      'Created authentic GitHub tabs with orange underline',
      'Added 2-column layout',
    ],
    thoughts:
      'The user wants real GitHub look and feel, not generic cards. Exact border colors make the difference.',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    role: 'Database & Storage Migrations',
    pod: 'VAULT',
    status: 'idle',
    currentTask:
      'Managing repository tables, branches, issues, and pull requests in Prisma schema.',
    initial: 'L',
    color: '#FBBF24',
    steps: [
      'Schema 0058 verified',
      'Storage quota aggregate sum verified',
      'Prisma client generated',
    ],
    thoughts: 'All issue numbers and PR numbers must increment deterministically.',
  },
];
export default function QuantGitPage() {
  const router = useRouter();

  // Navigation & Deck State
  const { user } = useAuth();
  const currentUsername =
    user?.username || (user?.email ? user.email.split('@')[0] : 'kundansinghrajput31980');
  const [activeDeckTab, setActiveDeckTab] = useState<MainDeckTab>('quanty');
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [activeGitHubTab, setActiveGitHubTab] = useState<GitHubTab>('code');
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [viewingFile, setViewingFile] = useState<FileNode | null>(null);
  const [viewingBlobSha, setViewingBlobSha] = useState('');
  const [pendingRoute, setPendingRoute] = useState<QuantGitRoute | null>(null);
  const [routeHydrated, setRouteHydrated] = useState(false);
  const [selectedOfficeAgent, setSelectedOfficeAgent] = useState<DeployedAgent | null>(null);

  // Notion AI & Quanty Studio State
  const [activeModel, setActiveModel] = useState<'opus-5' | 'sonnet-35' | 'quant-slm'>('opus-5');
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({
    'msg-1': true,
  });
  const [activeSessionId, setActiveSessionId] = useState('sess-1');
  const [chatSessions, setChatSessions] = useState([
    {
      id: 'sess-1',
      title: 'Urgent GitHub parity & Notion AI overhaul',
      date: 'Just now',
      count: 4,
    },
    {
      id: 'sess-2',
      title: 'Wave A Drive consolidation & 5 AI services',
      date: 'Yesterday',
      count: 12,
    },
    {
      id: 'sess-3',
      title: 'LiveKit WebRTC gateway & proactive call alerts',
      date: '2 days ago',
      count: 8,
    },
    {
      id: 'sess-4',
      title: 'Yjs CRDT merge & real-time collaboration',
      date: '3 days ago',
      count: 15,
    },
  ]);

  // Notion AI Submenus & Personalization States
  const [activeSettingsSubmenu, setActiveSettingsSubmenu] = useState<
    'none' | 'computer' | 'sources' | 'mcp' | 'mode'
  >('none');
  const [activeContextSubmenu, setActiveContextSubmenu] = useState<
    'none' | 'repos-files' | 'mention' | 'skills'
  >('none');
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);
  const [quantyName, setQuantyName] = useState('Quanty');
  const [quantyInstructions, setQuantyInstructions] = useState('');
  const [selectedAccessory, setSelectedAccessory] = useState<
    | 'none'
    | 'firefighter'
    | 'mustache'
    | 'scarf'
    | 'flower'
    | 'pencil'
    | 'duck'
    | 'crown'
    | 'cowboy'
    | 'propeller'
  >('none');
  const [enableWorkersBeta, setEnableWorkersBeta] = useState(true);
  const [sourcesState, setSourcesState] = useState({
    all: true,
    dev6: true,
    helpCenter: true,
    webAccess: true,
  });
  const [mcpServers, setMcpServers] = useState<string[]>(['Cloudflare', 'GitHub']);
  const [notionMode, setNotionMode] = useState<'default' | 'ask'>('default');
  const [skillsSearch, setSkillsSearch] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [repoFileSearch, setRepoFileSearch] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>(['sess-1']);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [activeSkills, setActiveSkills] = useState<Record<string, boolean>>({
    'Git Smart HTTP Engine': true,
    'Monorepo AST Parser': true,
    'Vitest QA Sentinel': true,
    'LiveKit WebRTC Gateway': true,
    'Redis 3-Layer Memory': true,
    'Prisma Schema Auditor': true,
  });

  // Data Collections
  const [baseRepos, setBaseRepos] = useState<Repo[]>(INITIAL_REPOS);
  const repos = useMemo(() => {
    return baseRepos.map((r) => ({
      ...r,
      fullName: `${currentUsername}/${r.name}`,
      cloneUrl: `https://quantmail.in/quantgit/${currentUsername}/${r.name}.git`,
      sshUrl: `git@quantmail.in:${currentUsername}/${r.name}.git`,
    }));
  }, [baseRepos, currentUsername]);
  const [files, setFiles] = useState<FileNode[]>(MOCK_FILES);
  const [issues, setIssues] = useState<IssueItem[]>(INITIAL_ISSUES);
  const [pulls, setPulls] = useState<PRItem[]>(INITIAL_PRS);
  const [discussions, setDiscussions] = useState<DiscussionItem[]>(INITIAL_DISCUSSIONS);
  const [actions, setActions] = useState<WorkflowRunItem[]>(INITIAL_ACTIONS);
  const [projects, setProjects] = useState<ProjectCard[]>(INITIAL_PROJECT_CARDS);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>(INITIAL_SECURITY_ALERTS);
  const [agents, setAgents] = useState<DeployedAgent[]>(AGENT_FLEET_CATALOG);

  // Modals & Drawers
  const [modalState, setModalState] = useState<
    | 'none'
    | 'branch-switcher'
    | 'file-finder'
    | 'clone'
    | 'new-issue'
    | 'new-pr'
    | 'new-repo'
    | 'deploy-agent'
    | 'action-detail'
    | 'pr-detail'
    | 'issue-detail'
  >('none');
  const [cloneProtocol, setCloneProtocol] = useState<CloneProtocol>('https');
  const [selectedActionRun, setSelectedActionRun] = useState<WorkflowRunItem | null>(null);
  const [selectedPr, setSelectedPr] = useState<PRItem | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [issueComments, setIssueComments] = useState<IssueCommentItem[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [repoBranches, setRepoBranches] = useState<string[]>([
    'main',
    'feat/sprint-7-github-parity',
    'fix/core-astra-audit',
    'release/v1.0.0-apk',
  ]);
  const [newBranchInput, setNewBranchInput] = useState('');
  const [settingsName, setSettingsName] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsBranch, setSettingsBranch] = useState('');
  const [settingsVisibility, setSettingsVisibility] = useState<'public' | 'private'>('public');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Form States
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueBody, setNewIssueBody] = useState('');
  const [newIssueLabel, setNewIssueLabel] = useState('bug');

  const [newPrTitle, setNewPrTitle] = useState('');
  const [newPrBody, setNewPrBody] = useState('');
  const [newPrBranch, setNewPrBranch] = useState('feat/sprint-7-github-parity');

  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoVisibility, setNewRepoVisibility] = useState<'public' | 'private'>('public');

  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('');
  const [newAgentPod, setNewAgentPod] = useState('COMMAND');

  // Search & Filters
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [issueSearchQuery, setIssueSearchQuery] = useState('is:issue state:open');
  const [pullSearchQuery, setPullSearchQuery] = useState('is:pr state:open');
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [repoTypeFilter, setRepoTypeFilter] = useState<'all' | 'public' | 'private'>('all');
  const [repoLangFilter, setRepoLangFilter] = useState<string>('all');
  const [discussionCategory, setDiscussionCategory] = useState<string>('all');

  // Copilot / Quanty AI Chat State
  const [buildMode, setBuildMode] = useState<BuildMode>('plan');
  const [effort, setEffort] = useState<Effort>('fast');
  const [promptInput, setPromptInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isChatSubmitting, setIsChatSubmitting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const apiFetch = useCallback(
    (input: RequestInfo | URL, init: RequestInit = {}) =>
      browserAuthSession.authenticatedFetch(input, init),
    [],
  );

  const repositoryOwner = useCallback(
    (repo: Repo) => {
      const fullNameParts = repo.fullName?.split('/').filter(Boolean);
      return fullNameParts?.length > 1 ? fullNameParts[0] : currentUsername;
    },
    [currentUsername],
  );

  const openRepository = useCallback(
    (repo: Repo, tab: GitHubTab = 'code') => {
      setActiveDeckTab('repos');
      setSelectedRepo(repo);
      setActiveGitHubTab(tab);
      setViewingFile(null);
      setModalState('none');

      navigateQuantGit({
        kind: 'repo',
        owner: repositoryOwner(repo),
        repo: repo.name,
        tab,
      });
    },
    [repositoryOwner],
  );

  const openRepositoryTab = useCallback(
    (tab: GitHubTab) => {
      if (!selectedRepo) return;

      setActiveDeckTab('repos');
      setActiveGitHubTab(tab);
      setViewingFile(null);
      setModalState('none');

      navigateQuantGit({
        kind: 'repo',
        owner: repositoryOwner(selectedRepo),
        repo: selectedRepo.name,
        tab,
      });
    },
    [repositoryOwner, selectedRepo],
  );

  const openIssueDetail = useCallback(
    (issue: IssueItem) => {
      if (!selectedRepo) return;

      setActiveDeckTab('repos');
      setActiveGitHubTab('issues');
      setSelectedIssue(issue);
      setModalState('issue-detail');

      navigateQuantGit({
        kind: 'issue',
        owner: repositoryOwner(selectedRepo),
        repo: selectedRepo.name,
        number: issue.id,
      });
    },
    [repositoryOwner, selectedRepo],
  );

  const closeIssueDetail = useCallback(() => {
    setModalState('none');
    setSelectedIssue(null);

    if (selectedRepo) {
      navigateQuantGit({
        kind: 'repo',
        owner: repositoryOwner(selectedRepo),
        repo: selectedRepo.name,
        tab: 'issues',
      });
    }
  }, [repositoryOwner, selectedRepo]);

  const openPullDetail = useCallback(
    (pullRequest: PRItem) => {
      if (!selectedRepo) return;

      setActiveDeckTab('repos');
      setActiveGitHubTab('pulls');
      setSelectedPr(pullRequest);
      setModalState('pr-detail');

      navigateQuantGit({
        kind: 'pull',
        owner: repositoryOwner(selectedRepo),
        repo: selectedRepo.name,
        number: pullRequest.id,
      });
    },
    [repositoryOwner, selectedRepo],
  );

  const closePullDetail = useCallback(() => {
    setModalState('none');
    setSelectedPr(null);

    if (selectedRepo) {
      navigateQuantGit({
        kind: 'repo',
        owner: repositoryOwner(selectedRepo),
        repo: selectedRepo.name,
        tab: 'pulls',
      });
    }
  }, [repositoryOwner, selectedRepo]);

  const closeBlobEditor = useCallback(() => {
    setViewingFile(null);
    setViewingBlobSha('');

    if (selectedRepo) {
      navigateQuantGit({
        kind: 'repo',
        owner: repositoryOwner(selectedRepo),
        repo: selectedRepo.name,
        tab: 'code',
      });
    }
  }, [repositoryOwner, selectedRepo]);

  const openBlobEditor = useCallback(
    async (file: FileNode, repo = selectedRepo, branch = currentBranch) => {
      if (!repo || file.type === 'dir') return;

      setActiveDeckTab('repos');
      setSelectedRepo(repo);
      setActiveGitHubTab('code');
      setCurrentBranch(branch);
      setCurrentPath(file.path);
      setChatError(null);

      navigateQuantGit({
        kind: 'blob',
        owner: repositoryOwner(repo),
        repo: repo.name,
        branch,
        path: file.path,
      });

      try {
        const repoTarget = repo.id || repo.name;
        const query = new URLSearchParams({
          branch,
          path: file.path,
        });
        const response = await apiFetch(
          `/api/repos/${encodeURIComponent(repoTarget)}/file?${query.toString()}`,
        );
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.success) {
          throw new Error(
            payload?.error?.message || payload?.message || 'Failed to load file content.',
          );
        }

        setViewingFile({
          ...file,
          content: payload.data.content ?? '',
        });
        setViewingBlobSha(payload.data.sha ?? payload.data.blobSha ?? '');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load file.';
        showToast(message);

        setViewingFile(
          file.content !== undefined
            ? file
            : {
                ...file,
                content: '',
              },
        );
      }
    },
    [apiFetch, currentBranch, repositoryOwner, selectedRepo],
  );

  useEffect(() => {
    const applyLocation = (route: QuantGitRoute) => {
      setPendingRoute(route);
      setRouteHydrated(true);
    };

    applyLocation(parseQuantGitRoute(window.location.pathname));
    return subscribeToQuantGitRoute(applyLocation);
  }, []);

  // Fetch real repositories from backend
  const fetchRepos = useCallback(async () => {
    try {
      const res = await apiFetch('/api/repos');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mappedRepos: Repo[] = json.data.map((r: any) => ({
            id: r.id || r.name,
            name: r.name,
            fullName: `${currentUsername}/${r.name}`,
            description: r.description || 'Repository in QuantGit.',
            visibility: (r.visibility?.toLowerCase() === 'public' ? 'public' : 'private') as
              | 'public'
              | 'private',
            language: r.language || 'TypeScript',
            stars: typeof r.stars === 'number' ? r.stars : 0,
            forks: typeof r.forks === 'number' ? r.forks : 0,
            watching: 1,
            cloneUrl: `https://quantmail.in/quantgit/${currentUsername}/${r.name}.git`,
            sshUrl: `git@quantmail.in:${currentUsername}/${r.name}.git`,
            defaultBranch: r.defaultBranch || 'main',
            latestCommit: r.latestCommit || 'Initial commit',
            latestCommitSha: r.latestCommitSha || '948e3612',
            latestCommitTime: r.latestCommitTime || 'recently',
            checksStatus: 'passing',
            license: 'MIT License',
            website: 'https://quantmail.in',
            topics: r.topics || ['quant', 'workspace'],
          }));
          setBaseRepos(mappedRepos);
        }
      }
    } catch {
      // Retain baseRepos fallback
    }
  }, [currentUsername]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  useEffect(() => {
    if (!routeHydrated || !pendingRoute) return;

    if (pendingRoute.kind === 'quanty') {
      setActiveDeckTab('quanty');
      setSelectedRepo(null);
      setViewingFile(null);
      setModalState('none');
      return;
    }

    if (pendingRoute.kind === 'agentlab') {
      setActiveDeckTab('lab');
      setSelectedRepo(null);
      setViewingFile(null);
      setModalState('none');
      return;
    }

    if (pendingRoute.kind === 'repositories') {
      setActiveDeckTab('repos');
      setSelectedRepo(null);
      setViewingFile(null);
      setModalState('none');
      return;
    }

    if (repos.length === 0) return;

    const matchedRepo =
      repos.find(
        (candidate) =>
          candidate.name.toLowerCase() === pendingRoute.repo.toLowerCase() &&
          repositoryOwner(candidate).toLowerCase() === pendingRoute.owner.toLowerCase(),
      ) ||
      repos.find((candidate) => candidate.name.toLowerCase() === pendingRoute.repo.toLowerCase());

    if (!matchedRepo) return;

    setActiveDeckTab('repos');
    setSelectedRepo(matchedRepo);

    if (pendingRoute.kind === 'repo') {
      setActiveGitHubTab(pendingRoute.tab);
      setViewingFile(null);
      setModalState('none');
      return;
    }

    if (pendingRoute.kind === 'issue') {
      setActiveGitHubTab('issues');
      const targetIssue = issues.find((candidate) => candidate.id === pendingRoute.number);

      if (targetIssue) {
        setSelectedIssue(targetIssue);
        setModalState('issue-detail');
      }
      return;
    }

    if (pendingRoute.kind === 'pull') {
      setActiveGitHubTab('pulls');
      const targetPull = pulls.find((candidate) => candidate.id === pendingRoute.number);

      if (targetPull) {
        setSelectedPr(targetPull);
        setModalState('pr-detail');
      }
      return;
    }

    if (pendingRoute.kind === 'blob') {
      setActiveGitHubTab('code');
      setCurrentBranch(pendingRoute.branch);
      setCurrentPath(pendingRoute.path);

      if (!viewingFile || viewingFile.path !== pendingRoute.path) {
        const fileNode: FileNode = {
          name: pendingRoute.path.split('/').pop() || pendingRoute.path,
          type: 'file',
          path: pendingRoute.path,
        };
        void openBlobEditor(fileNode, matchedRepo, pendingRoute.branch);
      }
    }
  }, [
    openBlobEditor,
    pendingRoute,
    issues,
    pulls,
    repos,
    repositoryOwner,
    routeHydrated,
    viewingFile,
  ]);

  // Fetch real issues and PRs when a repository is selected
  const fetchRepoIssues = useCallback(
    async (repoIdOrName: string) => {
      try {
        const res = await apiFetch(`/api/repos/${encodeURIComponent(repoIdOrName)}/issues`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            const mappedIssues: IssueItem[] = json.data.map((item: any) => ({
              id: item.number || item.id,
              title: item.title,
              state: item.status === 'closed' || item.state === 'closed' ? 'closed' : 'open',
              author: item.author || 'user',
              labels: Array.isArray(item.labels)
                ? item.labels
                : [{ name: 'bug', color: '#D73A4A' }],
              commentsCount: item.commentsCount || 0,
              createdAt: item.createdAt || 'recently',
              body: item.body || '',
              assignee: item.assignee || 'Developer 6',
            }));
            setIssues(mappedIssues);
          }
        }
      } catch {
        // Retain existing issues
      }
    },
    [apiFetch],
  );

  const fetchIssueComments = useCallback(
    async (repoIdOrName: string, issueNumber: number) => {
      setIsLoadingComments(true);
      setCommentError(null);
      try {
        const res = await apiFetch(
          `/api/repos/${encodeURIComponent(repoIdOrName)}/issues/${issueNumber}/comments`,
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || 'Failed to load comments');
        }
        setIssueComments(Array.isArray(json.data) ? json.data : []);
      } catch (error) {
        setIssueComments([]);
        setCommentError(error instanceof Error ? error.message : 'Failed to load comments');
      } finally {
        setIsLoadingComments(false);
      }
    },
    [apiFetch],
  );

  const fetchRepoPulls = useCallback(
    async (repoIdOrName: string) => {
      try {
        const res = await apiFetch(`/api/repos/${encodeURIComponent(repoIdOrName)}/pulls`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            const mappedPulls: PRItem[] = json.data.map((item: any) => ({
              id: item.number || item.id,
              title: item.title,
              state:
                item.status === 'merged' ? 'merged' : item.status === 'closed' ? 'closed' : 'open',
              author: item.author || 'user',
              branchSource: item.branchSource || 'main',
              branchTarget: item.branchTarget || 'main',
              checksStatus: 'passing',
              commentsCount: item.commentsCount || 0,
              createdAt: item.createdAt || 'recently',
              body: item.body || '',
              additions: item.additions || 12,
              deletions: item.deletions || 2,
              changedFiles: item.changedFiles || 1,
            }));
            setPulls(mappedPulls);
          }
        }
      } catch {
        // Retain existing pulls
      }
    },
    [apiFetch],
  );

  const fetchRepoBranches = useCallback(
    async (repoIdOrName: string) => {
      try {
        const res = await apiFetch(`/api/repos/${encodeURIComponent(repoIdOrName)}/branches`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            setRepoBranches(json.data.map((b: any) => b.name));
          }
        }
      } catch {
        // Retain existing branches
      }
    },
    [apiFetch],
  );

  const fetchRepoActions = useCallback(
    async (repoIdOrName: string) => {
      try {
        const res = await apiFetch(`/api/repos/${encodeURIComponent(repoIdOrName)}/actions`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            setActions(json.data);
          }
        }
      } catch {
        // Retain existing actions
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    if (selectedRepo) {
      fetchRepoIssues(selectedRepo.id || selectedRepo.name);
      fetchRepoPulls(selectedRepo.id || selectedRepo.name);
      fetchRepoBranches(selectedRepo.id || selectedRepo.name);
      fetchRepoActions(selectedRepo.id || selectedRepo.name);
      setSettingsName(selectedRepo.name);
      setSettingsDesc(selectedRepo.description || '');
      setSettingsBranch(selectedRepo.defaultBranch || 'main');
      setSettingsVisibility(selectedRepo.visibility || 'public');
    }
  }, [selectedRepo, fetchRepoIssues, fetchRepoPulls, fetchRepoBranches, fetchRepoActions]);

  useEffect(() => {
    if (modalState !== 'issue-detail' || !selectedRepo || !selectedIssue) return;
    void fetchIssueComments(selectedRepo.id || selectedRepo.name, selectedIssue.id);
  }, [modalState, selectedRepo, selectedIssue?.id, fetchIssueComments]);

  // Keyboard shortcut listener ('t' for file finder, '/' for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }
      if (e.key === 't' && selectedRepo && activeGitHubTab === 'code') {
        e.preventDefault();
        setModalState('file-finder');
      }
      if (e.key === '/' && selectedRepo) {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        searchInput?.focus();
      }
      if (e.key === 'Escape') {
        setModalState('none');
        setViewingFile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRepo, activeGitHubTab]);

  // Derived Values
  const openIssuesCount = useMemo(() => issues.filter((i) => i.state === 'open').length, [issues]);
  const closedIssuesCount = useMemo(
    () => issues.filter((i) => i.state === 'closed').length,
    [issues],
  );
  const openPullsCount = useMemo(() => pulls.filter((p) => p.state === 'open').length, [pulls]);
  const closedPullsCount = useMemo(() => pulls.filter((p) => p.state !== 'open').length, [pulls]);

  const filteredRepos = useMemo(() => {
    return repos.filter((r) => {
      const matchesSearch =
        r.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(repoSearchQuery.toLowerCase());
      const matchesType = repoTypeFilter === 'all' ? true : r.visibility === repoTypeFilter;
      const matchesLang =
        repoLangFilter === 'all' ? true : r.language.toLowerCase() === repoLangFilter.toLowerCase();
      return matchesSearch && matchesType && matchesLang;
    });
  }, [repos, repoSearchQuery, repoTypeFilter, repoLangFilter]);

  const filteredIssues = useMemo(() => {
    const isClosed = issueSearchQuery.includes('state:closed');
    return issues.filter((i) => {
      const matchState = isClosed ? i.state === 'closed' : i.state === 'open';
      const cleanSearch = issueSearchQuery
        .replace('is:issue', '')
        .replace('state:open', '')
        .replace('state:closed', '')
        .trim()
        .toLowerCase();
      const matchText =
        cleanSearch === '' ||
        i.title.toLowerCase().includes(cleanSearch) ||
        String(i.id).includes(cleanSearch);
      return matchState && matchText;
    });
  }, [issues, issueSearchQuery]);

  const filteredPulls = useMemo(() => {
    const isClosed = pullSearchQuery.includes('state:closed');
    return pulls.filter((p) => {
      const matchState = isClosed ? p.state !== 'open' : p.state === 'open';
      const cleanSearch = pullSearchQuery
        .replace('is:pr', '')
        .replace('state:open', '')
        .replace('state:closed', '')
        .trim()
        .toLowerCase();
      const matchText =
        cleanSearch === '' ||
        p.title.toLowerCase().includes(cleanSearch) ||
        String(p.id).includes(cleanSearch);
      return matchState && matchText;
    });
  }, [pulls, pullSearchQuery]);

  const filteredFiles = useMemo(() => {
    if (!fileSearchQuery.trim()) return files;
    return files.filter((f) => f.path.toLowerCase().includes(fileSearchQuery.toLowerCase()));
  }, [files, fileSearchQuery]);

  // Handlers
  const handleCreateIssue = async (e: FormEvent) => {
    e.preventDefault();
    if (!newIssueTitle.trim()) return;
    const title = newIssueTitle.trim();
    const body = newIssueBody.trim() || 'No description provided.';
    const label = newIssueLabel;
    const repoTarget = selectedRepo?.id || selectedRepo?.name || 'Quant-Ecosystem';

    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          labels: [label],
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const item = json.data;
        const created: IssueItem = {
          id: item.number || item.id,
          title: item.title,
          body: item.body || body,
          state: 'open',
          author: currentUsername,
          labels: Array.isArray(item.labels)
            ? item.labels
            : [{ name: label, color: label === 'bug' ? '#D73A4A' : '#1D76DB' }],
          commentsCount: 0,
          createdAt: 'just now',
          assignee: 'Developer 6',
        };
        setIssues((prev) => [created, ...prev]);
        setNewIssueTitle('');
        setNewIssueBody('');
        setModalState('none');
        showToast(`Issue #${created.id} created in PostgreSQL!`);
        return;
      }
    } catch {
      // Fallback
    }

    const nextId = Math.max(...issues.map((i) => i.id), 260) + 1;
    const created: IssueItem = {
      id: nextId,
      title,
      body,
      state: 'open',
      author: currentUsername,
      labels: [{ name: label, color: label === 'bug' ? '#D73A4A' : '#1D76DB' }],
      commentsCount: 0,
      createdAt: 'just now',
      assignee: 'Developer 6',
    };
    setIssues((prev) => [created, ...prev]);
    setNewIssueTitle('');
    setNewIssueBody('');
    setModalState('none');
    showToast(`Issue #${nextId} created successfully!`);
  };

  const handleToggleIssue = async (issueNumber: number) => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    const target = issues.find((i) => i.id === issueNumber);
    if (!target) return;
    const nextState = target.state === 'open' ? 'closed' : 'open';
    setIssues((prev) => prev.map((i) => (i.id === issueNumber ? { ...i, state: nextState } : i)));
    if (selectedIssue && selectedIssue.id === issueNumber) {
      setSelectedIssue((curr) => (curr ? { ...curr, state: nextState } : null));
    }
    showToast(`Issue #${issueNumber} marked as ${nextState}!`);
    try {
      await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/issues/${issueNumber}/toggle`, {
        method: 'POST',
      });
    } catch {
      // Soft ignore
    }
  };

  const handleSubmitIssueComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRepo || !selectedIssue || isSubmittingComment) return;
    const body = commentDraft.trim();
    if (!body) return;

    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      const repoTarget = selectedRepo.id || selectedRepo.name;
      const res = await apiFetch(
        `/api/repos/${encodeURIComponent(repoTarget)}/issues/${selectedIssue.id}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to post comment');
      }
      const created = json.data as IssueCommentItem;
      setIssueComments((current) => [...current, created]);
      setCommentDraft('');
      setIssues((current) =>
        current.map((issue) =>
          issue.id === selectedIssue.id
            ? { ...issue, commentsCount: issue.commentsCount + 1 }
            : issue,
        ),
      );
      setSelectedIssue((current) =>
        current ? { ...current, commentsCount: current.commentsCount + 1 } : current,
      );
      showToast('Comment posted');
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Failed to post comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleCreatePR = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPrTitle.trim()) return;
    const title = newPrTitle.trim();
    const body = newPrBody.trim() || 'No description provided.';
    const branchSource = newPrBranch;
    const repoTarget = selectedRepo?.id || selectedRepo?.name || 'Quant-Ecosystem';

    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/pulls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          sourceBranch: branchSource,
          targetBranch: currentBranch || 'main',
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const item = json.data;
        const created: PRItem = {
          id: item.number || item.id,
          title: item.title,
          body: item.body || body,
          state: 'open',
          author: currentUsername,
          branchSource,
          branchTarget: currentBranch || 'main',
          checksStatus: 'passing',
          commentsCount: 0,
          createdAt: 'just now',
          additions: item.additions || 12,
          deletions: item.deletions || 2,
          changedFiles: item.changedFiles || 1,
        };
        setPulls((prev) => [created, ...prev]);
        setNewPrTitle('');
        setNewPrBody('');
        setModalState('none');
        showToast(`Pull Request #${created.id} opened in PostgreSQL!`);
        return;
      }
    } catch {
      // Fallback
    }

    const nextId = Math.max(...pulls.map((p) => p.id), 261) + 1;
    const created: PRItem = {
      id: nextId,
      title,
      body,
      state: 'open',
      author: currentUsername,
      branchSource,
      branchTarget: currentBranch,
      checksStatus: 'passing',
      commentsCount: 0,
      createdAt: 'just now',
      additions: 128,
      deletions: 14,
      changedFiles: 5,
    };
    setPulls((prev) => [created, ...prev]);
    setNewPrTitle('');
    setNewPrBody('');
    setModalState('none');
    showToast(`Pull Request #${nextId} opened successfully!`);
  };

  const handleCreateRepo = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRepoName.trim()) return;
    const name = newRepoName.trim();
    const desc = newRepoDesc.trim() || 'Sovereign repository created in QuantGit.';
    const visibility = newRepoVisibility;
    const slug = `${currentUsername}/${name}`;

    try {
      const res = await apiFetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: desc,
          visibility,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const r = json.data;
        const newRepo: Repo = {
          id: r.id || name,
          name: r.name,
          fullName: slug,
          description: r.description || desc,
          visibility,
          language: r.language || 'TypeScript',
          stars: typeof r.stars === 'number' ? r.stars : 1,
          forks: typeof r.forks === 'number' ? r.forks : 0,
          watching: 1,
          cloneUrl: `https://quantmail.in/quantgit/${slug}.git`,
          sshUrl: `git@quantmail.in:${slug}.git`,
          defaultBranch: r.defaultBranch || 'main',
          latestCommit: 'Initial commit with README.md',
          latestCommitSha: '948e3612',
          latestCommitTime: 'just now',
          checksStatus: 'passing',
          license: 'MIT License',
          website: 'https://quantmail.in',
          topics: ['quant', 'workspace'],
        };
        setBaseRepos((prev) => [newRepo, ...prev.filter((p) => p.name !== name)]);
        setSelectedRepo(newRepo);
        setNewRepoName('');
        setNewRepoDesc('');
        setModalState('none');
        showToast(`Repository ${slug} created in database!`);
        return;
      }
    } catch {
      // Fallback
    }

    const newRepo: Repo = {
      id: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name,
      fullName: slug,
      description: desc,
      visibility,
      language: 'TypeScript',
      stars: 1,
      forks: 0,
      watching: 1,
      cloneUrl: `https://quantmail.in/quantgit/${slug}.git`,
      sshUrl: `git@quantmail.in:${slug}.git`,
      defaultBranch: 'main',
      latestCommit: 'Initial repository setup with README.md',
      latestCommitSha: '1a2b3c4d',
      latestCommitTime: 'just now',
      checksStatus: 'passing',
      license: 'MIT License',
      website: 'https://quantmail.in',
      topics: ['quant', 'workspace'],
    };
    setBaseRepos((prev) => [newRepo, ...prev]);
    setSelectedRepo(newRepo);
    setNewRepoName('');
    setNewRepoDesc('');
    setModalState('none');
    showToast(`Repository ${slug} created!`);
  };

  const handleStarRepo = async () => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    const updatedStars = selectedRepo.stars + 1;
    setSelectedRepo({ ...selectedRepo, stars: updatedStars });
    setBaseRepos((prev) =>
      prev.map((r) =>
        r.id === selectedRepo.id || r.name === selectedRepo.name
          ? { ...r, stars: updatedStars }
          : r,
      ),
    );
    showToast('Starred repository!');

    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/star`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.stars) {
          setSelectedRepo((curr) => (curr ? { ...curr, stars: json.data.stars } : null));
          setBaseRepos((prev) =>
            prev.map((r) =>
              r.id === selectedRepo.id || r.name === selectedRepo.name
                ? { ...r, stars: json.data.stars }
                : r,
            ),
          );
        }
      }
    } catch {
      // Keep optimistic increment
    }
  };

  const handleDeleteRepo = async () => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    const repoName = selectedRepo.name;
    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast(`Repository ${repoName} archived and deleted.`);
      }
    } catch {
      // Soft ignore
    }
    setBaseRepos((prev) =>
      prev.filter((r) => r.id !== selectedRepo.id && r.name !== selectedRepo.name),
    );
    setSelectedRepo(null);
    setViewingFile(null);
    setActiveGitHubTab('code');
  };

  const handleSaveSettings = async () => {
    if (!selectedRepo) return;
    setIsSavingSettings(true);
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settingsName.trim() || selectedRepo.name,
          description: settingsDesc.trim(),
          defaultBranch: settingsBranch.trim() || 'main',
          visibility: settingsVisibility,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const updated = {
            ...selectedRepo,
            name: json.data.name,
            description: json.data.description,
            defaultBranch: json.data.defaultBranch,
            visibility: json.data.visibility,
          };
          setSelectedRepo(updated);
          setBaseRepos((prev) =>
            prev.map((r) =>
              r.id === selectedRepo.id || r.name === selectedRepo.name ? { ...r, ...updated } : r,
            ),
          );
          showToast('Settings saved successfully to PostgreSQL!');
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        showToast(errJson.error?.message || 'Failed to save settings');
      }
    } catch {
      showToast('Network error while saving settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleMergePR = async (prNumber: number) => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(
        `/api/repos/${encodeURIComponent(repoTarget)}/pulls/${prNumber}/merge`,
        {
          method: 'POST',
        },
      );
      if (res.ok) {
        setPulls((prev) => prev.map((p) => (p.id === prNumber ? { ...p, state: 'merged' } : p)));
        if (selectedPr && selectedPr.id === prNumber) {
          setSelectedPr((prev) => (prev ? { ...prev, state: 'merged' } : null));
        }
        showToast(`Pull request #${prNumber} merged into ${selectedRepo.defaultBranch}!`);
      } else {
        showToast('Failed to merge pull request');
      }
    } catch {
      showToast('Network error while merging pull request');
    }
  };

  const handleCreateBranch = async () => {
    if (!selectedRepo || !newBranchInput.trim()) return;
    const branchName = newBranchInput.trim();
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: branchName, sha: selectedRepo.latestCommitSha || '948e3612' }),
      });
      if (res.ok) {
        if (!repoBranches.includes(branchName)) {
          setRepoBranches((prev) => [...prev, branchName]);
        }
        setCurrentBranch(branchName);
        setNewBranchInput('');
        setModalState('none');
        showToast(`Branch ${branchName} created and checked out!`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error?.message || 'Failed to create branch');
      }
    } catch {
      showToast('Network error while creating branch');
    }
  };

  const handleTriggerWorkflow = async () => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/actions/trigger`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setActions((prev) => [json.data, ...prev]);
          showToast(`Workflow dispatched on ${selectedRepo.defaultBranch}!`);
        }
      } else {
        showToast('Failed to trigger workflow');
      }
    } catch {
      showToast('Network error while triggering workflow');
    }
  };

  const handleDeployAgent = (e: FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    const newAg: DeployedAgent = {
      id: newAgentName.toLowerCase().replace(/\s+/g, '-'),
      name: newAgentName.trim(),
      role: newAgentRole.trim() || 'Specialized Developer Agent',
      pod: newAgentPod,
      status: 'active',
      currentTask: 'Initialized and listening on swarm event bus.',
      initial: newAgentName.trim().charAt(0).toUpperCase(),
      color: '#FF8C42',
      steps: ['Loaded sovereign context', 'Mounted workspace volume'],
      thoughts: 'Ready to execute zero-mock tasks.',
    };
    setAgents([...agents, newAg]);
    setNewAgentName('');
    setNewAgentRole('');
    setModalState('none');
    showToast(`Agent ${newAg.name} deployed to pod ${newAg.pod}!`);
  };

  const handleMoveKanban = (cardId: string, toColumn: 'todo' | 'in_progress' | 'done') => {
    setProjects(projects.map((c) => (c.id === cardId ? { ...c, column: toColumn } : c)));
    showToast(`Moved card to ${toColumn.replace('_', ' ')}!`);
  };

  const handleUpvoteDiscussion = (discId: number) => {
    setDiscussions(
      discussions.map((d) => (d.id === discId ? { ...d, upvotes: d.upvotes + 1 } : d)),
    );
  };

  const handleChatSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim() || isChatSubmitting) return;

    const userText = promptInput.trim();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: userText,
      mode: buildMode,
      timestamp: 'just now',
    };

    const requestMessages = [...chatMessages, userMsg].map((message) => ({
      role: message.role,
      content: message.text,
    }));

    setChatMessages((previous) => [...previous, userMsg]);
    setPromptInput('');
    setChatError(null);
    setIsChatSubmitting(true);
    setIsContextOpen(false);
    setIsSettingsOpen(false);

    try {
      const response = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: requestMessages,
          intent: effort === 'deep' ? 'deep' : 'auto',
          context: {
            app: 'quantgit',
            route: window.location.pathname,
            view: selectedRepo
              ? `${repositoryOwner(selectedRepo)}/${selectedRepo.name} (${activeGitHubTab})`
              : 'quanty-copilot',
            screenText: `Model: ${activeModel}, Mode: ${buildMode}, Effort: ${effort}`,
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error?.message ||
            payload?.message ||
            `AI request failed with status ${response.status}.`,
        );
      }

      if (typeof payload.data?.message !== 'string' || !payload.data.message.trim()) {
        throw new Error('The AI provider returned an empty response.');
      }

      const toolExecutions: ToolExecutionCard[] = Array.isArray(payload.data?.toolExecutions)
        ? payload.data.toolExecutions
        : [];

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        model: payload.data.routed || payload.data.tier || activeModel,
        text: payload.data.message.trim(),
        timestamp: 'just now',
        toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
      };

      setChatMessages((previous) => [...previous, assistantMessage]);

      if (toolExecutions.length > 0) {
        const hasRepoCreation = toolExecutions.some(
          (t) => t.toolName === 'create_repository' && t.status === 'succeeded',
        );
        if (hasRepoCreation) {
          await fetchRepos();
        }

        const deployed = toolExecutions.filter(
          (t) => t.toolName === 'deploy_agent' && t.status === 'succeeded',
        );
        if (deployed.length > 0) {
          for (const item of deployed) {
            if (item.result) {
              const res = item.result;
              setAgents((current) => [
                ...current,
                {
                  id: res.id || `agent-${Date.now()}`,
                  name: res.name || 'Swarm Worker',
                  role: res.role || 'Autonomous Developer',
                  pod: 'SWARM',
                  status: 'idle',
                  currentTask: `Stationed at Desk #${res.deskNumber || 1}`,
                  initial: String(res.name || 'S')
                    .charAt(0)
                    .toUpperCase(),
                  color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
                },
              ]);
            }
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The AI service is currently unavailable.';

      setPromptInput(userText);
      setChatError(message);
    } finally {
      setIsChatSubmitting(false);
    }
  };

  const handleCommitBlob = useCallback(
    async (input: CommitBlobInput) => {
      if (!selectedRepo) {
        throw new Error('No repository is selected.');
      }

      if (!input.expectedBlobSha) {
        throw new Error('The file has no blob SHA. Reload it before committing.');
      }

      const repoTarget = selectedRepo.id || selectedRepo.name;
      const response = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/file`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: input.path,
          branch: input.branch,
          content: input.content,
          message: input.message,
          parentSha: input.expectedBlobSha,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        if (response.status === 409 || payload?.error?.code === 'STALE_BLOB') {
          throw new Error('This file changed on the server. Reload it before committing.');
        }

        throw new Error(
          payload?.error?.message || payload?.message || 'Failed to commit file changes.',
        );
      }

      setViewingFile((current) =>
        current
          ? {
              ...current,
              content: input.content,
            }
          : current,
      );
      setViewingBlobSha(payload.data?.blobSha || payload.data?.sha || '');
      showToast(`Committed ${input.path} at ${String(payload.data?.commitSha || '').slice(0, 8)}`);
      closeBlobEditor();
      await fetchRepos();
    },
    [apiFetch, closeBlobEditor, fetchRepos, selectedRepo],
  );

  return (
    <main className="h-dvh max-h-dvh w-full overflow-hidden flex flex-col bg-[#0D1117] text-[#E6EDF3] font-sans antialiased">
      {/* ========================================================================= */}
      {/* 1. GLOBAL NAVIGATION BAR (NOTION AI FOR QUANTY / GITHUB FOR REPOS & LAB)  */}
      {/* ========================================================================= */}
      {activeDeckTab === 'quanty' ? (
        <header className="shrink-0 z-30 bg-[#0D1117]/95 backdrop-blur border-b border-[#21262D] px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`p-1.5 rounded-md hover:bg-[#21262D] transition-colors ${
                isHistoryOpen ? 'bg-[#21262D] text-white' : 'text-[#7D8590] hover:text-white'
              }`}
              title="Lock sidebar open / Chat history"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
                <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75Zm0 5a.75.75 0 0 1 1.75-1.5h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1-.75-.75Z" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <BubbleAvatar state="coding" size={32} />
              <span className="font-bold text-[#E6EDF3] text-sm">Quanty AI</span>
              <span className="text-[#7D8590]">/</span>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="flex items-center gap-1 text-[#E6EDF3] hover:text-white font-medium hover:bg-[#21262D] px-2 py-1 rounded transition-colors"
              >
                <span className="max-w-[180px] sm:max-w-xs truncate">
                  {chatSessions.find((s) => s.id === activeSessionId)?.title ||
                    'Urgent GitHub parity & Notion AI overhaul'}
                </span>
                <span className="text-[#7D8590] text-[10px]">▾</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                const newId = `sess-${Date.now()}`;
                setChatSessions([
                  { id: newId, title: 'New Conversation', date: 'Just now', count: 0 },
                  ...chatSessions,
                ]);
                setActiveSessionId(newId);
                setChatMessages([]);
                showToast('Started new chat');
              }}
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors"
              title="New Chat"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
                <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsPersonalizeOpen(true)}
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors"
              title="Personalize Quanty AI"
            >
              🎨
            </button>
          </div>
        </header>
      ) : (
        <header className="shrink-0 z-30 bg-[#010409] border-b border-[#30363D] px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {/* Sovereign QuantGit Logo */}
            <button
              type="button"
              onClick={() => {
                setActiveDeckTab('repos');
                setSelectedRepo(null);
                setViewingFile(null);
              }}
              className="flex items-center gap-2 text-white hover:text-[#FF8C42] transition-colors p-1 rounded-md"
              title="QuantGit Home"
            >
              <QuantGitLogo size={28} />
              <span className="font-bold text-sm tracking-tight text-[#E6EDF3]">QuantGit</span>
            </button>

            {/* Breadcrumbs */}
            {activeDeckTab === 'lab' ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#7D8590]">/</span>
                <span className="text-white font-bold flex items-center gap-1.5">
                  <span>🧪</span> Agent Lab
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[#30363D] text-[#7D8590] uppercase tracking-wider">
                  Fleet Command
                </span>
              </div>
            ) : selectedRepo ? (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
                <span className="text-[#7D8590]">/</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRepo(null);
                    setViewingFile(null);
                  }}
                  className="text-[#58A6FF] hover:underline font-medium truncate max-w-[70px] sm:max-w-[120px] md:max-w-none"
                  title={currentUsername}
                >
                  {currentUsername}
                </button>
                <span className="text-[#7D8590]">/</span>
                <button
                  type="button"
                  onClick={() => {
                    setViewingFile(null);
                    setActiveGitHubTab('code');
                  }}
                  className="text-[#58A6FF] hover:underline font-bold text-white truncate max-w-[80px] sm:max-w-[140px] md:max-w-none"
                  title={selectedRepo.name}
                >
                  {selectedRepo.name}
                </button>
                {viewingFile && (
                  <>
                    <span className="text-[#7D8590]">/</span>
                    <span
                      className="text-[#7D8590] font-mono text-xs truncate max-w-[90px] sm:max-w-[160px] md:max-w-none"
                      title={viewingFile.path}
                    >
                      {viewingFile.path}
                    </span>
                  </>
                )}
                <span className="ml-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider border border-[#30363D] text-[#7D8590] shrink-0">
                  {selectedRepo.visibility}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
                <span className="text-[#7D8590]">/</span>
                <span
                  className="text-white font-bold truncate max-w-[100px] sm:max-w-[160px] md:max-w-none"
                  title={currentUsername}
                >
                  {currentUsername}
                </span>
                <span className="text-[#7D8590] text-xs shrink-0">· Repositories</span>
              </div>
            )}
          </div>

          {/* Global Search & Action Buttons */}
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <input
                id="global-search-input"
                type="text"
                placeholder="Type / to search"
                className="w-56 lg:w-72 bg-[#161B22] border border-[#30363D] rounded-md px-2.5 py-1 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] focus:w-80 transition-all"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-[#30363D] bg-[#21262D] text-[10px] font-mono text-[#7D8590]">
                /
              </span>
            </div>

            <button
              type="button"
              onClick={() => setModalState('new-repo')}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors text-xs font-semibold"
              title="Create New..."
            >
              <span className="text-[#7D8590]">+</span> ▼
            </button>

            <button
              type="button"
              onClick={() => showToast('All notifications read')}
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors relative"
              title="Notifications"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
                <path d="M8 16a2 2 0 0 0 1.985-1.75c.001-.014.004-.028.005-.042.005-.07.01-.14.01-.208H6a2 2 0 0 0 2 2Zm.636-14.708a.75.75 0 0 0-1.272 0A5.5 5.5 0 0 0 3 6.5v3.428l-.78 1.56a.75.75 0 0 0 .67 1.012h10.22a.75.75 0 0 0 .67-1.012L13 9.928V6.5a5.5 5.5 0 0 0-4.364-5.208Z" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#58A6FF]" />
            </button>

            <div className="flex items-center gap-1.5 pl-1 border-l border-[#30363D]">
              <BubbleAvatar state="coding" size={24} />
              <span className="hidden md:inline text-[11px] font-bold text-[#FF8C42]">
                Astra Swarm
              </span>
            </div>
          </div>
        </header>
      )}

      {/* Sliding Left History Drawer with Backdrop */}
      {isHistoryOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
            onClick={() => setIsHistoryOpen(false)}
          />
          <aside className="fixed top-0 left-0 bottom-0 w-80 bg-[#161B22] border-r border-[#30363D] z-50 p-4 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
              <div className="flex items-center gap-2">
                <BubbleAvatar state="coding" size={28} />
                <span className="font-bold text-sm text-white">Chat History</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newId = `sess-${Date.now()}`;
                    setChatSessions([
                      { id: newId, title: 'New Conversation', date: 'Just now', count: 0 },
                      ...chatSessions,
                    ]);
                    setActiveSessionId(newId);
                    setChatMessages([]);
                    setIsHistoryOpen(false);
                    showToast('Started new chat');
                  }}
                  className="px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] text-[11px] text-[#58A6FF] font-semibold transition-colors"
                >
                  + New
                </button>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1 rounded text-[#7D8590] hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto mt-2 space-y-4 pr-1">
              {/* Pinned Chats Section */}
              {chatSessions.filter((s) => pinnedSessionIds.includes(s.id)).length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#FF8C42] px-2 flex items-center gap-1.5">
                    <span>📌</span>
                    <span>Pinned</span>
                  </div>
                  <div className="space-y-0.5">
                    {chatSessions
                      .filter((s) => pinnedSessionIds.includes(s.id))
                      .map((s) => {
                        const isActive = activeSessionId === s.id;
                        const isEditing = editingSessionId === s.id;
                        return (
                          <div
                            key={s.id}
                            className={`group relative flex items-center justify-between py-2 px-2.5 rounded-lg text-xs transition-colors ${
                              isActive
                                ? 'bg-[#21262D] text-white font-semibold'
                                : 'text-[#7D8590] hover:text-white hover:bg-[#1F242C]'
                            }`}
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editingTitle.trim()) {
                                      setChatSessions((prev) =>
                                        prev.map((cs) =>
                                          cs.id === s.id
                                            ? { ...cs, title: editingTitle.trim() }
                                            : cs,
                                        ),
                                      );
                                      showToast('Chat renamed');
                                    }
                                    setEditingSessionId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingSessionId(null);
                                  }
                                }}
                                onBlur={() => {
                                  if (editingTitle.trim()) {
                                    setChatSessions((prev) =>
                                      prev.map((cs) =>
                                        cs.id === s.id ? { ...cs, title: editingTitle.trim() } : cs,
                                      ),
                                    );
                                  }
                                  setEditingSessionId(null);
                                }}
                                autoFocus
                                className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                              />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveSessionId(s.id);
                                    setIsHistoryOpen(false);
                                    showToast(`Switched to: ${s.title}`);
                                  }}
                                  className="flex-1 text-left truncate mr-2"
                                  title={s.title}
                                >
                                  <span className="truncate block max-w-[150px]">{s.title}</span>
                                  <span className="text-[10px] text-[#7D8590] block">{s.date}</span>
                                </button>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPinnedSessionIds((prev) =>
                                        prev.filter((id) => id !== s.id),
                                      );
                                      showToast('Chat unpinned');
                                    }}
                                    className="p-1 rounded hover:bg-[#30363D] text-[#FF8C42] hover:text-white"
                                    title="Unpin chat"
                                  >
                                    📌
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSessionId(s.id);
                                      setEditingTitle(s.title);
                                    }}
                                    className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                    title="Rename chat"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChatSessions((prev) =>
                                        prev.filter((cs) => cs.id !== s.id),
                                      );
                                      setPinnedSessionIds((prev) =>
                                        prev.filter((id) => id !== s.id),
                                      );
                                      if (activeSessionId === s.id) {
                                        const remaining = chatSessions.filter(
                                          (cs) => cs.id !== s.id,
                                        );
                                        setActiveSessionId(remaining[0]?.id || '');
                                      }
                                      showToast('Chat deleted');
                                    }}
                                    className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-[#F85149]"
                                    title="Delete chat"
                                  >
                                    🗑
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Recent Chats Section */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#7D8590] px-2">
                  Recent
                </div>
                <div className="space-y-0.5">
                  {chatSessions
                    .filter((s) => !pinnedSessionIds.includes(s.id))
                    .map((s) => {
                      const isActive = activeSessionId === s.id;
                      const isEditing = editingSessionId === s.id;
                      return (
                        <div
                          key={s.id}
                          className={`group relative flex items-center justify-between py-2 px-2.5 rounded-lg text-xs transition-colors ${
                            isActive
                              ? 'bg-[#21262D] text-white font-semibold'
                              : 'text-[#7D8590] hover:text-white hover:bg-[#1F242C]'
                          }`}
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingTitle.trim()) {
                                    setChatSessions((prev) =>
                                      prev.map((cs) =>
                                        cs.id === s.id ? { ...cs, title: editingTitle.trim() } : cs,
                                      ),
                                    );
                                    showToast('Chat renamed');
                                  }
                                  setEditingSessionId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingSessionId(null);
                                }
                              }}
                              onBlur={() => {
                                if (editingTitle.trim()) {
                                  setChatSessions((prev) =>
                                    prev.map((cs) =>
                                      cs.id === s.id ? { ...cs, title: editingTitle.trim() } : cs,
                                    ),
                                  );
                                }
                                setEditingSessionId(null);
                              }}
                              autoFocus
                              className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSessionId(s.id);
                                  setIsHistoryOpen(false);
                                  showToast(`Switched to: ${s.title}`);
                                }}
                                className="flex-1 text-left truncate mr-2"
                                title={s.title}
                              >
                                <span className="truncate block max-w-[150px]">{s.title}</span>
                                <span className="text-[10px] text-[#7D8590] block">{s.date}</span>
                              </button>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPinnedSessionIds((prev) => [...prev, s.id]);
                                    showToast('Chat pinned');
                                  }}
                                  className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                  title="Pin chat"
                                >
                                  📌
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSessionId(s.id);
                                    setEditingTitle(s.title);
                                  }}
                                  className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                  title="Rename chat"
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChatSessions((prev) => prev.filter((cs) => cs.id !== s.id));
                                    if (activeSessionId === s.id) {
                                      const remaining = chatSessions.filter((cs) => cs.id !== s.id);
                                      setActiveSessionId(remaining[0]?.id || '');
                                    }
                                    showToast('Chat deleted');
                                  }}
                                  className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-[#F85149]"
                                  title="Delete chat"
                                >
                                  🗑
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. REPOSITORY HEADER & 10 SUB-NAVIGATION TABS                              */}
      {/* ========================================================================= */}
      {activeDeckTab === 'repos' && selectedRepo && (
        <div className="bg-[#010409] border-b border-[#30363D] pt-4 px-4 sm:px-8">
          {/* Top Repository Meta Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveDeckTab('repos');
                  setSelectedRepo(null);
                  setViewingFile(null);
                }}
                className="text-xs text-[#58A6FF] hover:underline font-medium flex items-center gap-1 mr-2"
              >
                ← All Repositories
              </button>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <svg height="18" viewBox="0 0 16 16" width="18" fill="#7D8590">
                  <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25Z" />
                </svg>
                {selectedRepo.name}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border border-[#30363D] text-[#7D8590]">
                {selectedRepo.visibility}
              </span>
            </div>

            {/* Watch, Fork, Star Action Buttons */}
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => showToast('Notification settings updated')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
              >
                👁 Watch{' '}
                <span className="px-1.5 py-0.2 rounded-full bg-[#30363D] text-[10px] text-[#7D8590]">
                  {selectedRepo.watching}
                </span>
              </button>
              <button
                type="button"
                onClick={() => showToast('Fork copied to your workspace')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
              >
                ⑂ Fork{' '}
                <span className="px-1.5 py-0.2 rounded-full bg-[#30363D] text-[10px] text-[#7D8590]">
                  {selectedRepo.forks}
                </span>
              </button>
              <button
                type="button"
                onClick={handleStarRepo}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
              >
                ★ Star{' '}
                <span className="px-1.5 py-0.2 rounded-full bg-[#30363D] text-[10px] text-[#7D8590]">
                  {selectedRepo.stars}
                </span>
              </button>
            </div>
          </div>

          {/* ALL 10 AUTHENTIC GITHUB TABS */}
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none border-t border-[#21262D] text-xs font-semibold">
            {[
              { id: 'code', label: '<> Code', badge: null },
              { id: 'issues', label: '⨀ Issues', badge: openIssuesCount },
              { id: 'pulls', label: '⑂ Pull requests', badge: openPullsCount },
              { id: 'agents', label: '✨ Agents', badge: 'Copilot' },
              { id: 'discussions', label: '💬 Discussions', badge: discussions.length },
              { id: 'actions', label: '▶ Actions', badge: actions.length },
              { id: 'projects', label: '📊 Projects', badge: projects.length },
              { id: 'security', label: '🛡️ Security', badge: securityAlerts.length },
              { id: 'insights', label: '📈 Insights', badge: null },
              { id: 'settings', label: '⚙️ Settings', badge: null },
            ].map((t) => {
              const active = activeGitHubTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openRepositoryTab(t.id as GitHubTab)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 transition-all shrink-0 ${
                    active
                      ? 'border-[#FF8C42] text-white font-bold'
                      : 'border-transparent text-[#7D8590] hover:text-[#E6EDF3] hover:border-[#30363D]'
                  }`}
                >
                  <span>{t.label}</span>
                  {t.badge !== null && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        active
                          ? 'bg-[#FF8C42]/20 text-[#FF8C42] font-bold'
                          : 'bg-[#21262D] text-[#7D8590]'
                      }`}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      )}
      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE / TAB CONTENT BODY                                      */}
      {/* ========================================================================= */}
      <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden">
        {/* ======================================================================= */}
        {/* VIEW A: ALL REPOSITORIES DIRECTORY (when selectedRepo === null)         */}
        {/* ======================================================================= */}
        {activeDeckTab === 'repos' && !selectedRepo && (
          <div className="flex-1 w-full min-h-0 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-20">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#30363D]">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">All Repositories</h2>
                  <p className="text-xs text-[#7D8590] mt-0.5">
                    Git source control, PR review pipelines & autonomous swarm agents.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalState('new-repo')}
                  className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-md transition-colors flex items-center gap-1.5"
                >
                  <span>+</span> New repository
                </button>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center gap-2.5 py-4 border-b border-[#21262D] text-xs">
                <input
                  type="text"
                  value={repoSearchQuery}
                  onChange={(e) => setRepoSearchQuery(e.target.value)}
                  placeholder="Find a repository..."
                  className="flex-1 min-w-[200px] bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                />
                <select
                  value={repoTypeFilter}
                  onChange={(e) => setRepoTypeFilter(e.target.value as any)}
                  className="bg-[#21262D] border border-[#30363D] rounded-md px-2.5 py-1.5 text-xs text-[#E6EDF3] focus:outline-none"
                >
                  <option value="all">Type: All</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
                <select
                  value={repoLangFilter}
                  onChange={(e) => setRepoLangFilter(e.target.value)}
                  className="bg-[#21262D] border border-[#30363D] rounded-md px-2.5 py-1.5 text-xs text-[#E6EDF3] focus:outline-none"
                >
                  <option value="all">Language: All</option>
                  <option value="typescript">TypeScript</option>
                  <option value="kotlin">Kotlin</option>
                </select>
              </div>

              {/* Repositories List */}
              <div className="divide-y divide-[#21262D]">
                {filteredRepos.map((r) => (
                  <div key={r.id} className="py-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            openRepository(r);
                          }}
                          className="text-base font-bold text-[#58A6FF] hover:underline"
                        >
                          {r.name}
                        </button>
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold border border-[#30363D] text-[#7D8590] uppercase">
                          {r.visibility}
                        </span>
                      </div>
                      <p className="text-xs text-[#7D8590] leading-relaxed">{r.description}</p>
                      <div className="flex items-center gap-4 text-xs text-[#7D8590] pt-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${r.language === 'TypeScript' ? 'bg-[#3178C6]' : 'bg-[#A97BFF]'}`}
                          />
                          {r.language}
                        </span>
                        <span>★ {r.stars}</span>
                        <span>⑂ {r.forks}</span>
                        <span>Updated {r.latestCommitTime}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRepo(r);
                          setModalState('clone');
                        }}
                        className="px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-xs font-semibold hover:bg-[#30363D] transition-colors"
                      >
                        Clone
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openRepository(r);
                        }}
                        className="px-3.5 py-1 rounded-md bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold text-xs transition-colors"
                      >
                        Open Repo →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* VIEW B: 1:1 REPOSITORY WORKSPACE (when selectedRepo !== null)           */}
        {/* ======================================================================= */}
        {activeDeckTab === 'repos' && selectedRepo && (
          <div className="flex-1 w-full min-h-0 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-20">
              {/* ------------------------------------------------------------------- */}
              {/* TAB 1: <> CODE (TWO-COLUMN GITHUB LAYOUT)                          */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'code' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                  {/* Left / Main Column (75%) */}
                  <div className="lg:col-span-3 space-y-4">
                    {/* File Navigation Controls Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        {/* Branch Switcher Button */}
                        <button
                          type="button"
                          onClick={() => setModalState('branch-switcher')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
                        >
                          <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                          </svg>
                          <span>{currentBranch}</span>
                          <span className="text-[#7D8590] text-[10px]">▼</span>
                        </button>

                        <span className="text-[#7D8590] hidden sm:inline">
                          <span className="text-white font-semibold">348</span> branches ·{' '}
                          <span className="text-white font-semibold">2</span> tags
                        </span>
                      </div>

                      {/* Quick Finder, Add File & Clone Dropdown */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModalState('file-finder')}
                          className="px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
                          title="Go to file (t)"
                        >
                          Go to file{' '}
                          <span className="text-[10px] text-[#7D8590] border border-[#30363D] px-1 rounded ml-1 font-mono">
                            t
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => showToast('Create/Upload file action')}
                          className="px-2.5 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
                        >
                          Add file ▼
                        </button>

                        {/* Green Code Clone Button */}
                        <button
                          type="button"
                          onClick={() => setModalState('clone')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold transition-colors shadow-sm"
                        >
                          <span>&lt;&gt; Code</span>
                          <span className="text-[10px]">▼</span>
                        </button>
                      </div>
                    </div>

                    {/* Latest Commit Banner */}
                    <div className="bg-[#161B22] border border-[#30363D] rounded-t-md p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#FF8C42] text-black font-bold flex items-center justify-center text-[10px] shrink-0">
                          K
                        </span>
                        <span className="font-semibold text-white">Developer 6</span>
                        <span
                          className="text-[#7D8590] truncate max-w-md"
                          title={selectedRepo.latestCommit}
                        >
                          {selectedRepo.latestCommit}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-[#7D8590]">
                        <span className="px-1.5 py-0.2 rounded border border-[#238636] text-[#3FB950] text-[10px] font-semibold flex items-center gap-1">
                          ✓ Verified
                        </span>
                        <button
                          type="button"
                          onClick={() => showToast(`Commit SHA: ${selectedRepo.latestCommitSha}`)}
                          className="font-mono text-[#58A6FF] hover:underline"
                        >
                          {selectedRepo.latestCommitSha}
                        </button>
                        <span>· {selectedRepo.latestCommitTime}</span>
                        <button
                          type="button"
                          onClick={() => showToast('Opening commit history...')}
                          className="text-white hover:text-[#58A6FF] font-semibold flex items-center gap-1"
                        >
                          <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                            <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .375.65l2.5 1.5a.75.75 0 1 0 .75-1.3L8.75 7.85V4.75Z" />
                          </svg>
                          2,118 Commits
                        </button>
                      </div>
                    </div>

                    {/* File Tree Table Explorer */}
                    <div className="border border-t-0 border-[#30363D] rounded-b-md divide-y divide-[#21262D] text-xs bg-[#0D1117] overflow-hidden">
                      {files.map((file) => (
                        <div
                          key={file.path}
                          className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#161B22] transition-colors cursor-pointer group"
                          onClick={() => {
                            if (file.type === 'dir') {
                              showToast(`Opening folder ${file.name}`);
                            } else {
                              void openBlobEditor(file);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {file.type === 'dir' ? (
                              <svg
                                height="16"
                                viewBox="0 0 16 16"
                                width="16"
                                fill="#58A6FF"
                                className="shrink-0"
                              >
                                <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
                              </svg>
                            ) : (
                              <svg
                                height="16"
                                viewBox="0 0 16 16"
                                width="16"
                                fill="#7D8590"
                                className="shrink-0"
                              >
                                <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.793V4.25c0 .138.112.25.25.25h2.457Z" />
                              </svg>
                            )}
                            <span className="font-medium text-[#E6EDF3] group-hover:text-[#58A6FF] truncate">
                              {file.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-[#7D8590] text-[11px] shrink-0">
                            <span className="hidden md:inline truncate max-w-xs">
                              {file.lastCommit}
                            </span>
                            <span className="text-right w-20">{file.lastCommitDate}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Formatted README.md Preview Container */}
                    <div className="border border-[#30363D] rounded-md bg-[#0D1117] overflow-hidden mt-6">
                      <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <svg height="16" viewBox="0 0 16 16" width="16" fill="#7D8590">
                            <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.53-.53a3.75 3.75 0 0 1 2.65-1.094h3.57V2.5h-3.006a2.25 2.25 0 0 0-2.25 2.25v6.524ZM6.75 4.75A2.25 2.25 0 0 0 4.504 2.5H1.5v7.95h3.757a3.75 3.75 0 0 1 2.651 1.094Z" />
                          </svg>
                          README.md
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#7D8590]">
                          <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#3FB950] font-semibold">
                            build: passing
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-[#21262D] text-[#58A6FF] font-semibold">
                            license: MIT
                          </span>
                        </div>
                      </div>

                      <div className="p-6 space-y-4 text-xs leading-relaxed text-[#E6EDF3]">
                        <h2 className="text-xl font-bold text-white border-b border-[#21262D] pb-2">
                          Quant Ecosystem — The Next NVIDIA of Software
                        </h2>
                        <p className="text-[#7D8590]">
                          A unified sovereign operating ecosystem built for high-performance
                          computing, intelligent mail triage, autonomous agentic development, and
                          real git collaboration.
                        </p>

                        <div className="bg-[#161B22] border border-[#30363D] rounded-md p-3 font-mono text-[11px] text-[#58A6FF] space-y-1">
                          <p className="text-[#7D8590]"># Clone the unified monorepo</p>
                          <p>git clone {selectedRepo.cloneUrl}</p>
                          <p className="text-[#7D8590] pt-1">
                            # Install dependencies and start development
                          </p>
                          <p>pnpm install && pnpm dev</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          <div className="p-3 rounded-md bg-[#161B22] border border-[#30363D]">
                            <h4 className="font-bold text-[#FF8C42] mb-1">⚡ Flagship QuantMail</h4>
                            <p className="text-[11px] text-[#7D8590]">
                              Inline triage lenses, Bayesian spam protection, and local ONNX
                              embeddings.
                            </p>
                          </div>
                          <div className="p-3 rounded-md bg-[#161B22] border border-[#30363D]">
                            <h4 className="font-bold text-[#58A6FF] mb-1">
                              📱 Sovereign Android Client
                            </h4>
                            <p className="text-[11px] text-[#7D8590]">
                              Jetpack Compose + hardware-accelerated WebView client in apk testing/.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right / Sidebar Column (25%) */}
                  <div className="space-y-6 text-xs">
                    {/* About Card */}
                    <div className="space-y-3 pb-6 border-b border-[#30363D]">
                      <h3 className="font-bold text-sm text-white">About</h3>
                      <p className="text-[#7D8590] leading-relaxed">{selectedRepo.description}</p>
                      <a
                        href={selectedRepo.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#58A6FF] hover:underline font-semibold flex items-center gap-1"
                      >
                        🔗 {selectedRepo.website.replace('https://', '')}
                      </a>

                      {/* Topics Pills */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedRepo.topics.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full bg-[#1F242C] text-[#58A6FF] hover:bg-[#28313E] text-[10px] font-semibold cursor-pointer"
                          >
                            {t}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-2 pt-2 text-[#7D8590]">
                        <div className="flex items-center gap-2">
                          <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                            <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Z" />
                          </svg>
                          <span>Readme</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                            <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .375.65l2.5 1.5a.75.75 0 1 0 .75-1.3L8.75 7.85V4.75Z" />
                          </svg>
                          <span>Activity</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>★</span>
                          <span className="text-white font-semibold">
                            {selectedRepo.stars}
                          </span>{' '}
                          stars
                        </div>
                        <div className="flex items-center gap-2">
                          <span>👁</span>
                          <span className="text-white font-semibold">
                            {selectedRepo.watching}
                          </span>{' '}
                          watching
                        </div>
                        <div className="flex items-center gap-2">
                          <span>⑂</span>
                          <span className="text-white font-semibold">
                            {selectedRepo.forks}
                          </span>{' '}
                          forks
                        </div>
                      </div>
                    </div>

                    {/* Releases Card (With Download Links for APK!) */}
                    <div className="space-y-3 pb-6 border-b border-[#30363D]">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-white">Releases</h3>
                        <span className="px-1.5 py-0.2 rounded-full bg-[#238636] text-white text-[10px] font-bold">
                          Latest
                        </span>
                      </div>

                      <div className="p-3 rounded-md bg-[#161B22] border border-[#30363D] space-y-2">
                        <div className="font-bold text-[#58A6FF]">Quant v1.0 Universal APK</div>
                        <p className="text-[11px] text-[#7D8590]">
                          Native Android release with targetSdk 36 & Compose.
                        </p>
                        <div className="space-y-1 pt-1">
                          <a
                            href="https://raw.githubusercontent.com/quantrinitylab/Quant-Ecosystem/main/apk%20testing/Quant-v1.0-debug.apk"
                            className="block text-[11px] text-[#FF8C42] hover:underline font-semibold"
                          >
                            📥 Quant-v1.0-debug.apk (11.39 MB)
                          </a>
                          <a
                            href="https://raw.githubusercontent.com/quantrinitylab/Quant-Ecosystem/main/apk%20testing/quant-app.apk"
                            className="block text-[11px] text-[#7D8590] hover:underline font-mono"
                          >
                            📦 quant-app.apk (Mirror)
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Packages Card */}
                    <div className="space-y-2 pb-6 border-b border-[#30363D]">
                      <h3 className="font-bold text-sm text-white">Packages</h3>
                      <p className="text-[11px] text-[#7D8590]">
                        No published packages yet in registry.
                      </p>
                    </div>

                    {/* Contributors Card */}
                    <div className="space-y-3 pb-6 border-b border-[#30363D]">
                      <h3 className="font-bold text-sm text-white">
                        Contributors{' '}
                        <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[#7D8590] text-[10px]">
                          8
                        </span>
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {['K', 'A', 'S', 'F', 'R', 'P', 'L', 'D'].map((init, idx) => (
                          <span
                            key={idx}
                            className="w-6 h-6 rounded-full bg-[#21262D] border border-[#30363D] text-[#E6EDF3] font-bold flex items-center justify-center text-[10px]"
                          >
                            {init}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Languages Card */}
                    <div className="space-y-2">
                      <h3 className="font-bold text-sm text-white">Languages</h3>
                      <div className="h-2 rounded-full overflow-hidden flex">
                        <div className="bg-[#3178C6] w-[84%]" title="TypeScript 84.2%" />
                        <div className="bg-[#A97BFF] w-[8%]" title="Kotlin 8.1%" />
                        <div className="bg-[#3572A5] w-[4%]" title="Python 4.3%" />
                        <div className="bg-[#89E051] w-[2%]" title="Shell 2.1%" />
                        <div className="bg-[#F1E05A] w-[2%]" title="Other 1.3%" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#7D8590] pt-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#3178C6]" /> TypeScript 84.2%
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#A97BFF]" /> Kotlin 8.1%
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#3572A5]" /> Python 4.3%
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#89E051]" /> Shell 2.1%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 2: ⨀ ISSUES                                                    */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'issues' && (
                <div className="space-y-4 text-xs">
                  {/* Issues Filter & New Issue Button */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-[240px] relative">
                      <input
                        type="text"
                        value={issueSearchQuery}
                        onChange={(e) => setIssueSearchQuery(e.target.value)}
                        placeholder="Search all issues..."
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setModalState('new-issue')}
                        className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors"
                      >
                        New issue
                      </button>
                    </div>
                  </div>

                  {/* Issues List Container */}
                  <div className="border border-[#30363D] rounded-md bg-[#0D1117] overflow-hidden">
                    <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-3 flex items-center justify-between font-semibold">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setIssueSearchQuery('is:issue state:open')}
                          className={`flex items-center gap-1.5 ${!issueSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
                        >
                          ⨀ {openIssuesCount} Open
                        </button>
                        <button
                          type="button"
                          onClick={() => setIssueSearchQuery('is:issue state:closed')}
                          className={`flex items-center gap-1.5 ${issueSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
                        >
                          ✓ {closedIssuesCount} Closed
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-[#21262D]">
                      {filteredIssues.map((issue) => (
                        <div
                          key={issue.id}
                          className="p-3.5 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleIssue(issue.id);
                                }}
                                title={
                                  issue.state === 'open'
                                    ? 'Click to close issue'
                                    : 'Click to reopen issue'
                                }
                                className={`font-bold transition-transform hover:scale-110 ${
                                  issue.state === 'open' ? 'text-[#3FB950]' : 'text-[#8957E5]'
                                }`}
                              >
                                {issue.state === 'open' ? '⨀' : '✓'}
                              </button>
                              <span
                                onClick={() => {
                                  openIssueDetail(issue);
                                }}
                                className={`font-bold hover:text-[#58A6FF] cursor-pointer ${
                                  issue.state === 'closed'
                                    ? 'line-through text-[#7D8590]'
                                    : 'text-white'
                                }`}
                              >
                                {issue.title}
                              </span>
                              {issue.labels.map((lbl) => (
                                <span
                                  key={lbl.name}
                                  className="px-2 py-0.2 rounded-full text-[10px] font-bold text-white"
                                  style={{ backgroundColor: lbl.color }}
                                >
                                  {lbl.name}
                                </span>
                              ))}
                            </div>
                            <p className="text-[11px] text-[#7D8590]">
                              #{issue.id} opened {issue.createdAt} by {issue.author} · Assignee:{' '}
                              {issue.assignee}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-[#7D8590]">
                            <span>💬</span>
                            <span>{issue.commentsCount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 3: ⑂ PULL REQUESTS                                             */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'pulls' && (
                <div className="space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-[240px]">
                      <input
                        type="text"
                        value={pullSearchQuery}
                        onChange={(e) => setPullSearchQuery(e.target.value)}
                        placeholder="Search all pull requests..."
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1.5 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalState('new-pr')}
                      className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors"
                    >
                      New pull request
                    </button>
                  </div>

                  <div className="border border-[#30363D] rounded-md bg-[#0D1117] overflow-hidden">
                    <div className="bg-[#161B22] border-b border-[#30363D] px-4 py-3 flex items-center justify-between font-semibold">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setPullSearchQuery('is:pr state:open')}
                          className={`flex items-center gap-1.5 ${!pullSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
                        >
                          ⑂ {openPullsCount} Open
                        </button>
                        <button
                          type="button"
                          onClick={() => setPullSearchQuery('is:pr state:closed')}
                          className={`flex items-center gap-1.5 ${pullSearchQuery.includes('state:closed') ? 'text-white font-bold' : 'text-[#7D8590]'}`}
                        >
                          ✓ {closedPullsCount} Closed
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-[#21262D]">
                      {filteredPulls.map((pr) => (
                        <div
                          key={pr.id}
                          className="p-3.5 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={
                                  pr.state === 'merged' ? 'text-[#A371F7]' : 'text-[#3FB950]'
                                }
                              >
                                ⑂
                              </span>
                              <span
                                onClick={() => {
                                  openPullDetail(pr);
                                }}
                                className="font-bold text-white hover:text-[#58A6FF] cursor-pointer"
                              >
                                {pr.title}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-[#1F242C] text-[#58A6FF] font-mono text-[10px]">
                                {pr.branchSource}
                              </span>
                              <span className="px-1.5 py-0.2 rounded border border-[#238636] text-[#3FB950] text-[10px] font-semibold">
                                ✓ checks passed
                              </span>
                            </div>
                            <p className="text-[11px] text-[#7D8590]">
                              #{pr.id} by {pr.author} was {pr.state} {pr.createdAt} · +
                              {pr.additions} -{pr.deletions}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-[#7D8590]">
                            <span>💬</span>
                            <span>{pr.commentsCount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 4: ✨ AGENTS (COPILOT & AUTONOMOUS SWARM)                       */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'agents' && (
                <div className="space-y-6 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-[#161B22] border border-[#30363D]">
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <BubbleAvatar state="coding" size={20} />
                        Autonomous Swarm Fleet & GitHub Copilot Workspace
                      </h3>
                      <p className="text-[#7D8590]">
                        6 specialized developer agents autonomously reviewing PRs, managing
                        migrations, and testing code.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalState('deploy-agent')}
                      className="px-3.5 py-1.5 rounded-md bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold transition-colors"
                    >
                      + Deploy Agent
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {agents.map((ag) => (
                      <div
                        key={ag.id}
                        className="p-4 rounded-md bg-[#161B22] border border-[#30363D] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-7 h-7 rounded-full font-bold flex items-center justify-center text-xs text-black"
                              style={{ backgroundColor: ag.color }}
                            >
                              {ag.initial}
                            </span>
                            <div>
                              <h4 className="font-bold text-white">{ag.name}</h4>
                              <span className="text-[10px] font-mono text-[#7D8590]">{ag.pod}</span>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3FB950]/20 text-[#3FB950]">
                            {ag.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#FF8C42] font-semibold">{ag.role}</p>
                        <p className="text-[11px] text-[#7D8590] leading-relaxed">
                          {ag.currentTask}
                        </p>
                        <div className="bg-[#0D1117] p-2.5 rounded border border-[#21262D] space-y-1 text-[10px]">
                          <p className="font-bold text-white">Thought Chain:</p>
                          <p className="text-[#7D8590] italic">{ag.thoughts}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 5: 💬 DISCUSSIONS                                               */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'discussions' && (
                <div className="space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {['all', 'Announcements', 'Ideas', 'Q&A'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setDiscussionCategory(cat)}
                          className={`px-3 py-1 rounded-md border text-xs font-semibold ${
                            discussionCategory === cat
                              ? 'bg-[#21262D] border-[#FF8C42] text-white'
                              : 'bg-[#161B22] border-[#30363D] text-[#7D8590]'
                          }`}
                        >
                          {cat === 'all' ? 'All Categories' : cat}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => showToast('New discussion dialog')}
                      className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold transition-colors"
                    >
                      New discussion
                    </button>
                  </div>

                  <div className="border border-[#30363D] rounded-md bg-[#0D1117] divide-y divide-[#21262D]">
                    {discussions.map((d) => (
                      <div
                        key={d.id}
                        className="p-4 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#1F242C] text-[#58A6FF]">
                              {d.category}
                            </span>
                            <h4 className="font-bold text-white hover:text-[#58A6FF] cursor-pointer">
                              {d.title}
                            </h4>
                          </div>
                          <p className="text-[11px] text-[#7D8590] line-clamp-1">{d.body}</p>
                          <p className="text-[10px] text-[#7D8590]">
                            Started {d.createdAt} by {d.author}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUpvoteDiscussion(d.id)}
                          className="flex flex-col items-center px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:border-[#58A6FF] transition-colors"
                        >
                          <span className="text-[10px]">▲</span>
                          <span className="font-bold text-xs">{d.upvotes}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 6: ▶ ACTIONS                                                   */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'actions' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
                  <div className="space-y-1">
                    <h4 className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px] px-2 mb-2">
                      Workflows
                    </h4>
                    {[
                      'All workflows',
                      'CI',
                      'Deploy staging (OIDC)',
                      'CodeQL Advanced',
                      'Action pin policy',
                    ].map((wf, idx) => (
                      <button
                        key={wf}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 rounded-md font-semibold ${
                          idx === 0
                            ? 'bg-[#21262D] text-white font-bold'
                            : 'text-[#7D8590] hover:bg-[#161B22]'
                        }`}
                      >
                        {wf}
                      </button>
                    ))}
                  </div>

                  <div className="md:col-span-3 space-y-3">
                    <div className="flex items-center justify-between bg-[#161B22] p-2.5 px-3 rounded-md border border-[#30363D]">
                      <span className="font-semibold text-[#E6EDF3] text-xs">
                        All workflow runs
                      </span>
                      <button
                        type="button"
                        onClick={handleTriggerWorkflow}
                        className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5"
                      >
                        <span>▶</span> Run workflow
                      </button>
                    </div>
                    <div className="border border-[#30363D] rounded-md bg-[#0D1117] divide-y divide-[#21262D]">
                      {actions.map((act) => (
                        <div
                          key={act.id}
                          className="p-3.5 hover:bg-[#161B22] transition-colors cursor-pointer flex items-center justify-between gap-4"
                          onClick={() => {
                            setSelectedActionRun(act);
                            setModalState('action-detail');
                          }}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-bold text-white">
                              <span className="text-[#3FB950]">✓</span>
                              <span>{act.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-[#7D8590]">
                              <span className="font-semibold text-[#E6EDF3]">{act.workflow}</span>
                              <span>{act.branch}</span>
                              <span className="font-mono text-[#58A6FF]">{act.commitSha}</span>
                              <span>{act.timeAgo}</span>
                            </div>
                          </div>
                          <div className="text-right text-[#7D8590] font-mono text-[11px] shrink-0">
                            {act.duration}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 7: 📊 PROJECTS (KANBAN BOARD)                                  */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'projects' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {(['todo', 'in_progress', 'done'] as const).map((col) => {
                    const colCards = projects.filter((c) => c.column === col);
                    const title =
                      col === 'todo' ? 'To do' : col === 'in_progress' ? 'In progress' : 'Done';
                    return (
                      <div
                        key={col}
                        className="bg-[#161B22] border border-[#30363D] rounded-md p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between font-bold text-white border-b border-[#21262D] pb-2">
                          <span>{title}</span>
                          <span className="px-2 py-0.2 rounded-full bg-[#21262D] text-[#7D8590] text-[10px]">
                            {colCards.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {colCards.map((card) => (
                            <div
                              key={card.id}
                              className="p-3 rounded bg-[#0D1117] border border-[#30363D] space-y-2 shadow-sm"
                            >
                              <span className="px-1.5 py-0.2 rounded bg-[#1F242C] text-[#58A6FF] text-[10px] font-bold">
                                {card.tag}
                              </span>
                              <h5 className="font-bold text-white">{card.title}</h5>
                              <div className="flex items-center justify-between text-[10px] text-[#7D8590] pt-1">
                                <span>👤 {card.assignee}</span>
                                {col !== 'done' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleMoveKanban(
                                        card.id,
                                        col === 'todo' ? 'in_progress' : 'done',
                                      )
                                    }
                                    className="text-[#FF8C42] hover:underline font-bold"
                                  >
                                    Move →
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 8: 🛡️ SECURITY                                                  */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'security' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-md bg-[#161B22] border border-[#30363D] flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-sm">Security Overview</h3>
                      <p className="text-[#7D8590] mt-0.5">
                        Dependabot alerts, CodeQL static analysis & secret scanning.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-[#E3B341]/20 text-[#E3B341] font-bold">
                      4 Open Alerts
                    </span>
                  </div>

                  <div className="border border-[#30363D] rounded-md bg-[#0D1117] divide-y divide-[#21262D]">
                    {securityAlerts.map((sec) => (
                      <div
                        key={sec.id}
                        className="p-4 hover:bg-[#161B22] transition-colors flex items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-bold text-white">
                            <span
                              className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                                sec.severity === 'moderate'
                                  ? 'bg-[#D29922]/20 text-[#D29922]'
                                  : 'bg-[#7D8590]/20 text-[#7D8590]'
                              }`}
                            >
                              {sec.severity}
                            </span>
                            <span>{sec.package}</span>
                            <span className="font-mono text-[#58A6FF]">{sec.cve}</span>
                          </div>
                          <p className="text-[11px] text-[#7D8590]">{sec.title}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => showToast(`Remediation dispatched for ${sec.cve}`)}
                          className="px-3 py-1 rounded bg-[#21262D] border border-[#30363D] text-[#58A6FF] font-semibold hover:bg-[#30363D]"
                        >
                          Create fix PR
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 9: 📈 INSIGHTS                                                  */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'insights' && (
                <div className="space-y-6 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded bg-[#161B22] border border-[#30363D]">
                      <h4 className="font-bold text-white text-sm">48 Commits</h4>
                      <p className="text-[#7D8590] text-[11px]">Pushed to main in the last week</p>
                    </div>
                    <div className="p-4 rounded bg-[#161B22] border border-[#30363D]">
                      <h4 className="font-bold text-white text-sm">2 Pull Requests</h4>
                      <p className="text-[#7D8590] text-[11px]">Merged without regression</p>
                    </div>
                    <div className="p-4 rounded bg-[#161B22] border border-[#30363D]">
                      <h4 className="font-bold text-white text-sm">100% CI Health</h4>
                      <p className="text-[#7D8590] text-[11px]">
                        11 GitHub Actions workflows green
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded bg-[#161B22] border border-[#30363D] space-y-3">
                    <h4 className="font-bold text-white">Commit Frequency & Activity</h4>
                    <div className="h-32 flex items-end gap-2 border-b border-[#30363D] pb-2">
                      {[12, 18, 24, 45, 60, 32, 48].map((val, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t bg-[#3FB950] hover:bg-[#2EA043] transition-all"
                            style={{ height: `${val * 1.8}px` }}
                          />
                          <span className="text-[10px] text-[#7D8590]">Day {idx + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* TAB 10: ⚙️ SETTINGS                                                 */}
              {/* ------------------------------------------------------------------- */}
              {activeGitHubTab === 'settings' && (
                <div className="max-w-2xl space-y-6 text-xs">
                  <div className="p-4 rounded bg-[#161B22] border border-[#30363D] space-y-4">
                    <h4 className="font-bold text-white text-sm">General Repository Settings</h4>
                    <div className="space-y-1.5">
                      <label className="text-[#7D8590] font-semibold">Repository name</label>
                      <input
                        type="text"
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[#7D8590] font-semibold">Description</label>
                      <textarea
                        value={settingsDesc}
                        onChange={(e) => setSettingsDesc(e.target.value)}
                        rows={2}
                        className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
                        placeholder="Short description of this repository..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[#7D8590] font-semibold">Default branch</label>
                      <input
                        type="text"
                        value={settingsBranch}
                        onChange={(e) => setSettingsBranch(e.target.value)}
                        className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[#7D8590] font-semibold">Visibility</label>
                      <select
                        value={settingsVisibility}
                        onChange={(e) =>
                          setSettingsVisibility(e.target.value as 'public' | 'private')
                        }
                        className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
                      >
                        <option value="public">
                          Public (Anyone on the internet can see this repository)
                        </option>
                        <option value="private">
                          Private (You choose who can see and commit to this repository)
                        </option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={isSavingSettings}
                      onClick={handleSaveSettings}
                      className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] font-bold text-white transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isSavingSettings ? 'Saving changes...' : 'Save changes'}
                    </button>
                  </div>

                  <div className="p-4 rounded bg-[#161B22] border border-[#DA3633] space-y-3">
                    <h4 className="font-bold text-[#F85149] text-sm">Danger Zone</h4>
                    <p className="text-[#7D8590]">
                      Once deleted, this repository will be archived with a tombstone timestamp.
                    </p>
                    <button
                      type="button"
                      onClick={handleDeleteRepo}
                      className="px-3.5 py-1.5 rounded border border-[#DA3633] text-[#F85149] font-bold hover:bg-[#DA3633] hover:text-white transition-colors"
                    >
                      Delete this repository
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* VIEW C: QUANTY AI AUTONOMOUS COPILOT STUDIO                             */}
        {/* ======================================================================= */}
        {activeDeckTab === 'quanty' && (
          <div className="flex-1 w-full min-h-0 flex flex-col max-w-4xl mx-auto px-4 pt-2 pb-[72px] justify-between overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* Welcome Screen (when no messages) */}
              {chatMessages.length === 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-10 flex flex-col items-center justify-center text-center space-y-5">
                  <BubbleAvatar state="coding" size={72} />
                  <div className="space-y-1 max-w-lg">
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      How can I help you build, analyze, or automate today?
                    </h2>
                    <p className="text-xs text-[#7D8590] leading-relaxed">
                      Autonomous Swarm intelligence powered by Claude Opus 5 & GPT-6 Astra. Fully
                      wired into monorepo ASTs, Git smart HTTP, and verified test pipelines.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl w-full text-left pt-2">
                    {[
                      {
                        icon: '⚡',
                        title: 'Code & Architecture',
                        prompt: 'Audit monorepo for performance and zero-mock parity',
                      },
                      {
                        icon: '🐛',
                        title: 'Deep Debugging',
                        prompt: 'Trace unhandled rejections and memory leaks in Fastify routes',
                      },
                      {
                        icon: '🚀',
                        title: 'CI/CD & Deploy',
                        prompt: 'Inspect GitHub Actions pipeline status and EKS cluster health',
                      },
                      {
                        icon: '🛡️',
                        title: 'Security Audit',
                        prompt:
                          'Scan for Dependabot alerts, token leakages, and timing vulnerabilities',
                      },
                    ].map((card) => (
                      <button
                        key={card.title}
                        type="button"
                        onClick={() => {
                          setPromptInput(card.prompt);
                        }}
                        className="p-3 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF] hover:bg-[#1C2128] transition-all group"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#E6EDF3] group-hover:text-[#58A6FF]">
                          <span>{card.icon}</span>
                          <span>{card.title}</span>
                        </div>
                        <p className="text-[11px] text-[#7D8590] mt-1 line-clamp-2">
                          {card.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Chat Stream (when messages exist) */
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pr-1 pb-4">
                  {chatMessages.map((msg) => (
                    <div key={msg.id}>
                      {msg.role === 'user' ? (
                        <div className="flex justify-end">
                          <div className="max-w-xl bg-[#1F242C] border border-[#30363D] text-white p-3.5 rounded-2xl text-xs space-y-1.5 shadow-md">
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                            <div className="flex items-center justify-between text-[10px] text-[#7D8590] pt-1">
                              <span>{msg.timestamp}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(msg.text);
                                  showToast('Copied user message');
                                }}
                                className="hover:text-white"
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-2xl bg-[#161B22] border border-[#30363D] p-4 rounded-2xl text-xs space-y-3 shadow-md">
                          {/* Bot Message Header */}
                          <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
                            <div className="flex items-center gap-2">
                              <BubbleAvatar state="coding" size={28} />
                              <span className="font-bold text-white">Quanty AI</span>
                              <span className="px-1.5 py-0.2 rounded bg-[#FF8C42]/20 text-[#FF8C42] text-[10px] font-mono font-bold">
                                {msg.model || 'Opus 5'}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#7D8590]">{msg.timestamp}</span>
                          </div>

                          {/* Notion AI Style Thought Accordion */}
                          {msg.thoughts && (
                            <div className="rounded-lg border border-[#21262D] bg-[#0B0C0E] overflow-hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedThoughts((prev) => ({
                                    ...prev,
                                    [msg.id]: !prev[msg.id],
                                  }))
                                }
                                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[#7D8590] hover:text-white transition-colors bg-[#111418]"
                              >
                                <span className="flex items-center gap-1.5 font-mono">
                                  <span>{expandedThoughts[msg.id] ? '▼' : '▶'}</span>
                                  <span className="font-semibold text-[#E6EDF3]">Thought</span>
                                  <span className="text-[10px] text-[#7D8590]">
                                    · Thought for {msg.thoughtDuration || '2.8s'}
                                  </span>
                                </span>
                                <span className="text-[10px] text-[#58A6FF]">
                                  {expandedThoughts[msg.id] ? 'Collapse' : 'Expand'}
                                </span>
                              </button>
                              {expandedThoughts[msg.id] && (
                                <div className="p-3 text-[11px] font-mono text-[#8B949E] space-y-2 leading-relaxed border-t border-[#21262D]">
                                  <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[#7D8590]">
                                    {msg.thoughts}
                                  </pre>
                                  {msg.steps && (
                                    <div className="pt-1.5 border-t border-[#1C2128] space-y-1">
                                      {msg.steps.map((st, i) => (
                                        <div
                                          key={i}
                                          className="flex items-center gap-1.5 text-[11px] text-[#3FB950]"
                                        >
                                          <span>✓</span>
                                          <span>{st}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Response Text */}
                          <div className="space-y-2 leading-relaxed text-[#E6EDF3] whitespace-pre-wrap">
                            {msg.text}
                          </div>

                          {/* Autonomous Tool Call Executions */}
                          {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-[#21262D]">
                              <div className="text-[10px] font-mono uppercase tracking-wider text-[#7D8590] flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-[#58A6FF] animate-pulse" />
                                <span>
                                  Autonomous Swarm Execution ({msg.toolExecutions.length})
                                </span>
                              </div>
                              <div className="grid gap-2">
                                {msg.toolExecutions.map((exec, idx) => (
                                  <div
                                    key={exec.callId || idx}
                                    className={`p-3 rounded-xl border text-xs font-mono transition-all ${
                                      exec.status === 'succeeded'
                                        ? 'bg-[#0D1117] border-[#238636]/40 text-[#E6EDF3]'
                                        : 'bg-[#0D1117] border-[#DA3633]/40 text-[#F85149]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            exec.status === 'succeeded'
                                              ? 'bg-[#238636]/20 text-[#3FB950]'
                                              : 'bg-[#DA3633]/20 text-[#F85149]'
                                          }`}
                                        >
                                          {exec.status === 'succeeded' ? '✓ EXECUTED' : '✕ FAILED'}
                                        </span>
                                        <span className="font-semibold text-white">
                                          {exec.toolName === 'create_repository' &&
                                            `📦 Repository: ${exec.result?.name || exec.input?.name}`}
                                          {exec.toolName === 'commit_file' &&
                                            `⚡ Commit: ${exec.input?.path || exec.result?.path}`}
                                          {exec.toolName === 'read_file_blob' &&
                                            `📄 Read: ${exec.input?.path}`}
                                          {exec.toolName === 'deploy_agent' &&
                                            `🤖 Swarm Agent: ${exec.result?.name || exec.input?.name}`}
                                          {![
                                            'create_repository',
                                            'commit_file',
                                            'read_file_blob',
                                            'deploy_agent',
                                          ].includes(exec.toolName) && exec.toolName}
                                        </span>
                                      </div>
                                      {exec.durationMs && (
                                        <span className="text-[10px] text-[#7D8590]">
                                          {exec.durationMs}ms
                                        </span>
                                      )}
                                    </div>

                                    {/* Details & Quick Action Buttons */}
                                    <div className="mt-2 pt-2 border-t border-[#21262D]/60 text-[11px] text-[#8B949E] flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        {exec.toolName === 'create_repository' && (
                                          <span>
                                            Branch:{' '}
                                            <code className="text-[#58A6FF]">
                                              {exec.result?.defaultBranch || 'main'}
                                            </code>{' '}
                                            · Visibility:{' '}
                                            <code className="text-[#58A6FF]">
                                              {exec.result?.visibility || 'public'}
                                            </code>
                                          </span>
                                        )}
                                        {exec.toolName === 'commit_file' && (
                                          <span>
                                            SHA:{' '}
                                            <code className="text-[#3FB950]">
                                              {String(exec.result?.commitSha || '').slice(0, 8)}
                                            </code>{' '}
                                            · Branch:{' '}
                                            <code className="text-[#58A6FF]">
                                              {exec.result?.branch || 'main'}
                                            </code>
                                          </span>
                                        )}
                                        {exec.toolName === 'deploy_agent' && (
                                          <span>
                                            Role:{' '}
                                            <code className="text-[#FF8C42]">
                                              {exec.result?.role || exec.input?.role}
                                            </code>{' '}
                                            · Desk:{' '}
                                            <code className="text-[#58A6FF]">
                                              #{exec.result?.deskNumber || exec.input?.deskNumber}
                                            </code>
                                          </span>
                                        )}
                                        {exec.toolName === 'read_file_blob' && (
                                          <span>
                                            Bytes:{' '}
                                            <code className="text-[#58A6FF]">
                                              {exec.result?.size ?? 'N/A'}
                                            </code>{' '}
                                            · SHA:{' '}
                                            <code className="text-[#58A6FF]">
                                              {String(exec.result?.blobSha || '').slice(0, 8)}
                                            </code>
                                          </span>
                                        )}
                                        {exec.error && (
                                          <span className="text-[#F85149]">{exec.error}</span>
                                        )}
                                      </div>

                                      {exec.status === 'succeeded' && (
                                        <div className="flex items-center gap-2">
                                          {exec.toolName === 'create_repository' && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const targetName =
                                                  exec.result?.name || exec.input?.name;
                                                const found = baseRepos.find(
                                                  (r) => r.name === targetName,
                                                );
                                                if (found) {
                                                  openRepository(found);
                                                } else {
                                                  void fetchRepos();
                                                  showToast(`Switching to ${targetName}`);
                                                }
                                              }}
                                              className="px-2 py-0.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] text-[10px] font-medium transition-colors"
                                            >
                                              Open Repo →
                                            </button>
                                          )}
                                          {exec.toolName === 'deploy_agent' && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveDeckTab('lab');
                                                showToast('Navigated to Agent Lab floor');
                                              }}
                                              className="px-2 py-0.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#FF8C42] text-[10px] font-medium transition-colors"
                                            >
                                              View in Agent Lab →
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Suggestions */}
                          {msg.suggestions && (
                            <div className="flex flex-wrap gap-2 pt-1 border-t border-[#21262D]/60">
                              {msg.suggestions.map((sug) => (
                                <button
                                  key={sug}
                                  type="button"
                                  onClick={() => {
                                    setPromptInput(sug.replace(' →', ''));
                                  }}
                                  className="px-2.5 py-1 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] text-[11px] font-semibold transition-colors"
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Message Bottom Action Bar */}
                          <div className="flex items-center gap-3 pt-2 text-[11px] text-[#7D8590] border-t border-[#21262D]">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(msg.text);
                                showToast('Copied response to clipboard');
                              }}
                              className="hover:text-white transition-colors flex items-center gap-1"
                            >
                              📋 Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => showToast('Saved to private pages')}
                              className="hover:text-white transition-colors flex items-center gap-1"
                            >
                              + Save to Docs
                            </button>
                            <button
                              type="button"
                              onClick={() => showToast('Feedback recorded: Helpful')}
                              className="hover:text-white transition-colors"
                            >
                              👍
                            </button>
                            <button
                              type="button"
                              onClick={() => showToast('Feedback recorded: Needs improvement')}
                              className="hover:text-white transition-colors"
                            >
                              👎
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isChatSubmitting && (
                    <div className="rounded-xl border border-[#30363D] bg-[#161B22] p-4 text-xs text-[#7D8590] animate-pulse">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#FF8C42] animate-ping" />
                        <span className="font-semibold text-white">
                          Quanty Copilot is generating a verified response...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notion AI Bottom Floating Composer */}
            <div className="shrink-0 pt-2 pb-2 bg-[#0D1117] z-20">
              {chatError && (
                <div className="mb-2 rounded-lg border border-[#F85149]/40 bg-[#DA3633]/15 px-3 py-2 text-xs text-[#F85149]">
                  {chatError}
                </div>
              )}
              <div className="relative">
                {/* Popup Menu for Give Context (+) */}
                {isContextOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 p-2 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl z-30 text-xs animate-in fade-in slide-in-from-bottom-2">
                    {activeContextSubmenu === 'none' ? (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setActiveContextSubmenu('repos-files')}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">📁</span>
                            <div>
                              <div className="font-semibold text-white">Attach Repos & Files</div>
                              <div className="text-[10px] text-[#7D8590]">
                                Attach workspace repos, source files, or docs
                              </div>
                            </div>
                          </div>
                          <span className="text-[#7D8590] text-sm">›</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveContextSubmenu('mention')}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base font-mono font-bold text-[#58A6FF]">@</span>
                            <div>
                              <div className="font-semibold text-white">Mention repo or file</div>
                              <div className="text-[10px] text-[#7D8590]">
                                Insert @reference into prompt input
                              </div>
                            </div>
                          </div>
                          <span className="text-[#7D8590] text-sm">›</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveContextSubmenu('skills')}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base text-[#FF8C42]">⚡</span>
                            <div>
                              <div className="font-semibold text-white">Skills & Tools</div>
                              <div className="text-[10px] text-[#7D8590]">
                                Autonomous coding, QA & memory skills
                              </div>
                            </div>
                          </div>
                          <span className="text-[#7D8590] text-sm">›</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPromptInput(
                              'Create an interactive architecture diagram of Quant Ecosystem swarm',
                            );
                            setIsContextOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <span className="text-base">🖌️</span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white">
                                Create image or diagram
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#58A6FF]/20 text-[#58A6FF]">
                                New
                              </span>
                            </div>
                            <div className="text-[10px] text-[#7D8590]">
                              Render system flowcharts & UI mockups
                            </div>
                          </div>
                        </button>
                      </div>
                    ) : activeContextSubmenu === 'repos-files' ? (
                      /* Repos & Files Submenu */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                          <button
                            type="button"
                            onClick={() => setActiveContextSubmenu('none')}
                            className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                          >
                            <span>‹</span> Back
                          </button>
                          <span className="font-bold text-white text-xs">Attach Repos & Files</span>
                        </div>
                        <input
                          type="text"
                          value={repoFileSearch}
                          onChange={(e) => setRepoFileSearch(e.target.value)}
                          placeholder="Search repo or file…"
                          className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                        />
                        <div className="divide-y divide-[#21262D] max-h-52 overflow-y-auto space-y-1 pt-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-[#7D8590] pt-1">
                            Repositories
                          </div>
                          {[
                            { name: 'Quant-Ecosystem', desc: 'Root Monorepo · TypeScript' },
                            { name: 'quantmail-core', desc: 'Mail, Drive & Calendar · Fastify' },
                            { name: 'quantchat-meet', desc: 'LiveKit SFU & WebRTC Gateway' },
                            { name: 'quant-mobile-android', desc: 'Android APK · Jetpack Compose' },
                          ]
                            .filter((r) =>
                              r.name.toLowerCase().includes(repoFileSearch.toLowerCase()),
                            )
                            .map((r) => (
                              <button
                                key={r.name}
                                type="button"
                                onClick={() => {
                                  if (!attachedFiles.includes(r.name)) {
                                    setAttachedFiles((prev) => [...prev, r.name]);
                                    showToast(`Attached: ${r.name}`);
                                  } else {
                                    showToast('Already attached');
                                  }
                                  setIsContextOpen(false);
                                  setActiveContextSubmenu('none');
                                }}
                                className="w-full py-1.5 px-2 flex items-center justify-between text-left hover:bg-[#21262D] rounded transition-colors"
                              >
                                <div>
                                  <div className="font-medium text-white text-xs flex items-center gap-1.5">
                                    <span>📁</span>
                                    <span>{r.name}</span>
                                  </div>
                                  <div className="text-[10px] text-[#7D8590]">{r.desc}</div>
                                </div>
                                <span className="text-[#58A6FF] text-xs font-semibold">
                                  + Attach
                                </span>
                              </button>
                            ))}
                          <div className="text-[10px] font-bold uppercase tracking-wider text-[#7D8590] pt-2">
                            Architecture Files
                          </div>
                          {[
                            { name: 'AGENT_MEMORY.md', desc: 'Swarm Memory & Architecture Ledger' },
                            { name: 'TASK_PLANNER.md', desc: 'Sprint Tasks & Roadmap Tracker' },
                            {
                              name: 'apps/quantmail/src/app/quantgit/page.tsx',
                              desc: 'QuantGit Sovereign UI',
                            },
                            {
                              name: 'packages/shared-ui/src/components/QuantSidekick/BubbleAvatar.tsx',
                              desc: 'Living Aurora Mascot',
                            },
                            { name: 'server/src/routes/git.ts', desc: 'Git Smart HTTP Daemon' },
                          ]
                            .filter((f) =>
                              f.name.toLowerCase().includes(repoFileSearch.toLowerCase()),
                            )
                            .map((f) => (
                              <button
                                key={f.name}
                                type="button"
                                onClick={() => {
                                  if (!attachedFiles.includes(f.name)) {
                                    setAttachedFiles((prev) => [...prev, f.name]);
                                    showToast(`Attached: ${f.name}`);
                                  } else {
                                    showToast('Already attached');
                                  }
                                  setIsContextOpen(false);
                                  setActiveContextSubmenu('none');
                                }}
                                className="w-full py-1.5 px-2 flex items-center justify-between text-left hover:bg-[#21262D] rounded transition-colors"
                              >
                                <div>
                                  <div className="font-mono text-white text-[11px] flex items-center gap-1.5 truncate max-w-[180px]">
                                    <span>📄</span>
                                    <span className="truncate">{f.name}</span>
                                  </div>
                                  <div className="text-[10px] text-[#7D8590]">{f.desc}</div>
                                </div>
                                <span className="text-[#58A6FF] text-xs font-semibold shrink-0">
                                  + Attach
                                </span>
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : activeContextSubmenu === 'mention' ? (
                      /* Mention Submenu */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                          <button
                            type="button"
                            onClick={() => setActiveContextSubmenu('none')}
                            className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                          >
                            <span>‹</span> Back
                          </button>
                          <span className="font-bold text-white text-xs">
                            @ Mention Repo or File
                          </span>
                        </div>
                        <input
                          type="text"
                          value={mentionSearch}
                          onChange={(e) => setMentionSearch(e.target.value)}
                          placeholder="Search mention…"
                          className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                        />
                        <div className="divide-y divide-[#21262D] max-h-52 overflow-y-auto pt-1">
                          {[
                            { token: '@Quant-Ecosystem', desc: 'Root repository' },
                            { token: '@quantmail-core', desc: 'Mail, drive & calendar engine' },
                            { token: '@quantchat-meet', desc: 'LiveKit WebRTC meet gateway' },
                            { token: '@quant-mobile-android', desc: 'Native Android project' },
                            { token: '@AGENT_MEMORY.md', desc: 'Ecosystem memory ledger' },
                            { token: '@TASK_PLANNER.md', desc: 'Sprint tasks planner' },
                            { token: '@BubbleAvatar.tsx', desc: 'Living aurora mascot' },
                            { token: '@git.ts', desc: 'Git wire protocol server' },
                          ]
                            .filter((m) =>
                              m.token.toLowerCase().includes(mentionSearch.toLowerCase()),
                            )
                            .map((m) => (
                              <button
                                key={m.token}
                                type="button"
                                onClick={() => {
                                  setPromptInput(
                                    (prev) => (prev ? prev + ' ' : '') + m.token + ' ',
                                  );
                                  showToast(`Mentioned ${m.token}`);
                                  setIsContextOpen(false);
                                  setActiveContextSubmenu('none');
                                }}
                                className="w-full py-1.5 px-2 flex items-center justify-between text-left hover:bg-[#21262D] rounded transition-colors"
                              >
                                <div>
                                  <div className="font-mono text-[#58A6FF] text-xs font-semibold">
                                    {m.token}
                                  </div>
                                  <div className="text-[10px] text-[#7D8590]">{m.desc}</div>
                                </div>
                                <span className="text-[#7D8590] text-xs">↵</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : (
                      /* Skills Submenu */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                          <button
                            type="button"
                            onClick={() => setActiveContextSubmenu('none')}
                            className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                          >
                            <span>‹</span> Back
                          </button>
                          <span className="font-bold text-white text-xs">Skills & Tools</span>
                        </div>
                        <input
                          type="text"
                          value={skillsSearch}
                          onChange={(e) => setSkillsSearch(e.target.value)}
                          placeholder="Search skills…"
                          className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                        />
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <button
                            type="button"
                            onClick={() => showToast('Opened Skills Library')}
                            className="text-[#58A6FF] hover:underline font-semibold"
                          >
                            See all skills in Library
                          </button>
                          <button
                            type="button"
                            onClick={() => showToast('Add custom skill modal')}
                            className="text-[#3FB950] hover:underline font-semibold"
                          >
                            + Add skill
                          </button>
                        </div>
                        <div className="divide-y divide-[#21262D] max-h-52 overflow-y-auto pt-1">
                          {[
                            {
                              name: 'Git Smart HTTP Engine',
                              cat: 'GIT',
                              catColor: 'bg-[#FF8C42]/20 text-[#FF8C42]',
                              desc: 'Wire protocol & push/clone validation',
                            },
                            {
                              name: 'Monorepo AST Parser',
                              cat: 'CODE',
                              catColor: 'bg-[#58A6FF]/20 text-[#58A6FF]',
                              desc: 'Deep TypeScript symbol & import inspection',
                            },
                            {
                              name: 'Vitest QA Sentinel',
                              cat: 'QA',
                              catColor: 'bg-[#3FB950]/20 text-[#3FB950]',
                              desc: 'Automated regression test runs & zero-mock gates',
                            },
                            {
                              name: 'LiveKit WebRTC Gateway',
                              cat: 'VOICE',
                              catColor: 'bg-[#A371F7]/20 text-[#A371F7]',
                              desc: 'Realtime audio/video streaming & room controls',
                            },
                            {
                              name: 'Redis 3-Layer Memory',
                              cat: 'MEMORY',
                              catColor: 'bg-[#F0883E]/20 text-[#F0883E]',
                              desc: 'Hierarchical cache, Prisma & vector persistence',
                            },
                            {
                              name: 'Prisma Schema Auditor',
                              cat: 'DB',
                              catColor: 'bg-[#79C0FF]/20 text-[#79C0FF]',
                              desc: 'Schema migrations, quota sum & index verification',
                            },
                          ]
                            .filter((s) =>
                              s.name.toLowerCase().includes(skillsSearch.toLowerCase()),
                            )
                            .map((sk) => {
                              const isEnabled = activeSkills[sk.name] ?? false;
                              return (
                                <div
                                  key={sk.name}
                                  className="py-2 px-1 flex items-center justify-between text-xs hover:bg-[#21262D]/50 rounded"
                                >
                                  <div className="pr-2 min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${sk.catColor}`}
                                      >
                                        {sk.cat}
                                      </span>
                                      <span className="font-medium text-white truncate">
                                        {sk.name}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-[#7D8590] leading-snug mt-0.5">
                                      {sk.desc}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = !isEnabled;
                                      setActiveSkills((prev) => ({
                                        ...prev,
                                        [sk.name]: next,
                                      }));
                                      showToast(`${sk.name} ${next ? 'Enabled' : 'Disabled'}`);
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 transition-colors ${
                                      isEnabled
                                        ? 'bg-[#238636] text-white hover:bg-[#2ea043]'
                                        : 'bg-[#21262D] text-[#7D8590] hover:text-white'
                                    }`}
                                  >
                                    {isEnabled ? 'ON' : 'OFF'}
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Popup Menu for Settings (⊶) */}
                {isSettingsOpen && (
                  <div className="absolute bottom-full left-10 mb-2 w-80 p-2.5 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl z-30 text-xs animate-in fade-in slide-in-from-bottom-2">
                    {activeSettingsSubmenu === 'none' ? (
                      <div className="space-y-1">
                        {/* Computer */}
                        <button
                          type="button"
                          onClick={() => setActiveSettingsSubmenu('computer')}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span>💻</span>
                            <span className="font-semibold text-white">Computer</span>
                          </div>
                          <span className="text-[#7D8590]">›</span>
                        </button>

                        {/* My sources */}
                        <button
                          type="button"
                          onClick={() => setActiveSettingsSubmenu('sources')}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span>📚</span>
                            <span className="font-semibold text-white">My sources</span>
                            <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[10px] text-[#58A6FF] font-bold">
                              3
                            </span>
                          </div>
                          <span className="text-[#7D8590]">›</span>
                        </button>

                        {/* MCP servers */}
                        <button
                          type="button"
                          onClick={() => setActiveSettingsSubmenu('mcp')}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span>🔌</span>
                            <span className="font-semibold text-white">MCP servers</span>
                            <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[10px] text-[#3FB950] font-bold">
                              {mcpServers.length}
                            </span>
                          </div>
                          <span className="text-[#7D8590]">›</span>
                        </button>

                        {/* Mode */}
                        <button
                          type="button"
                          onClick={() => setActiveSettingsSubmenu('mode')}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span>⚡</span>
                            <span className="font-semibold text-white">Mode</span>
                            <span className="text-[10px] text-[#7D8590] capitalize">
                              ({notionMode})
                            </span>
                          </div>
                          <span className="text-[#7D8590]">›</span>
                        </button>

                        {/* Personalize */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsPersonalizeOpen(true);
                            setIsSettingsOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span>🎨</span>
                            <span className="font-semibold text-white">Personalize</span>
                          </div>
                          <span className="text-[#7D8590]">›</span>
                        </button>

                        <div className="pt-2 border-t border-[#21262D]">
                          <span className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                            Model Selector
                          </span>
                          <div className="grid grid-cols-1 gap-1 mt-1">
                            {[
                              {
                                id: 'opus-5',
                                name: 'Claude Opus 5 / GPT-6 Astra',
                                desc: 'Deep architecture, reasoning & swarm leader',
                              },
                              {
                                id: 'sonnet-35',
                                name: 'Claude 3.5 Sonnet',
                                desc: 'High-speed code synthesis & diff generation',
                              },
                              {
                                id: 'quant-slm',
                                name: 'Quant AI Fast SLM',
                                desc: 'Instant local triage & AST queries',
                              },
                            ].map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setActiveModel(m.id as any);
                                  showToast(`Selected: ${m.name}`);
                                }}
                                className={`p-2 rounded-lg text-left transition-colors border ${
                                  activeModel === m.id
                                    ? 'border-[#FF8C42] bg-[#FF8C42]/10 text-white'
                                    : 'border-transparent hover:bg-[#21262D] text-[#7D8590]'
                                }`}
                              >
                                <div className="font-bold text-xs text-white">{m.name}</div>
                                <div className="text-[10px] text-[#7D8590]">{m.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#21262D]">
                          <span className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                            Reasoning Effort
                          </span>
                          <div className="flex items-center gap-1 mt-1">
                            {(['fast', 'deep'] as const).map((eff) => (
                              <button
                                key={eff}
                                type="button"
                                onClick={() => setEffort(eff)}
                                className={`flex-1 py-1 rounded text-[11px] font-bold capitalize transition-colors ${
                                  effort === eff
                                    ? 'bg-[#58A6FF] text-black'
                                    : 'bg-[#21262D] text-[#7D8590] hover:text-white'
                                }`}
                              >
                                {eff} ({eff === 'deep' ? '32k' : '1k'})
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : activeSettingsSubmenu === 'computer' ? (
                      /* Computer Submenu */
                      <div className="space-y-3 p-1">
                        <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                          <button
                            type="button"
                            onClick={() => setActiveSettingsSubmenu('none')}
                            className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                          >
                            <span>‹</span> Back
                          </button>
                          <span className="font-bold text-white text-xs">Computer Settings</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-white text-xs">Enable Workers Beta</div>
                            <div className="text-[10px] text-[#7D8590] max-w-[210px] leading-relaxed mt-0.5">
                              Allows the computer to create, deploy, update, and delete Notion
                              Workers in this workspace.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEnableWorkersBeta(!enableWorkersBeta)}
                            className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                              enableWorkersBeta ? 'bg-[#238636]' : 'bg-[#30363D]'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                enableWorkersBeta ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    ) : activeSettingsSubmenu === 'sources' ? (
                      /* Sources Submenu */
                      <div className="space-y-2.5 p-1">
                        <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                          <button
                            type="button"
                            onClick={() => setActiveSettingsSubmenu('none')}
                            className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                          >
                            <span>‹</span> Back
                          </button>
                          <span className="font-bold text-white text-xs">Knowledge Sources</span>
                        </div>
                        <div className="space-y-2">
                          {[
                            { key: 'all', label: 'All sources I can access' },
                            {
                              key: 'dev6',
                              label: 'Developer 6 with gpt 5.6 sol , opus 5 and kimi k3',
                            },
                            { key: 'helpCenter', label: 'Quant Help Center' },
                            { key: 'webAccess', label: 'Web access' },
                          ].map((item) => (
                            <div key={item.key} className="flex items-center justify-between">
                              <span className="text-xs text-white truncate max-w-[210px]">
                                {item.label}
                              </span>
                              <input
                                type="checkbox"
                                checked={(sourcesState as any)[item.key]}
                                onChange={() =>
                                  setSourcesState((prev) => ({
                                    ...prev,
                                    [item.key]: !(prev as any)[item.key],
                                  }))
                                }
                                className="accent-[#58A6FF] w-4 h-4 cursor-pointer"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="pt-2 border-t border-[#21262D] flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => showToast('Source connector dialog')}
                            className="text-[#58A6FF] hover:underline text-[11px] font-semibold"
                          >
                            + Add sources
                          </button>
                          <span className="text-[9px] text-[#7D8590]">Sources scoped</span>
                        </div>
                        <p className="text-[10px] text-[#7D8590] leading-relaxed">
                          Quanty AI will only search information from the sources selected here.
                        </p>
                      </div>
                    ) : activeSettingsSubmenu === 'mcp' ? (
                      /* MCP Servers Submenu */
                      <div className="space-y-2.5 p-1">
                        <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                          <button
                            type="button"
                            onClick={() => setActiveSettingsSubmenu('none')}
                            className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                          >
                            <span>‹</span> Back
                          </button>
                          <span className="font-bold text-white text-xs">MCP Servers</span>
                        </div>
                        <div className="space-y-1.5">
                          {mcpServers.map((server) => (
                            <div
                              key={server}
                              className="p-2 rounded bg-[#0D1117] border border-[#30363D] flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#3FB950]" />
                                <span className="font-semibold text-white">{server}</span>
                              </div>
                              <span className="text-[10px] text-[#7D8590]">Connected</span>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMcpServers([...mcpServers, `Server-${mcpServers.length + 1}`]);
                            showToast('Added MCP Server connection');
                          }}
                          className="w-full py-1.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] font-semibold text-xs border border-[#30363D] transition-colors"
                        >
                          + Add MCP server
                        </button>
                      </div>
                    ) : (
                      /* Mode Submenu */
                      <div className="space-y-2.5 p-1">
                        <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                          <button
                            type="button"
                            onClick={() => setActiveSettingsSubmenu('none')}
                            className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                          >
                            <span>‹</span> Back
                          </button>
                          <span className="font-bold text-white text-xs">Operating Mode</span>
                        </div>
                        <div className="space-y-1.5">
                          {[
                            { id: 'default', title: 'Default', desc: 'Can search, edit, and more' },
                            { id: 'ask', title: 'Ask', desc: 'Answers only, won’t make edits' },
                          ].map((md) => (
                            <button
                              key={md.id}
                              type="button"
                              onClick={() => setNotionMode(md.id as any)}
                              className={`w-full p-2 rounded-lg text-left border transition-colors ${
                                notionMode === md.id
                                  ? 'bg-[#58A6FF]/10 border-[#58A6FF] text-white'
                                  : 'border-transparent hover:bg-[#21262D] text-[#7D8590]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white">{md.title}</span>
                                {notionMode === md.id && (
                                  <span className="text-[#58A6FF] font-bold">●</span>
                                )}
                              </div>
                              <div className="text-[10px] text-[#7D8590] mt-0.5">{md.desc}</div>
                            </button>
                          ))}
                        </div>
                        <div className="text-[10px] text-[#7D8590] pt-1 border-t border-[#21262D]">
                          Tip: Cycle through modes with shift+tab
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Input Textarea Container */}
                <div className="relative rounded-2xl bg-[#161B22] border border-[#30363D] p-3 shadow-2xl focus-within:border-[#58A6FF] transition-all">
                  {/* Attached Files Row */}
                  {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-2 border-b border-[#21262D]/60 mb-2">
                      {attachedFiles.map((f, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#21262D] border border-[#30363D] text-[11px] text-[#E6EDF3]"
                        >
                          <span>📎</span>
                          <span className="font-mono text-[10px]">{f}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachedFiles(attachedFiles.filter((_, i) => i !== idx))
                            }
                            className="text-[#7D8590] hover:text-[#F85149] font-bold"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <textarea
                    rows={2}
                    value={promptInput}
                    disabled={isChatSubmitting}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit();
                      }
                    }}
                    placeholder={
                      isChatSubmitting ? 'Quanty is thinking...' : 'Do anything with AI...'
                    }
                    className="w-full bg-transparent border-0 resize-none text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none leading-relaxed disabled:opacity-60"
                  />

                  {/* Bottom Action Bar inside Textarea container */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#21262D]/60 text-xs">
                    <div className="flex items-center gap-2">
                      {/* Give context (+) button */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsContextOpen(!isContextOpen);
                          setIsSettingsOpen(false);
                          setActiveContextSubmenu('none');
                        }}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isContextOpen
                            ? 'bg-[#30363D] border-[#58A6FF] text-white'
                            : 'bg-[#21262D] border-[#30363D] text-[#7D8590] hover:text-white hover:bg-[#30363D]'
                        }`}
                        title="Give context (Files, @ Mention, Skills)"
                      >
                        <span className="font-bold text-sm leading-none">+</span>
                      </button>

                      {/* Settings (⊶) button */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsSettingsOpen(!isSettingsOpen);
                          setIsContextOpen(false);
                          setActiveSettingsSubmenu('none');
                        }}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isSettingsOpen
                            ? 'bg-[#30363D] border-[#58A6FF] text-white'
                            : 'bg-[#21262D] border-[#30363D] text-[#7D8590] hover:text-white hover:bg-[#30363D]'
                        }`}
                        title="Model & Execution Settings"
                      >
                        <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                          <path d="M14 10.5a.75.75 0 0 1-.75.75H10v1.5a.75.75 0 0 1-1.5 0v-1.5H2.75a.75.75 0 0 1 0-1.5H8.5V8.25a.75.75 0 0 1 1.5 0V9.75h3.25a.75.75 0 0 1 .75.75ZM6 5.5a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1 0-1.5H5.25V3.25a.75.75 0 0 1 1.5 0v1.5h6.5a.75.75 0 0 1 0 1.5H6.75v1.5a.75.75 0 0 1-1.5 0v-1.5Z" />
                        </svg>
                      </button>

                      {/* Active model & mode pill */}
                      <span className="text-[10px] font-semibold text-[#7D8590] bg-[#21262D] px-2 py-0.5 rounded-md border border-[#30363D]">
                        {activeModel === 'opus-5'
                          ? 'Opus 5'
                          : activeModel === 'sonnet-35'
                            ? 'Sonnet 3.5'
                            : 'Quant SLM'}{' '}
                        · {notionMode === 'default' ? 'Default' : 'Ask'} ·{' '}
                        {effort === 'deep' ? '32k' : '1k'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Voice recording button */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsRecording(!isRecording);
                          showToast(
                            isRecording
                              ? 'Voice dictation stopped'
                              : 'Listening... speak your prompt',
                          );
                        }}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isRecording
                            ? 'bg-[#DA3633] border-[#F85149] text-white animate-pulse'
                            : 'bg-[#21262D] border-[#30363D] text-[#7D8590] hover:text-white hover:bg-[#30363D]'
                        }`}
                        title="Start voice recording"
                      >
                        🎙️
                      </button>

                      {/* Submit button */}
                      <button
                        type="button"
                        disabled={!promptInput.trim() || isChatSubmitting}
                        onClick={() => handleChatSubmit()}
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition-all ${
                          promptInput.trim() && !isChatSubmitting
                            ? 'bg-[#FF8C42] text-black shadow-lg hover:scale-105 cursor-pointer'
                            : 'bg-[#21262D] text-[#7D8590] cursor-not-allowed opacity-50'
                        }`}
                        title="Submit AI message"
                      >
                        {isChatSubmitting ? '…' : '↑'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* VIEW D: AGENT LAB (SWARM FLEET COMMAND)                                 */}
        {/* ======================================================================= */}
        {activeDeckTab === 'lab' && (
          <div className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain">
            <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 px-4 py-5 pb-20 text-xs sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-[#161B22] border border-[#30363D]">
                <div>
                  <h3 className="text-base font-bold text-white">Autonomous Swarm Fleet Command</h3>
                  <p className="text-[#7D8590]">
                    Select a live agent on the operations floor to inspect its dossier.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalState('deploy-agent')}
                  className="px-3.5 py-1.5 rounded-md bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold text-xs transition-colors"
                >
                  + Deploy Agent
                </button>
              </div>

              <div className="min-h-[500px] flex-1">
                <AgentOfficeCanvas
                  agents={agents.slice(0, 8) as OfficeAgent[]}
                  onInspect={(agent) => {
                    const source = agents.find((candidate) => candidate.id === agent.id);

                    if (source) {
                      setSelectedOfficeAgent(source);
                    }
                  }}
                  className="h-[clamp(500px,68dvh,760px)]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS (BRANCH SWITCHER, FILE FINDER, CLONE, BLOB, NEW ISSUE/PR/REPO)   */}
      {/* ========================================================================= */}

      {/* Branch Switcher Modal */}
      {modalState === 'branch-switcher' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md overflow-hidden shadow-2xl space-y-3 p-4 text-xs animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <h3 className="font-bold text-white text-sm">Switch branches or tags</h3>
              <button
                type="button"
                onClick={() => {
                  setModalState('none');
                  setNewBranchInput('');
                }}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={newBranchInput}
              onChange={(e) => setNewBranchInput(e.target.value)}
              placeholder="Find or create a branch..."
              className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
            />
            {newBranchInput.trim() &&
              !repoBranches.some(
                (b) => b.toLowerCase() === newBranchInput.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onClick={handleCreateBranch}
                  className="w-full text-left py-2 px-3 rounded bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] font-semibold flex items-center gap-2 border border-[#30363D]"
                >
                  <span className="text-[#3FB950] font-bold">+</span>
                  <span>
                    Create branch: <span className="text-white">{newBranchInput.trim()}</span> from{' '}
                    <span className="text-[#7D8590]">{currentBranch}</span>
                  </span>
                </button>
              )}
            <div className="divide-y divide-[#21262D] max-h-60 overflow-y-auto">
              {repoBranches
                .filter((b) => b.toLowerCase().includes(newBranchInput.toLowerCase()))
                .map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setCurrentBranch(b);
                      setModalState('none');
                      setNewBranchInput('');
                      showToast(`Switched to branch ${b}`);
                    }}
                    className="w-full text-left py-2 px-2 hover:bg-[#21262D] flex items-center justify-between text-xs"
                  >
                    <span
                      className={
                        currentBranch === b ? 'text-[#FF8C42] font-bold' : 'text-[#E6EDF3]'
                      }
                    >
                      {b}
                    </span>
                    {currentBranch === b && <span className="text-[#FF8C42]">✓</span>}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* File Finder Modal ('t') */}
      {modalState === 'file-finder' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-4 text-xs space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Go to file</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              placeholder="Type a filename..."
              autoFocus
              className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-3 py-2 text-xs text-white focus:outline-none"
            />
            <div className="divide-y divide-[#21262D] max-h-72 overflow-y-auto">
              {filteredFiles.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => {
                    setModalState('none');
                    setViewingFile(file);
                  }}
                  className="w-full text-left py-2 px-2 hover:bg-[#21262D] flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-[#58A6FF]">{file.path}</span>
                  <span className="text-[#7D8590]">{file.size ?? 'dir'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Clone Drawer Modal */}
      {modalState === 'clone' && selectedRepo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md overflow-hidden shadow-2xl p-4 text-xs space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Clone repository</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Protocol Tabs */}
            <div className="flex items-center gap-2 border-b border-[#21262D] pb-2">
              {(['https', 'ssh', 'cli'] as const).map((proto) => (
                <button
                  key={proto}
                  type="button"
                  onClick={() => setCloneProtocol(proto)}
                  className={`px-3 py-1 rounded font-bold uppercase text-[11px] ${
                    cloneProtocol === proto
                      ? 'bg-[#21262D] text-white border border-[#30363D]'
                      : 'text-[#7D8590]'
                  }`}
                >
                  {proto}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={
                  cloneProtocol === 'https'
                    ? selectedRepo.cloneUrl
                    : cloneProtocol === 'ssh'
                      ? selectedRepo.sshUrl
                      : `gh repo clone ${selectedRepo.fullName}`
                }
                className="flex-1 bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-[11px] font-mono text-white"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    cloneProtocol === 'https'
                      ? selectedRepo.cloneUrl
                      : cloneProtocol === 'ssh'
                        ? selectedRepo.sshUrl
                        : `gh repo clone ${selectedRepo.fullName}`,
                  );
                  showToast('Copied to clipboard!');
                }}
                className="px-3 py-1.5 rounded bg-[#21262D] hover:bg-[#30363D] font-bold text-white border border-[#30363D]"
              >
                Copy
              </button>
            </div>

            <div className="border-t border-[#21262D] pt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => showToast('Starting ZIP download...')}
                className="text-[#58A6FF] hover:underline font-semibold flex items-center gap-1"
              >
                📥 Download ZIP
              </button>
              <button
                type="button"
                onClick={() => showToast('Opening in GitHub Desktop...')}
                className="text-[#7D8590] hover:text-white"
              >
                Open with GitHub Desktop
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingFile && selectedRepo && (
        <BlobEditor
          path={viewingFile.path}
          branch={currentBranch}
          availableBranches={repoBranches}
          initialContent={viewingFile.content ?? ''}
          expectedBlobSha={viewingBlobSha}
          onClose={closeBlobEditor}
          onCommit={handleCommitBlob}
        />
      )}

      {selectedOfficeAgent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-dossier-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
        >
          <section className="w-full max-w-lg overflow-hidden rounded-xl border border-[#30363D] bg-[#161B22] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#30363D] px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-full font-black text-black"
                  style={{
                    backgroundColor: selectedOfficeAgent.color,
                  }}
                >
                  {selectedOfficeAgent.initial}
                </span>
                <div>
                  <h2 id="agent-dossier-title" className="font-bold text-white">
                    {selectedOfficeAgent.name}
                  </h2>
                  <p className="text-xs text-[#7D8590]">{selectedOfficeAgent.role}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOfficeAgent(null)}
                aria-label="Close agent dossier"
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </header>

            <div className="space-y-4 p-5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                  <p className="text-[#7D8590]">Pod</p>
                  <p className="mt-1 font-mono font-bold text-white">{selectedOfficeAgent.pod}</p>
                </div>
                <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                  <p className="text-[#7D8590]">Status</p>
                  <p className="mt-1 font-bold capitalize text-[#3FB950]">
                    {selectedOfficeAgent.status}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                <p className="font-bold text-[#FF8C42]">Current assignment</p>
                <p className="mt-2 leading-relaxed text-[#E6EDF3]">
                  {selectedOfficeAgent.currentTask}
                </p>
              </div>

              <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
                <p className="font-bold text-white">Live thought stream</p>
                <p className="mt-2 leading-relaxed text-[#7D8590]">
                  {selectedOfficeAgent.thoughts || 'Awaiting the next orchestrator instruction.'}
                </p>
              </div>

              {selectedOfficeAgent.steps && selectedOfficeAgent.steps.length > 0 && (
                <div>
                  <p className="mb-2 font-bold text-white">Recent execution</p>
                  <ul className="space-y-1.5 text-[#7D8590]">
                    {selectedOfficeAgent.steps.map((step) => (
                      <li key={step} className="flex gap-2">
                        <span className="text-[#3FB950]">✓</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedOfficeAgent(null);
                  setModalState('deploy-agent');
                }}
                className="w-full rounded-md bg-[#FF8C42] px-4 py-2 font-bold text-black hover:bg-[#ff9b5a]"
              >
                Assign a task
              </button>
            </div>
          </section>
        </div>
      )}

      {/* New Issue Modal */}
      {modalState === 'new-issue' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateIssue}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-lg p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Create a new issue</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Title</label>
              <input
                type="text"
                required
                value={newIssueTitle}
                onChange={(e) => setNewIssueTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Description</label>
              <textarea
                rows={4}
                value={newIssueBody}
                onChange={(e) => setNewIssueBody(e.target.value)}
                placeholder="Leave a comment or describe the bug..."
                className="w-full bg-[#0D1117] border border-[#30363D] rounded p-3 text-xs text-white"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <select
                value={newIssueLabel}
                onChange={(e) => setNewIssueLabel(e.target.value)}
                className="bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="bug">Label: bug</option>
                <option value="enhancement">enhancement</option>
                <option value="architecture">architecture</option>
              </select>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-bold"
              >
                Submit new issue
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New PR Modal */}
      {modalState === 'new-pr' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePR}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-lg p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Open a pull request</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-2 rounded bg-[#0D1117] border border-[#30363D] text-[11px] text-[#7D8590]">
              Comparing <span className="font-mono text-white">main</span> ←{' '}
              <span className="font-mono text-[#58A6FF]">{newPrBranch}</span>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Title</label>
              <input
                type="text"
                required
                value={newPrTitle}
                onChange={(e) => setNewPrTitle(e.target.value)}
                placeholder="Pull request title"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Description</label>
              <textarea
                rows={3}
                value={newPrBody}
                onChange={(e) => setNewPrBody(e.target.value)}
                placeholder="Describe your changes and PR summary..."
                className="w-full bg-[#0D1117] border border-[#30363D] rounded p-3 text-xs text-white"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-bold"
              >
                Create pull request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Repository Modal */}
      {modalState === 'new-repo' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRepo}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Create a new repository</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Repository name</label>
              <input
                type="text"
                required
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="my-awesome-app"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Description (optional)</label>
              <input
                type="text"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
                placeholder="Brief description"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={newRepoVisibility === 'public'}
                  onChange={() => setNewRepoVisibility('public')}
                />
                <span>Public</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={newRepoVisibility === 'private'}
                  onChange={() => setNewRepoVisibility('private')}
                />
                <span>Private</span>
              </label>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] text-white font-bold"
              >
                Create repository
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deploy Agent Modal */}
      {modalState === 'deploy-agent' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleDeployAgent}
            className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
              <h3 className="font-bold text-white text-sm">Deploy Specialized Agent</h3>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Agent Name</label>
              <input
                type="text"
                required
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Cipher"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Specialized Role</label>
              <input
                type="text"
                required
                value={newAgentRole}
                onChange={(e) => setNewAgentRole(e.target.value)}
                placeholder="Cryptographic Audit & Secret Zeroing"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-white">Pod</label>
              <select
                value={newAgentPod}
                onChange={(e) => setNewAgentPod(e.target.value)}
                className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="COMMAND">COMMAND (Executive Architecture)</option>
                <option value="SHIELD">SHIELD (Security & QA)</option>
                <option value="ENGINE">ENGINE (Fullstack Backend)</option>
                <option value="CANVAS">CANVAS (UI/UX Systems)</option>
              </select>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold"
              >
                Deploy to Swarm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Action Run Detail Flowchart Modal */}
      {modalState === 'action-detail' && selectedActionRun && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-2xl p-5 text-xs space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-[#3FB950] font-bold">✓</span>
                <h3 className="font-bold text-white text-sm">{selectedActionRun.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalState('none')}
                className="text-[#7D8590] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#161B22] p-3 rounded border border-[#30363D]">
              <div>
                <span className="text-[10px] text-[#7D8590]">Workflow</span>
                <p className="font-bold text-white">{selectedActionRun.workflow}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Branch</span>
                <p className="font-bold text-white">{selectedActionRun.branch}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Duration</span>
                <p className="font-bold text-white">{selectedActionRun.duration}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Commit</span>
                <p className="font-mono text-[#58A6FF]">{selectedActionRun.commitSha}</p>
              </div>
            </div>

            {/* Job Execution Flowchart */}
            <div className="space-y-2">
              <h4 className="font-bold text-white">Jobs Pipeline:</h4>
              <div className="space-y-2">
                {selectedActionRun.jobs.map((job) => (
                  <div
                    key={job.name}
                    className="flex items-center justify-between p-3 rounded bg-[#161B22] border border-[#30363D]"
                  >
                    <div className="flex items-center gap-2 font-bold text-white">
                      <span className="text-[#3FB950]">✓</span>
                      <span>{job.name}</span>
                    </div>
                    <span className="font-mono text-[#7D8590]">{job.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pull Request Detail Modal with Live Merge */}
      {modalState === 'pr-detail' && selectedPr && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-2xl p-5 text-xs space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-start justify-between border-b border-[#21262D] pb-3 gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-white text-base leading-tight">
                    {selectedPr.title}
                  </h3>
                  <span className="text-[#7D8590] text-sm">#{selectedPr.id}</span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      selectedPr.state === 'merged'
                        ? 'bg-[#8957E5]/20 text-[#A371F7] border border-[#8957E5]/40'
                        : selectedPr.state === 'closed'
                          ? 'bg-[#DA3633]/20 text-[#F85149] border border-[#DA3633]/40'
                          : 'bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40'
                    }`}
                  >
                    <span>⑂</span>
                    <span className="capitalize">{selectedPr.state}</span>
                  </span>
                  <span className="text-[11px] text-[#7D8590]">
                    <span className="text-white font-semibold">{selectedPr.author}</span> wants to
                    merge into{' '}
                    <span className="px-1.5 py-0.5 rounded bg-[#161B22] text-[#58A6FF] font-mono">
                      {selectedPr.branchTarget || selectedRepo?.defaultBranch || 'main'}
                    </span>{' '}
                    from{' '}
                    <span className="px-1.5 py-0.5 rounded bg-[#161B22] text-[#58A6FF] font-mono">
                      {selectedPr.branchSource}
                    </span>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closePullDetail}
                className="text-[#7D8590] hover:text-white text-base font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {/* PR Meta / Diff Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#161B22] p-3 rounded-md border border-[#30363D]">
              <div>
                <span className="text-[10px] text-[#7D8590]">Changes</span>
                <p className="font-bold text-white">
                  <span className="text-[#3FB950]">+{selectedPr.additions ?? 24}</span>{' '}
                  <span className="text-[#F85149]">-{selectedPr.deletions ?? 5}</span>
                </p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Files Changed</span>
                <p className="font-bold text-white">{selectedPr.changedFiles ?? 3} files</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">Created</span>
                <p className="font-bold text-white">{selectedPr.createdAt}</p>
              </div>
              <div>
                <span className="text-[10px] text-[#7D8590]">CI Checks</span>
                <p className="font-bold text-[#3FB950]">✓ Passed</p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-[#7D8590] text-[11px] uppercase tracking-wider">
                Description
              </h4>
              <div className="p-3.5 rounded-md bg-[#161B22] border border-[#30363D] text-[#E6EDF3] leading-relaxed whitespace-pre-wrap">
                {selectedPr.body || 'No description provided.'}
              </div>
            </div>

            {/* Merge Action Box */}
            <div className="pt-2">
              {selectedPr.state === 'open' ? (
                <div className="bg-[#161B22] border border-[#238636]/50 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[#3FB950] font-bold">
                      <span>✓</span>
                      <span>This branch has no conflicts with the base branch</span>
                    </div>
                    <p className="text-[11px] text-[#7D8590]">
                      Merging will record status to database and close this pull request.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMergePR(selectedPr.id)}
                    className="px-4 py-2 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs flex items-center gap-2 shadow transition-colors"
                  >
                    <span>⑂</span> Merge pull request
                  </button>
                </div>
              ) : selectedPr.state === 'merged' ? (
                <div className="bg-[#8957E5]/10 border border-[#8957E5]/30 rounded-lg p-3.5 flex items-center gap-2.5 text-[#A371F7]">
                  <span className="font-bold text-base">✓</span>
                  <span className="font-semibold text-xs">
                    Pull request #{selectedPr.id} was successfully merged and closed.
                  </span>
                </div>
              ) : (
                <div className="bg-[#DA3633]/10 border border-[#DA3633]/30 rounded-lg p-3.5 flex items-center gap-2.5 text-[#F85149]">
                  <span className="font-bold text-base">✕</span>
                  <span className="font-semibold text-xs">This pull request is closed.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Issue Detail Modal with Live Toggle */}
      {modalState === 'issue-detail' && selectedIssue && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-detail-title"
            className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 text-xs space-y-4 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-start justify-between border-b border-[#21262D] pb-3 gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id="issue-detail-title"
                    className="font-bold text-white text-base leading-tight"
                  >
                    {selectedIssue.title}
                  </h3>
                  <span className="text-[#7D8590] text-sm">#{selectedIssue.id}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      selectedIssue.state === 'open'
                        ? 'bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40'
                        : 'bg-[#8957E5]/20 text-[#A371F7] border border-[#8957E5]/40'
                    }`}
                  >
                    <span>{selectedIssue.state === 'open' ? '⨀' : '✓'}</span>
                    <span className="capitalize">{selectedIssue.state}</span>
                  </span>
                  <span className="text-[11px] text-[#7D8590]">
                    Opened by{' '}
                    <span className="text-white font-semibold">{selectedIssue.author}</span> ·{' '}
                    {selectedIssue.createdAt}
                  </span>
                  {selectedIssue.labels?.map((lbl) => (
                    <span
                      key={lbl.name}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: lbl.color }}
                    >
                      {lbl.name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={closeIssueDetail}
                className="text-[#7D8590] hover:text-white text-base font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-[#7D8590] text-[11px] uppercase tracking-wider">
                Issue Description
              </h4>
              <div className="p-3.5 rounded-md bg-[#161B22] border border-[#30363D] text-[#E6EDF3] leading-relaxed whitespace-pre-wrap">
                {selectedIssue.body || 'No description provided.'}
              </div>
            </div>

            {/* Persisted comments timeline */}
            <section aria-labelledby="issue-comments-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h4
                  id="issue-comments-heading"
                  className="font-bold text-[#7D8590] text-[11px] uppercase tracking-wider"
                >
                  Comments ({issueComments.length})
                </h4>
                {isLoadingComments && <span className="text-[#7D8590]">Loading…</span>}
              </div>

              {!isLoadingComments && issueComments.length === 0 && !commentError && (
                <div className="rounded-md border border-[#30363D] bg-[#161B22] p-4 text-center text-[#7D8590]">
                  No comments yet. Start the conversation.
                </div>
              )}

              <ol className="space-y-3">
                {issueComments.map((comment) => {
                  const authorName = comment.author.displayName || comment.author.username;
                  const initials = authorName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join('');
                  const timestamp = new Date(comment.createdAt);
                  const formattedTimestamp = Number.isNaN(timestamp.getTime())
                    ? comment.createdAt
                    : new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(timestamp);

                  return (
                    <li key={comment.id} className="flex items-start gap-3">
                      {comment.author.avatarUrl ? (
                        <img
                          src={comment.author.avatarUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="size-8 rounded-full border border-[#30363D] object-cover shrink-0"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="size-8 rounded-full border border-[#30363D] bg-[#21262D] grid place-items-center text-[10px] font-bold text-[#E6EDF3] shrink-0"
                        >
                          {initials || '?'}
                        </div>
                      )}
                      <article className="min-w-0 flex-1 overflow-hidden rounded-md border border-[#30363D] bg-[#161B22]">
                        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363D] bg-[#161B22] px-3 py-2">
                          <span className="font-semibold text-[#E6EDF3]">{authorName}</span>
                          <time dateTime={comment.createdAt} className="text-[10px] text-[#7D8590]">
                            {formattedTimestamp}
                          </time>
                        </header>
                        <p className="whitespace-pre-wrap break-words px-3 py-3 text-[#E6EDF3] leading-relaxed">
                          {comment.body}
                        </p>
                      </article>
                    </li>
                  );
                })}
              </ol>

              <form onSubmit={handleSubmitIssueComment} className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="size-8 rounded-full border border-[#30363D] bg-[#21262D] grid place-items-center text-[10px] font-bold text-[#E6EDF3] shrink-0"
                >
                  {currentUsername.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <label htmlFor="issue-comment-body" className="sr-only">
                    Add a comment
                  </label>
                  <textarea
                    id="issue-comment-body"
                    rows={4}
                    maxLength={10000}
                    required
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Leave a comment"
                    className="w-full resize-y rounded-md border border-[#30363D] bg-[#0D1117] p-3 text-xs text-[#E6EDF3] placeholder-[#7D8590] outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]"
                  />
                  {commentError && (
                    <p role="alert" className="text-[11px] text-[#F85149]">
                      {commentError}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-[#7D8590]">
                      {commentDraft.length.toLocaleString()} / 10,000
                    </span>
                    <button
                      type="submit"
                      disabled={isSubmittingComment || !commentDraft.trim()}
                      className="rounded-md bg-[#238636] px-4 py-2 font-bold text-white transition-colors hover:bg-[#2EA043] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmittingComment ? 'Commenting…' : 'Comment'}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* Issue Actions Bar */}
            <div className="pt-2 flex items-center justify-between border-t border-[#21262D]">
              <span className="text-[11px] text-[#7D8590]">
                Assignee:{' '}
                <span className="text-white font-medium">{selectedIssue.assignee || 'None'}</span>
              </span>
              <button
                type="button"
                onClick={() => handleToggleIssue(selectedIssue.id)}
                className={`px-4 py-2 rounded-md font-bold text-xs flex items-center gap-1.5 shadow transition-colors ${
                  selectedIssue.state === 'open'
                    ? 'bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] border border-[#30363D]'
                    : 'bg-[#238636] hover:bg-[#2EA043] text-white'
                }`}
              >
                <span>{selectedIssue.state === 'open' ? '✓' : '⨀'}</span>
                <span>{selectedIssue.state === 'open' ? 'Close issue' : 'Reopen issue'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personalize Quanty AI Modal */}
      {isPersonalizeOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 text-xs space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🎨</span>
                <div>
                  <h3 className="font-bold text-white text-sm">Personalize your Quanty AI</h3>
                  <p className="text-[11px] text-[#7D8590]">
                    Customize accessory, name, and swarm instructions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalizeOpen(false)}
                className="text-[#7D8590] hover:text-white text-base font-bold"
              >
                ✕
              </button>
            </div>

            {/* Avatar Preview & Accessories */}
            <div className="flex flex-col items-center justify-center space-y-3 py-2 bg-[#0D1117] rounded-xl border border-[#21262D]">
              <div className="relative">
                <BubbleAvatar state="coding" size={64} />
                {selectedAccessory !== 'none' && (
                  <span className="absolute -top-2 -right-2 text-2xl drop-shadow-md">
                    {selectedAccessory === 'crown' && '👑'}
                    {selectedAccessory === 'firefighter' && '🚒'}
                    {selectedAccessory === 'mustache' && '🥸'}
                    {selectedAccessory === 'scarf' && '🧣'}
                    {selectedAccessory === 'flower' && '🌸'}
                    {selectedAccessory === 'pencil' && '✏️'}
                    {selectedAccessory === 'duck' && '🦆'}
                    {selectedAccessory === 'cowboy' && '🤠'}
                    {selectedAccessory === 'propeller' && '🚁'}
                  </span>
                )}
              </div>
              <span className="font-bold text-white text-sm">{quantyName}</span>
            </div>

            {/* Accessory Selector Grid */}
            <div className="space-y-2">
              <label className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                Accessories
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { id: 'none', label: 'None', icon: '🚫' },
                  { id: 'crown', label: 'Crown', icon: '👑' },
                  { id: 'firefighter', label: 'Firefighter', icon: '🚒' },
                  { id: 'mustache', label: 'Mustache', icon: '🥸' },
                  { id: 'scarf', label: 'Scarf', icon: '🧣' },
                  { id: 'flower', label: 'Flower', icon: '🌸' },
                  { id: 'pencil', label: 'Pencil', icon: '✏️' },
                  { id: 'duck', label: 'Duck', icon: '🦆' },
                  { id: 'cowboy', label: 'Cowboy', icon: '🤠' },
                  { id: 'propeller', label: 'Propeller', icon: '🚁' },
                ].map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccessory(acc.id as any)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                      selectedAccessory === acc.id
                        ? 'bg-[#58A6FF]/20 border-[#58A6FF] text-white shadow-md'
                        : 'bg-[#0D1117] border-[#30363D] text-[#7D8590] hover:text-white hover:border-[#58A6FF]'
                    }`}
                  >
                    <span className="text-xl">{acc.icon}</span>
                    <span className="text-[10px] font-medium truncate w-full text-center">
                      {acc.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Name Input */}
            <div className="space-y-1">
              <label className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                AI Name
              </label>
              <input
                type="text"
                value={quantyName}
                onChange={(e) => setQuantyName(e.target.value)}
                placeholder="Quanty"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
              />
            </div>

            {/* Custom Instructions Textarea */}
            <div className="space-y-1">
              <label className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                Custom Instructions & Context
              </label>
              <textarea
                rows={3}
                value={quantyInstructions}
                onChange={(e) => setQuantyInstructions(e.target.value)}
                placeholder="What would you like Quanty to know about you to provide better responses? (e.g., Preferred tech stack, architecture constraints)"
                className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#21262D]">
              <button
                type="button"
                onClick={() => setIsPersonalizeOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPersonalizeOpen(false);
                  showToast('Personalization preferences saved!');
                }}
                className="px-4 py-2 rounded-lg bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold shadow-md transition-colors"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. PERMANENT 4-BUTTON DOCKED BOTTOM DECK                                  */}
      {/* ========================================================================= */}
      <nav
        aria-label="QuantGit bottom deck"
        className="fixed bottom-0 inset-x-0 z-40 h-[72px] border-t border-[#30363D] bg-[#0D1117]/95 backdrop-blur-md flex items-center justify-around px-4 sm:px-8 select-none shadow-2xl"
      >
        <button
          type="button"
          onClick={() => {
            setActiveDeckTab('quanty');
            setSelectedRepo(null);
            setViewingFile(null);
            setModalState('none');
            navigateQuantGit({ kind: 'quanty' });
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeDeckTab === 'quanty'
              ? 'bg-[#FF8C42] text-black shadow-lg'
              : 'text-[#7D8590] hover:text-white hover:bg-[#161B22]'
          }`}
        >
          <span>✨</span>
          <span>Quanty</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveDeckTab('repos');
            setSelectedRepo(null);
            setViewingFile(null);
            setModalState('none');
            navigateQuantGit({ kind: 'repositories' });
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeDeckTab === 'repos'
              ? 'bg-[#FF8C42] text-black shadow-lg'
              : 'text-[#7D8590] hover:text-white hover:bg-[#161B22]'
          }`}
        >
          <span>📁</span>
          <span>Repos</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveDeckTab('lab');
            setSelectedRepo(null);
            setViewingFile(null);
            setModalState('none');
            navigateQuantGit({ kind: 'agentlab' });
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeDeckTab === 'lab'
              ? 'bg-[#FF8C42] text-black shadow-lg'
              : 'text-[#7D8590] hover:text-white hover:bg-[#161B22]'
          }`}
        >
          <span>🧪</span>
          <span>Agent Lab</span>
        </button>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-[#7D8590] hover:text-white hover:bg-[#161B22] transition-all"
        >
          <span>↗</span>
          <span>Exit</span>
        </button>
      </nav>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42] text-xs font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-3">
          {toastMessage}
        </div>
      )}
    </main>
  );
}
