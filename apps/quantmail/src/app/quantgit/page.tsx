'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BubbleAvatar } from '@quant/shared-ui';
import type { BubbleState } from '@quant/shared-ui';
import { useRepos } from '../../hooks/useRepos';

export type GitHubSubTab = 'code' | 'issues' | 'pulls' | 'agents' | 'actions';
export type BuildMode = 'plan' | 'build' | 'auto';
export type Effort = 'fast' | 'deep';
export type CloneProtocol = 'https' | 'ssh' | 'cli';

export type Repo = {
  id: string;
  name: string;
  fullName?: string;
  description?: string;
  visibility?: string;
  language?: string;
  stars?: number;
  forks?: number;
  watching?: number;
  cloneUrl?: string;
  sshUrl?: string;
  defaultBranch?: string;
  latestCommit?: string;
  latestCommitSha?: string;
  latestCommitTime?: string;
  checksStatus?: 'passing' | 'pending' | 'failing';
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
};

export type PRItem = {
  id: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  branchSource: string;
  branchTarget: string;
  checksStatus: 'passing' | 'pending' | 'failing';
  commentsCount: number;
  createdAt: string;
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

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  mode?: BuildMode;
  timestamp: string;
  suggestions?: string[];
  steps?: string[];
};

const AGENT_FLEET_CATALOG = [
  {
    id: 'astra',
    name: 'Astra',
    role: 'Executive Lead & Architecture Gatekeeper',
    pod: 'COMMAND',
    initial: 'A',
    description: 'Verifies architectural invariants, reviews diffs, and controls security gates.',
    color: '#FF8C42',
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Autonomous Code Builder',
    pod: 'BUILD',
    initial: 'F',
    description: 'Implements deep refactors, generates tests, and resolves compile errors.',
    color: '#3b82f6',
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Codebase Researcher & Bug Finder',
    pod: 'RESEARCH',
    initial: 'S',
    description: 'Performs semantic searches, traces AST paths, and benchmarks competitor APIs.',
    color: '#a855f7',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Security & QA Sentinel',
    pod: 'SHIELD',
    initial: 'S',
    description: 'Runs zero-mock test gates, checks OWASP top 10, and monitors CI/CD status.',
    color: '#34d399',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    role: 'UI/UX & Mobile Ergonomics',
    pod: 'STUDIO',
    initial: 'P',
    description: 'Polishes component responsiveness, touch targets, and visual fidelity.',
    color: '#ec4899',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    role: 'Data Services & Migrations',
    pod: 'DATA',
    initial: 'L',
    description: 'Manages database schemas, Prisma migrations, and caching layers.',
    color: '#f59e0b',
  },
];

const GIT_QUICK_ACTIONS = [
  {
    id: 'debug',
    label: 'Debug',
    icon: '🐞',
    prompt: 'Debug recent test failures and build issues across apps',
    state: 'debugging' as BubbleState,
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: '☁️',
    prompt: 'Deploy autonomous agent to inspect open PRs, tasks, and issues',
    state: 'thinking' as BubbleState,
  },
  {
    id: 'issue',
    label: 'Create issue',
    icon: '◌',
    prompt: 'Draft a new sprint issue with repro steps and acceptance criteria',
    state: 'planning' as BubbleState,
  },
  {
    id: 'code',
    label: 'Write code',
    icon: '📄',
    prompt: 'Implement technical specification from TASK_PLANNER.md',
    state: 'coding' as BubbleState,
  },
  {
    id: 'git',
    label: 'Git',
    icon: '⑂',
    prompt: 'Inspect current git branch, staged diffs, and remote tracking status',
    state: 'analyzing' as BubbleState,
  },
  {
    id: 'pr',
    label: 'Pull requests',
    icon: '⑂',
    prompt: 'Audit open pull requests, conflicts, and CI status',
    state: 'reading' as BubbleState,
  },
];

const INITIAL_ISSUES: IssueItem[] = [
  {
    id: 259,
    title: 'Fix QuantMail composer recipient tag overflow on small viewports',
    state: 'open',
    author: 'kundan',
    labels: [
      { name: 'bug', color: '#d73a4a' },
      { name: 'mobile', color: '#a2eeef' },
    ],
    commentsCount: 3,
    createdAt: '2 hours ago',
    body: 'Long recipient strings and tags should wrap properly without horizontal layout bleed.',
  },
  {
    id: 250,
    title: 'ADR-001: Consolidate Drive AI services & aggregate sum storage quota',
    state: 'open',
    author: 'astra-ceo',
    labels: [
      { name: 'architecture', color: '#0075ca' },
      { name: 'storage', color: '#cfd3d7' },
    ],
    commentsCount: 8,
    createdAt: 'yesterday',
    body: 'Port 5 Drive AI services into QuantMail Drive with DB-side aggregate sum.',
  },
  {
    id: 138,
    title: 'CI Gate: Upgrade Vitest runner concurrency & memory pool clamps',
    state: 'open',
    author: 'sentinel',
    labels: [
      { name: 'ci/cd', color: '#7057ff' },
      { name: 'performance', color: '#e4e669' },
    ],
    commentsCount: 2,
    createdAt: '2 days ago',
    body: 'Prevent runner worker OOMs during 20+ package monorepo sweeps.',
  },
  {
    id: 122,
    title: 'Zero-mock Yjs collaborative document branching and paragraph write-locks',
    state: 'open',
    author: 'forge',
    labels: [
      { name: 'docs', color: '#008672' },
      { name: 'crdt', color: '#e99695' },
    ],
    commentsCount: 5,
    createdAt: '3 days ago',
    body: 'Verify 3-way CRDT merge and RBAC write permissions on live Y.Doc websockets.',
  },
  {
    id: 121,
    title: 'LiveKit SFU gateway & calendar-to-voice proactive reminder loop',
    state: 'open',
    author: 'astra-ceo',
    labels: [
      { name: 'webrtc', color: '#d4c5f9' },
      { name: 'voice', color: '#f9d0c4' },
    ],
    commentsCount: 12,
    createdAt: '4 days ago',
    body: 'Dispatch proactive phone call alerts 5 minutes before scheduled calendar events.',
  },
];

const INITIAL_PRS: PRItem[] = [
  {
    id: 260,
    title: 'Master Consolidation: Waves B-F, Sprints 2-5, and 7 dead app removals',
    state: 'closed',
    author: 'kundan',
    branchSource: 'sprint-1/consolidation',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 14,
    createdAt: 'merged 7 hours ago',
  },
  {
    id: 258,
    title: 'feat(voice): LiveKit bot gateway and calendar proactive call dispatcher',
    state: 'closed',
    author: 'forge',
    branchSource: 'feat/voice-calendar',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 6,
    createdAt: 'merged yesterday',
  },
  {
    id: 255,
    title: 'fix(docs): Yjs ArrayBufferLike frame typings for TypeScript 5.9 compatibility',
    state: 'closed',
    author: 'sentinel',
    branchSource: 'fix/yjs-ts59',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 4,
    createdAt: 'merged 2 days ago',
  },
  {
    id: 253,
    title: 'feat(drive): Sub-waves A4 & A5 duplicate detection, organize & quota locks',
    state: 'closed',
    author: 'ledger',
    branchSource: 'feat/drive-a4-a5',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 9,
    createdAt: 'merged 3 days ago',
  },
  {
    id: 247,
    title: 'feat(core): QuantMail v2.0 sovereign authentication & internal mail spoof prevention',
    state: 'closed',
    author: 'kundan',
    branchSource: 'feat/v2-auth-core',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 19,
    createdAt: 'merged 5 days ago',
  },
];

const INITIAL_WORKFLOW_RUNS: WorkflowRunItem[] = [
  {
    id: 137,
    name: 'Deploy staging (OIDC)',
    workflow: 'deploy-staging.yml',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: '3c12703',
    duration: '2m 14s',
    timeAgo: '7 hours ago',
  },
  {
    id: 136,
    name: 'CI Gate Sweep',
    workflow: 'ci-gate.yml',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: '3c12703',
    duration: '4m 18s',
    timeAgo: '7 hours ago',
  },
  {
    id: 135,
    name: 'Full Sweep Monorepo Matrix',
    workflow: 'ci-full-sweep.yml',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: 'b68b86e',
    duration: '19m 44s',
    timeAgo: '12 hours ago',
  },
  {
    id: 134,
    name: 'CodeQL Advanced Security',
    workflow: 'codeql.yml',
    status: 'success',
    branch: 'main',
    event: 'schedule',
    commitSha: 'b68b86e',
    duration: '5m 02s',
    timeAgo: '14 hours ago',
  },
  {
    id: 133,
    name: 'Deploy staging (OIDC)',
    workflow: 'deploy-staging.yml',
    status: 'success',
    branch: 'main',
    event: 'workflow_dispatch',
    commitSha: '9e7d401',
    duration: '2m 10s',
    timeAgo: 'yesterday',
  },
];

const MOCK_FILES = [
  {
    name: '.github',
    type: 'folder',
    message: 'ci: unified test matrix & gate sweep',
    timeAgo: '3 hours ago',
  },
  {
    name: 'apps',
    type: 'folder',
    message: 'feat(quantmail): top command deck & GitHub parity',
    timeAgo: 'just now',
  },
  {
    name: 'backend',
    type: 'folder',
    message: 'feat(collab): Yjs CRDT real-time persistence',
    timeAgo: 'yesterday',
  },
  {
    name: 'docs',
    type: 'folder',
    message: 'docs(architecture): update 10 keeper apps ledger',
    timeAgo: '2 days ago',
  },
  {
    name: 'packages',
    type: 'folder',
    message: 'refactor(shared-ui): fluid bubble intelligence without eyes',
    timeAgo: 'just now',
  },
  {
    name: 'AGENT_MEMORY.md',
    type: 'file',
    message: 'docs(memory): master agent memory & swarm ledger',
    timeAgo: '1 hour ago',
    content: `# 🧠 MASTER AGENT MEMORY & SWARM LEDGER\n\nQuant Ecosystem: The sovereign enterprise super-hub.\nMinimum 8-agent swarm led by CEO Astra with 7 specialized developers.\nSingle Auth Root across all 10 unified products.`,
    language: 'markdown',
  },
  {
    name: 'TASK_PLANNER.md',
    type: 'file',
    message: 'chore(planner): update sprint milestones and live checkmarks',
    timeAgo: '1 hour ago',
    content: `# 📋 QUANT ECOSYSTEM — UNIFIED MASTER TASK PLANNER\n\n- [x] PR #260 (Consolidation)\n- [x] PR #247 (QuantMail v2.0)\n- [x] Quanty Bubble Intelligence (Eye-less fluid metaball)\n- [x] QuantGit Top Command Deck & 1:1 GitHub Parity`,
    language: 'markdown',
  },
  {
    name: 'package.json',
    type: 'file',
    message: 'chore: upgrade monorepo dependencies',
    timeAgo: '3 days ago',
    content: `{\n  "name": "quant-ecosystem",\n  "private": true,\n  "packageManager": "pnpm@9.15.0",\n  "scripts": {\n    "dev": "turbo run dev",\n    "build": "turbo run build",\n    "test": "turbo run test"\n  }\n}`,
    language: 'json',
  },
  {
    name: 'pnpm-lock.yaml',
    type: 'file',
    message: 'chore: lockfile sync for shared-ui bubble avatar',
    timeAgo: '3 days ago',
    content: `lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\npackages:\n  @quant/shared-ui: link:packages/shared-ui`,
    language: 'yaml',
  },
  {
    name: 'README.md',
    type: 'file',
    message: 'docs: update ecosystem quickstart & architecture overview',
    timeAgo: 'last week',
    content: `# ⚡ Quant Ecosystem\n\nThe next-generation sovereign enterprise platform with built-in agentic intelligence, real Git source control, and unified memory.`,
    language: 'markdown',
  },
];

const DEFAULT_ECOSYSTEM_REPOS: Repo[] = [
  {
    id: 'quant-ecosystem',
    name: 'Quant-Ecosystem',
    fullName: 'quantrinitylab/Quant-Ecosystem',
    description: 'Next-gen sovereign workspace, autonomous AI swarm & Git hub.',
    visibility: 'public',
    language: 'TypeScript',
    stars: 128,
    forks: 24,
    watching: 12,
    defaultBranch: 'main',
    latestCommit:
      'feat(quantgit): top command deck, eye-less bubble mascot & 1:1 github repository parity',
    latestCommitSha: '3c12703',
    latestCommitTime: '7 hours ago',
    cloneUrl: 'https://github.com/quantrinitylab/Quant-Ecosystem.git',
    sshUrl: 'git@github.com:quantrinitylab/Quant-Ecosystem.git',
    checksStatus: 'passing',
  },
  {
    id: 'quantmail-core',
    name: 'quantmail-core',
    fullName: 'quantrinitylab/quantmail-core',
    description: 'Ultra-fast sovereign mail client with inline triage lenses & local ONNX.',
    visibility: 'private',
    language: 'TypeScript',
    stars: 42,
    forks: 5,
    watching: 4,
    defaultBranch: 'main',
    latestCommit: 'refactor(shared-ui): fluid bubble avatar mascot',
    latestCommitSha: 'e71d57a',
    latestCommitTime: '12 hours ago',
    cloneUrl: 'https://github.com/quantrinitylab/quantmail-core.git',
    sshUrl: 'git@github.com:quantrinitylab/quantmail-core.git',
    checksStatus: 'passing',
  },
];

function normalizeRepos(value: unknown): Repo[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_ECOSYSTEM_REPOS;
  const parsed = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const name = typeof source.name === 'string' ? source.name : `repository-${index + 1}`;
    return [
      {
        id: String(source.id ?? source.repoId ?? name),
        name,
        fullName:
          typeof source.fullName === 'string'
            ? source.fullName
            : typeof source.full_name === 'string'
              ? source.full_name
              : undefined,
        description: typeof source.description === 'string' ? source.description : undefined,
        visibility:
          typeof source.visibility === 'string'
            ? source.visibility
            : source.private === true
              ? 'private'
              : 'public',
        language: typeof source.language === 'string' ? source.language : 'TypeScript',
        stars:
          typeof source.stars === 'number'
            ? source.stars
            : typeof source.stargazers_count === 'number'
              ? source.stargazers_count
              : 128,
        forks:
          typeof source.forks === 'number'
            ? source.forks
            : typeof source.forks_count === 'number'
              ? source.forks_count
              : 24,
        watching: typeof source.watching === 'number' ? source.watching : 12,
        cloneUrl:
          typeof source.cloneUrl === 'string'
            ? source.cloneUrl
            : typeof source.clone_url === 'string'
              ? source.clone_url
              : 'https://github.com/quantrinitylab/Quant-Ecosystem.git',
        sshUrl:
          typeof source.sshUrl === 'string'
            ? source.sshUrl
            : typeof source.ssh_url === 'string'
              ? source.ssh_url
              : 'git@github.com:quantrinitylab/Quant-Ecosystem.git',
        defaultBranch:
          typeof source.defaultBranch === 'string'
            ? source.defaultBranch
            : typeof source.default_branch === 'string'
              ? source.default_branch
              : 'main',
        latestCommit:
          typeof source.latestCommit === 'string'
            ? source.latestCommit
            : 'feat(quantgit): top command deck, eye-less bubble mascot & 1:1 github repository parity',
        latestCommitSha:
          typeof source.latestCommitSha === 'string' ? source.latestCommitSha : '3c12703',
        latestCommitTime:
          typeof source.latestCommitTime === 'string' ? source.latestCommitTime : '7 hours ago',
        checksStatus:
          source.checksStatus === 'pending' || source.checksStatus === 'failing'
            ? (source.checksStatus as 'pending' | 'failing')
            : ('passing' as const),
      },
    ];
  });
  return parsed.length > 0 ? parsed : DEFAULT_ECOSYSTEM_REPOS;
}

export default function QuantGitPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRepos();
  const repos = useMemo(() => normalizeRepos(data), [data]);
  const [selectedRepo, setSelectedRepo] = useState<Repo>(DEFAULT_ECOSYSTEM_REPOS[0]);

  // GitHub Sub-tabs: Code, Issues, Pull requests, Agents, Actions
  const [activeTab, setActiveTab] = useState<GitHubSubTab>('code');
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isCodeDropdownOpen, setIsCodeDropdownOpen] = useState(false);
  const [cloneProto, setCloneProto] = useState<CloneProtocol>('https');
  const [copiedClone, setCopiedClone] = useState(false);

  // Issues and PR states
  const [issues, setIssues] = useState<IssueItem[]>(INITIAL_ISSUES);
  const [issueFilter, setIssueFilter] = useState<'open' | 'closed'>('open');
  const [issueSearch, setIssueSearch] = useState('is:issue state:open');
  const [isNewIssueModalOpen, setIsNewIssueModalOpen] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueBody, setNewIssueBody] = useState('');

  // Pull requests state
  const [pullRequests, setPullRequests] = useState<PRItem[]>(INITIAL_PRS);
  const [prFilter, setPrFilter] = useState<'open' | 'closed'>('open');
  const [prSearch, setPrSearch] = useState('is:pr state:open');

  // Actions state
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunItem[]>(INITIAL_WORKFLOW_RUNS);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('all');

  // File Viewer Modal state
  const [viewingFile, setViewingFile] = useState<{
    name: string;
    content: string;
    language: string;
  } | null>(null);

  // Agents Lab state
  const [deployedAgents, setDeployedAgents] = useState<DeployedAgent[]>([
    {
      id: 'astra',
      name: 'Astra',
      role: 'Executive Lead & Architecture Gatekeeper',
      pod: 'COMMAND',
      status: 'active',
      currentTask: 'Auditing top command deck, eye-less bubble avatar, and 1:1 GitHub parity',
      initial: 'A',
      color: '#FF8C42',
      thoughts:
        'Checking PR #260 merge commits, verifying zero eyes in BubbleAvatar, and checking console logs.',
      steps: [
        'Audited BubbleAvatar canvas: all paintEye/paintBrow/paintMouth removed',
        'Verified 519/519 tests passing in @quant/shared-ui',
        'Approved top command deck layout directly above GitHub workspace',
      ],
    },
    {
      id: 'sentinel',
      name: 'Sentinel',
      role: 'Audit & QA Sentinel',
      pod: 'SHIELD',
      status: 'analyzing',
      currentTask: 'Continuous Vitest regression & CI gate surveillance',
      initial: 'S',
      color: '#34d399',
      thoughts: 'Monitoring test workers and ensuring zero regressions on staging deployment.',
      steps: [
        'Gate sweep passed in 4m18s',
        'Typecheck verified 100% clean',
        'Watching staging endpoint https://quantmail.in/quantgit',
      ],
    },
    {
      id: 'forge',
      name: 'Forge',
      role: 'Autonomous Code Builder',
      pod: 'BUILD',
      status: 'building',
      currentTask: 'Compiling QuantGit repository parity view and file modal explorer',
      initial: 'F',
      color: '#3b82f6',
      thoughts:
        'Building interactive 1:1 UI components for Code, Issues, PRs, Agents, and Actions.',
      steps: [
        'Rendered Code clone dropdown (HTTPS/SSH/CLI)',
        'Added interactive File Viewer with syntax highlights',
        'Integrated Issues filter and interactive New Issue creator',
      ],
    },
  ]);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  // Top Deck Quanty AI Command Bar State
  const [mode, setMode] = useState<BuildMode>('plan');
  const [effort, setEffort] = useState<Effort>('fast');
  const [prompt, setPrompt] = useState('');
  const [mascotState, setMascotState] = useState<BubbleState>('idle');
  const [isStreaming, setIsStreaming] = useState(false);
  const [responseExpanded, setResponseExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'initial-welcome',
      role: 'assistant',
      text: "Hello! I'm Quanty, your autonomous coding companion in QuantGit. What would you like to plan, audit, or build today?",
      timestamp: 'Just now',
      suggestions: [
        'Audit repository architecture',
        'Plan next sprint wave',
        'Check CI/CD health',
        'Deploy specialized agent',
      ],
    },
  ]);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 2600);
  };

  // Sync selected repo when repos load
  useEffect(() => {
    if (repos.length > 0 && !repos.find((r) => r.id === selectedRepo.id)) {
      setSelectedRepo(repos[0]);
    }
  }, [repos, selectedRepo]);

  // Handle Command Bar Submit
  const handleCommandSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const query = prompt.trim();
    if (!query || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: query,
      mode,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setIsStreaming(true);
    setResponseExpanded(true);
    setMascotState(mode === 'build' ? 'coding' : mode === 'plan' ? 'planning' : 'thinking');

    // Simulate realistic intelligent streaming response
    setTimeout(() => {
      let replyText = '';
      let steps: string[] = [];
      let nextState: BubbleState = 'success';

      if (query.toLowerCase().includes('debug')) {
        replyText = `Analyzing recent repository diagnostics for ${selectedRepo.name}... Monorepo build is healthy. Checked Vitest regression gates and TypeScript compilation: 0 errors detected.`;
        steps = [
          'Inspected GitHub Actions run #137',
          'Checked monorepo tsc --noEmit across 10 apps',
          'Verified zero lint regressions',
        ];
        nextState = 'debugging';
      } else if (query.toLowerCase().includes('issue')) {
        replyText = `Drafted new issue spec for ${selectedRepo.name}. You can also click "+ New issue" in the Issues tab below to publish immediately.`;
        steps = ['Generated acceptance criteria', 'Set default label to enhancement'];
        nextState = 'planning';
      } else if (query.toLowerCase().includes('agent')) {
        replyText = `Active Swarm Fleet: Astra (CEO Gatekeeper), Forge (Builder), and Sentinel (QA) are actively monitoring ${selectedRepo.name}. Deploy modal is ready in the Agents tab.`;
        steps = ['Polled active agent heartbeat', 'Confirmed 3 active agents standing by'];
        nextState = 'idle';
      } else {
        replyText = `I have reviewed "${query}" against the live ${selectedRepo.name} workspace. Mode: ${mode.toUpperCase()} (Effort: ${effort.toUpperCase()}). All repository files, issues, and workflows below are synced.`;
        steps = [
          `Read ${selectedRepo.name} commit tree at ${selectedRepo.latestCommitSha || '3c12703'}`,
          'Evaluated monorepo invariants',
          'Synthesized actionable recommendation',
        ];
      }

      const assistantMsg: ChatMessage = {
        id: `assist-${Date.now()}`,
        role: 'assistant',
        text: replyText,
        timestamp: 'Just now',
        steps,
        suggestions: ['Show git status diff', 'Run CI gate tests', 'Deploy Astra audit'],
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsStreaming(false);
      setMascotState(nextState);
    }, 900);
  };

  // Quick Action Click
  const handleQuickAction = (act: (typeof GIT_QUICK_ACTIONS)[0]) => {
    setPrompt(act.prompt);
    setMascotState(act.state);
  };

  // Create Issue
  const handleCreateIssue = (e: FormEvent) => {
    e.preventDefault();
    if (!newIssueTitle.trim()) return;

    const newIssue: IssueItem = {
      id: Math.max(...issues.map((i) => i.id), 260) + 1,
      title: newIssueTitle.trim(),
      body: newIssueBody.trim() || 'Created via QuantGit autonomous deck.',
      state: 'open',
      author: 'kundan',
      labels: [{ name: 'triage', color: '#e99695' }],
      commentsCount: 0,
      createdAt: 'just now',
    };

    setIssues([newIssue, ...issues]);
    setNewIssueTitle('');
    setNewIssueBody('');
    setIsNewIssueModalOpen(false);
    showToast(`Issue #${newIssue.id} created successfully!`);
    setActiveTab('issues');
  };

  // Deploy Agent
  const handleDeployAgent = (agent: (typeof AGENT_FLEET_CATALOG)[0]) => {
    if (deployedAgents.some((a) => a.id === agent.id)) {
      showToast(`${agent.name} is already deployed!`);
      setIsDeployModalOpen(false);
      return;
    }

    const newDep: DeployedAgent = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      pod: agent.pod,
      status: 'active',
      currentTask: 'Standing by for repository tasks',
      initial: agent.initial,
      color: agent.color,
      thoughts: 'Initialized runtime context. Awaiting instructions from CEO Astra.',
      steps: ['Allocated container runtime', 'Loaded git worktree context'],
    };

    setDeployedAgents([...deployedAgents, newDep]);
    setIsDeployModalOpen(false);
    showToast(`Deployed ${agent.name} to ${selectedRepo.name}`);
    setActiveTab('agents');
  };

  // Copy Clone URL
  const handleCopyClone = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedClone(true);
      showToast('Copied clone URL to clipboard!');
      setTimeout(() => setCopiedClone(false), 2000);
    }
  };

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => i.state === issueFilter);
  }, [issues, issueFilter]);

  const filteredPRs = useMemo(() => {
    return pullRequests.filter((p) => p.state === prFilter);
  }, [pullRequests, prFilter]);

  const cloneString = useMemo(() => {
    if (cloneProto === 'ssh') {
      return (
        selectedRepo.sshUrl ||
        `git@github.com:${selectedRepo.fullName || 'quantrinitylab/Quant-Ecosystem'}.git`
      );
    }
    if (cloneProto === 'cli') {
      return `gh repo clone ${selectedRepo.fullName || 'quantrinitylab/Quant-Ecosystem'}`;
    }
    return (
      selectedRepo.cloneUrl ||
      `https://github.com/${selectedRepo.fullName || 'quantrinitylab/Quant-Ecosystem'}.git`
    );
  }, [cloneProto, selectedRepo]);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#0B0C0E] text-white selection:bg-[#FF8C42] selection:text-black [color-scheme:dark] flex flex-col"
    >
      {/* ========================================================================= */}
      {/* 1. TOP HEADER: Prominent Bubble Intelligence Mascot + Wordmark + Breadcrumb */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#282C35] bg-[#0B0C0E]/95 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Prominent Eye-less Bubble Intelligence Mascot (42px) */}
          <div
            className="relative cursor-pointer transition-transform hover:scale-105 shrink-0"
            onClick={() => {
              setMascotState(mascotState === 'idle' ? 'thinking' : 'idle');
            }}
            title={`Quanty Bubble Intelligence — ${mascotState}`}
          >
            <BubbleAvatar state={mascotState} size={42} />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold tracking-tight text-white flex items-center gap-1.5">
              <span className="text-[#FF8C42]">Quant</span>Git
            </span>
            <span className="text-[#6b7280]">/</span>
            <div className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-slate-200">
              <span className="text-[#A1A4AC] hover:text-white cursor-pointer">quantrinitylab</span>
              <span className="text-[#6b7280]">/</span>
              <span className="text-white font-bold hover:text-[#FF8C42] cursor-pointer">
                {selectedRepo.name}
              </span>
            </div>
            <span className="ml-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#282C35] text-[#A1A4AC] bg-[#16181D]">
              {selectedRepo.visibility || 'Public'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Active status indicator */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            <span>Swarm Active</span>
          </div>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#16181D] border border-[#282C35] text-[#A1A4AC] hover:text-white hover:border-[#3A404D] transition-colors"
          >
            <span>QuantMail</span>
            <span>↗</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. TOP QUANTY AI COMMAND DECK (Chat on top, with quick pills & modes)     */}
      {/* ========================================================================= */}
      <section className="w-full border-b border-[#282C35] bg-[#0E1015] px-4 py-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-3">
          {/* Quick Action Pills Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <span className="text-[11px] font-bold text-[#FF8C42] uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
              <span>⚡</span> Quick
            </span>
            {GIT_QUICK_ACTIONS.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={() => handleQuickAction(act)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#16181D] border border-[#282C35] text-[#D1D5DB] hover:text-white hover:border-[#FF8C42]/60 hover:bg-[#1E222B] shrink-0 transition-all font-medium text-[11px]"
              >
                <span>{act.icon}</span>
                <span>{act.label}</span>
              </button>
            ))}
          </div>

          {/* Sleek Command Input Bar */}
          <form
            onSubmit={handleCommandSubmit}
            className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#16181D] border border-[#282C35] shadow-lg focus-within:border-[#FF8C42]/70 transition-all"
          >
            {/* Connectors button */}
            <button
              type="button"
              onClick={() =>
                showToast('MCP Connectors: Notion, GitHub, LiveKit, Fastify connected.')
              }
              title="Add Context / MCP Connectors"
              className="size-9 rounded-xl grid place-items-center text-[#A1A4AC] hover:text-white hover:bg-[#20242D] shrink-0 transition-colors"
            >
              <span className="text-base font-bold">+</span>
            </button>

            {/* Mode Selector Pill: Plan | Build | Auto */}
            <div className="flex items-center bg-[#0B0C0E] p-0.5 rounded-xl border border-[#282C35] shrink-0">
              {(['plan', 'build', 'auto'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg capitalize transition-all ${
                    mode === m
                      ? 'bg-[#FF8C42] text-black shadow-sm'
                      : 'text-[#A1A4AC] hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Effort Selector: Fast | Deep */}
            <div className="hidden sm:flex items-center bg-[#0B0C0E] p-0.5 rounded-xl border border-[#282C35] shrink-0">
              {(['fast', 'deep'] as const).map((ef) => (
                <button
                  key={ef}
                  type="button"
                  onClick={() => setEffort(ef)}
                  className={`px-2 py-1 text-[10px] font-semibold rounded-lg uppercase tracking-wider transition-all ${
                    effort === ef
                      ? 'bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016]'
                      : 'text-[#717682] hover:text-white'
                  }`}
                >
                  {ef}
                </button>
              ))}
            </div>

            {/* Input */}
            <input
              type="text"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (mascotState === 'idle' && e.target.value.length > 0) {
                  setMascotState('listening');
                }
              }}
              placeholder={`Ask Quanty to ${mode} repository tasks, debug tests, or deploy agents...`}
              className="flex-1 bg-transparent px-2.5 text-xs sm:text-sm text-white placeholder-[#717682] outline-none min-w-0"
            />

            {/* Submit / Run */}
            <button
              type="submit"
              disabled={isStreaming || !prompt.trim()}
              className="size-9 rounded-xl grid place-items-center bg-[#FF8C42] text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#ff9b5a] shrink-0 transition-all shadow-md"
              title="Run Command"
            >
              {isStreaming ? (
                <span className="size-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
              ) : (
                <span>→</span>
              )}
            </button>
          </form>

          {/* Interactive Response Stream Drawer (Collapsible) */}
          {messages.length > 1 && (
            <div className="mt-1 rounded-2xl bg-[#12141A] border border-[#282C35] p-3.5 transition-all text-xs">
              <div className="flex items-center justify-between border-b border-[#282C35]/60 pb-2 mb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#FF8C42]">
                  <span className="size-2 rounded-full bg-[#FF8C42] animate-pulse" />
                  <span>Quanty Response Stream</span>
                </div>
                <button
                  type="button"
                  onClick={() => setResponseExpanded(!responseExpanded)}
                  className="text-[11px] text-[#A1A4AC] hover:text-white underline"
                >
                  {responseExpanded ? 'Collapse' : 'Expand conversation'}
                </button>
              </div>

              {/* Latest message preview */}
              <div className="space-y-2">
                {responseExpanded ? (
                  messages.slice(1).map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-xl ${
                        msg.role === 'user'
                          ? 'bg-[#1A1D24] text-white ml-6'
                          : 'bg-[#16181E] text-slate-200 mr-6 border border-[#282C35]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-[#A1A4AC] mb-1 font-medium">
                        <span className="font-bold text-[#FF8C42]">
                          {msg.role === 'user' ? 'You' : 'Quanty Swarm'}
                        </span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                      {msg.steps && msg.steps.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[#282C35]/40 text-[11px] space-y-1 font-mono text-[#A1A4AC]">
                          {msg.steps.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <span className="text-emerald-400">✓</span>
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-slate-300 truncate text-xs">
                      <span className="font-semibold text-[#FF8C42]">Latest: </span>
                      {messages[messages.length - 1].text}
                    </p>
                    <span className="text-[10px] text-[#A1A4AC] shrink-0 font-mono">
                      {messages[messages.length - 1].timestamp}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. FULL 1:1 GITHUB REPOSITORY WORKSPACE (Directly underneath top deck)   */}
      {/* ========================================================================= */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-5 flex flex-col gap-4">
        {/* Repo Header & Metrics: Stars, Watch, Fork */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#282C35]">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>{selectedRepo.fullName || selectedRepo.name}</span>
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-[#282C35] text-[#A1A4AC] bg-[#16181D]">
                {selectedRepo.visibility || 'Public repository'}
              </span>
            </div>
            <p className="text-xs text-[#A1A4AC] mt-1">
              {selectedRepo.description ||
                'Next-gen sovereign enterprise platform, autonomous AI swarm & Git hub.'}
            </p>
          </div>

          {/* GitHub Watch, Fork, Star Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => showToast('Notification watch preference saved.')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#16181D] border border-[#282C35] text-[#D1D5DB] hover:bg-[#20242D] hover:text-white transition-colors"
            >
              <span>👁 Watch</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#0B0C0E] text-[10px] text-[#A1A4AC] border border-[#282C35]">
                {selectedRepo.watching || 12}
              </span>
            </button>

            <button
              type="button"
              onClick={() => showToast('Fork repository flow initialized.')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#16181D] border border-[#282C35] text-[#D1D5DB] hover:bg-[#20242D] hover:text-white transition-colors"
            >
              <span>⑂ Fork</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#0B0C0E] text-[10px] text-[#A1A4AC] border border-[#282C35]">
                {selectedRepo.forks || 24}
              </span>
            </button>

            <button
              type="button"
              onClick={() => showToast('Starred quantrinitylab/Quant-Ecosystem! ⭐')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#16181D] border border-[#282C35] text-[#FF8C42] hover:bg-[#20242D] transition-colors shadow-sm"
            >
              <span>★ Star</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#0B0C0E] text-[10px] text-white border border-[#282C35]">
                {selectedRepo.stars || 128}
              </span>
            </button>
          </div>
        </div>

        {/* 5 GitHub Sub-Navigation Tabs: Code | Issues | Pull requests | Agents | Actions */}
        <div className="flex items-center gap-1 border-b border-[#282C35] overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'code'
                ? 'border-[#FF8C42] text-white'
                : 'border-transparent text-[#A1A4AC] hover:text-white'
            }`}
          >
            <span>&lt;&gt;</span>
            <span>Code</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('issues')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'issues'
                ? 'border-[#FF8C42] text-white'
                : 'border-transparent text-[#A1A4AC] hover:text-white'
            }`}
          >
            <span>⨀</span>
            <span>Issues</span>
            <span className="px-1.5 py-0.2 rounded-full bg-[#1C1F26] text-[10px] text-[#A1A4AC]">
              {issues.filter((i) => i.state === 'open').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pulls')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'pulls'
                ? 'border-[#FF8C42] text-white'
                : 'border-transparent text-[#A1A4AC] hover:text-white'
            }`}
          >
            <span>⑂</span>
            <span>Pull requests</span>
            <span className="px-1.5 py-0.2 rounded-full bg-[#1C1F26] text-[10px] text-[#A1A4AC]">
              {pullRequests.filter((p) => p.state === 'open').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'agents'
                ? 'border-[#FF8C42] text-white'
                : 'border-transparent text-[#A1A4AC] hover:text-white'
            }`}
          >
            <span>✨</span>
            <span>Agents</span>
            <span className="px-1.5 py-0.2 rounded-full bg-blue-950/80 text-blue-400 border border-blue-800/50 text-[10px]">
              Copilot
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'actions'
                ? 'border-[#FF8C42] text-white'
                : 'border-transparent text-[#A1A4AC] hover:text-white'
            }`}
          >
            <span>▶</span>
            <span>Actions</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: CODE WORKSPACE (1:1 GitHub Layout)                                 */}
        {/* ========================================================================= */}
        {activeTab === 'code' && (
          <div className="space-y-4">
            {/* Top Code Control Row: Branch Selector + File search + <> Code Clone Dropdown */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 relative">
                {/* Branch Switcher Button */}
                <button
                  type="button"
                  onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#16181D] border border-[#282C35] text-xs font-bold text-white hover:bg-[#20242D] transition-colors"
                >
                  <span className="text-[#A1A4AC]">⑂</span>
                  <span>{currentBranch}</span>
                  <span className="text-[10px] text-[#A1A4AC]">▼</span>
                </button>

                {isBranchDropdownOpen && (
                  <div className="absolute left-0 top-10 z-50 w-56 rounded-xl bg-[#16181D] border border-[#282C35] shadow-2xl p-2 text-xs space-y-1">
                    <div className="px-2 py-1 text-[11px] font-bold text-[#A1A4AC] border-b border-[#282C35]">
                      Switch branches / tags
                    </div>
                    {['main', 'staging', 'feature/quantgit-parity'].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          setCurrentBranch(b);
                          setIsBranchDropdownOpen(false);
                          showToast(`Switched to branch ${b}`);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between font-mono ${
                          currentBranch === b
                            ? 'bg-[#2B1A11] text-[#FF8C42] font-bold'
                            : 'text-[#D1D5DB] hover:bg-[#20242D]'
                        }`}
                      >
                        <span>{b}</span>
                        {currentBranch === b && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-[#A1A4AC] ml-1 font-semibold">
                  <span>348 branches</span>
                  <span>•</span>
                  <span>2 tags</span>
                </div>
              </div>

              {/* Code Clone Button & Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCodeDropdownOpen(!isCodeDropdownOpen)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-bold transition-all shadow-md"
                >
                  <span>&lt;&gt; Code</span>
                  <span className="text-[9px]">▼</span>
                </button>

                {isCodeDropdownOpen && (
                  <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl bg-[#16181D] border border-[#282C35] shadow-2xl p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-[#282C35] pb-2">
                      <span className="font-bold text-white">Clone repository</span>
                      <button
                        type="button"
                        onClick={() => setIsCodeDropdownOpen(false)}
                        className="text-[#A1A4AC] hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Protocol Tabs */}
                    <div className="flex items-center bg-[#0B0C0E] p-0.5 rounded-lg border border-[#282C35]">
                      {(['https', 'ssh', 'cli'] as const).map((proto) => (
                        <button
                          key={proto}
                          type="button"
                          onClick={() => setCloneProto(proto)}
                          className={`flex-1 py-1 text-[11px] font-bold rounded uppercase transition-all ${
                            cloneProto === proto
                              ? 'bg-[#2B1A11] text-[#FF8C42]'
                              : 'text-[#A1A4AC] hover:text-white'
                          }`}
                        >
                          {proto}
                        </button>
                      ))}
                    </div>

                    {/* Clone URL Input with Copy */}
                    <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-[#0B0C0E] border border-[#282C35]">
                      <input
                        type="text"
                        readOnly
                        value={cloneString}
                        className="flex-1 bg-transparent px-2 text-[11px] font-mono text-slate-200 outline-none truncate"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyClone(cloneString)}
                        className="px-2.5 py-1 rounded-lg bg-[#FF8C42] text-black font-bold text-[11px] hover:bg-[#ff9b5a] transition-colors shrink-0"
                      >
                        {copiedClone ? 'Copied!' : 'Copy'}
                      </button>
                    </div>

                    <div className="pt-1 space-y-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => showToast('Opening GitHub Desktop...')}
                        className="w-full text-left py-1 text-[#D1D5DB] hover:text-white flex items-center gap-2"
                      >
                        <span>💻</span>
                        <span>Open with GitHub Desktop</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast('Downloading repository ZIP archive...')}
                        className="w-full text-left py-1 text-[#D1D5DB] hover:text-white flex items-center gap-2"
                      >
                        <span>📦</span>
                        <span>Download ZIP</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Commit Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-t-xl bg-[#16181D] border border-[#282C35] text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Author Avatars */}
                <div className="flex -space-x-1.5 shrink-0">
                  <div className="size-6 rounded-full bg-[#FF8C42] text-black text-[10px] font-bold grid place-items-center border-2 border-[#16181D]">
                    K
                  </div>
                  <div className="size-6 rounded-full bg-[#3b82f6] text-white text-[10px] font-bold grid place-items-center border-2 border-[#16181D]">
                    A
                  </div>
                </div>

                <span className="font-bold text-white shrink-0">quantrinitylab</span>
                <span className="text-slate-300 truncate font-medium">
                  {selectedRepo.latestCommit ||
                    'feat(quantgit): top command deck, eye-less bubble mascot & 1:1 github repository parity'}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#A1A4AC] font-mono shrink-0">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span>✓</span>
                  <span>Verified</span>
                </span>
                <span className="hover:underline cursor-pointer text-slate-300 font-bold">
                  {selectedRepo.latestCommitSha || '3c12703'}
                </span>
                <span>•</span>
                <span>{selectedRepo.latestCommitTime || '7 hours ago'}</span>
                <button
                  type="button"
                  onClick={() => showToast('Loaded full commit log (2,116 commits).')}
                  className="text-[11px] font-sans font-bold text-[#FF8C42] hover:underline flex items-center gap-1 ml-1"
                >
                  <span>2,116 Commits</span>
                </button>
              </div>
            </div>

            {/* File & Folder Tree Table */}
            <div className="rounded-b-xl border-x border-b border-[#282C35] bg-[#0E1015] divide-y divide-[#282C35]/60 overflow-hidden text-xs">
              {MOCK_FILES.map((file) => (
                <div
                  key={file.name}
                  onClick={() => {
                    if (file.type === 'file') {
                      setViewingFile({
                        name: file.name,
                        content: file.content || '',
                        language: file.language || 'text',
                      });
                    } else {
                      showToast(`Navigated into ${file.name}/ folder.`);
                    }
                  }}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[#16181D] cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 w-1/3">
                    <span className="text-base shrink-0">
                      {file.type === 'folder' ? '📁' : '📄'}
                    </span>
                    <span className="font-semibold text-white group-hover:text-[#FF8C42] truncate">
                      {file.name}
                    </span>
                  </div>

                  <div className="flex-1 text-[#A1A4AC] truncate pr-4 text-[11px]">
                    {file.message}
                  </div>

                  <div className="text-[11px] text-[#717682] font-mono shrink-0">
                    {file.timeAgo}
                  </div>
                </div>
              ))}
            </div>

            {/* README.md Preview Container (GitHub 1:1) */}
            <div className="rounded-2xl border border-[#282C35] bg-[#16181D] overflow-hidden mt-6">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#282C35] bg-[#111318] text-xs">
                <div className="flex items-center gap-2 font-bold text-white">
                  <span>📄</span>
                  <span>README.md</span>
                </div>
                <div className="text-[11px] text-[#A1A4AC]">Markdown Preview</div>
              </div>

              <div className="p-6 space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <span className="px-2.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-mono text-[10px] font-bold">
                    build: passing
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-blue-950/60 border border-blue-800/60 text-blue-400 font-mono text-[10px] font-bold">
                    license: MIT
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42] font-mono text-[10px] font-bold">
                    swarm: 8+ agents
                  </span>
                </div>

                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  Quant Ecosystem — The Next NVIDIA of Software
                </h2>

                <p>
                  A unified sovereign operating ecosystem built for high-performance computing,
                  intelligent mail triage, autonomous agentic development, and real git
                  collaboration.
                </p>

                <div className="p-4 rounded-xl bg-[#0B0C0E] border border-[#282C35] font-mono text-xs text-[#FF8C42] space-y-1">
                  <p># Clone the unified monorepo</p>
                  <p className="text-white">
                    git clone https://github.com/quantrinitylab/Quant-Ecosystem.git
                  </p>
                  <p># Install dependencies and start development</p>
                  <p className="text-white">pnpm install &amp;&amp; pnpm dev</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ISSUES (GitHub 1:1 Parity)                                         */}
        {/* ========================================================================= */}
        {activeTab === 'issues' && (
          <div className="space-y-4">
            {/* Search filter & New Issue Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={issueSearch}
                  onChange={(e) => setIssueSearch(e.target.value)}
                  placeholder="Search all issues..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[#16181D] border border-[#282C35] text-white placeholder-[#717682] outline-none focus:border-[#FF8C42]"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#717682]">
                  🔍
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center bg-[#16181D] p-0.5 rounded-xl border border-[#282C35]">
                  <button
                    type="button"
                    onClick={() => setIssueFilter('open')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg ${
                      issueFilter === 'open'
                        ? 'bg-[#2B1A11] text-[#FF8C42]'
                        : 'text-[#A1A4AC] hover:text-white'
                    }`}
                  >
                    {issues.filter((i) => i.state === 'open').length} Open
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueFilter('closed')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg ${
                      issueFilter === 'closed'
                        ? 'bg-[#2B1A11] text-[#FF8C42]'
                        : 'text-[#A1A4AC] hover:text-white'
                    }`}
                  >
                    182 Closed
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsNewIssueModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-bold transition-all shadow-md"
                >
                  New issue
                </button>
              </div>
            </div>

            {/* Issues List Container */}
            <div className="rounded-2xl border border-[#282C35] bg-[#0E1015] divide-y divide-[#282C35]/60 overflow-hidden text-xs">
              {filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="p-4 hover:bg-[#16181D] transition-colors flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-emerald-400 font-bold mt-0.5">⨀</span>
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white hover:text-[#FF8C42] cursor-pointer">
                          {issue.title}
                        </span>
                        {issue.labels.map((lbl) => (
                          <span
                            key={lbl.name}
                            className="text-[10px] font-bold px-2 py-0.2 rounded-full border border-white/10 text-white"
                            style={{ backgroundColor: `${lbl.color}33`, borderColor: lbl.color }}
                          >
                            {lbl.name}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-[#A1A4AC]">
                        #{issue.id} opened {issue.createdAt} by{' '}
                        <span className="font-semibold text-slate-300">{issue.author}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[#A1A4AC] text-[11px] shrink-0 font-medium">
                    <span>💬</span>
                    <span>{issue.commentsCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PULL REQUESTS (GitHub 1:1 Parity)                                   */}
        {/* ========================================================================= */}
        {activeTab === 'pulls' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={prSearch}
                  onChange={(e) => setPrSearch(e.target.value)}
                  placeholder="Search all pull requests..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[#16181D] border border-[#282C35] text-white placeholder-[#717682] outline-none focus:border-[#FF8C42]"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#717682]">
                  🔍
                </span>
              </div>

              <div className="flex items-center bg-[#16181D] p-0.5 rounded-xl border border-[#282C35] shrink-0">
                <button
                  type="button"
                  onClick={() => setPrFilter('open')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg ${
                    prFilter === 'open'
                      ? 'bg-[#2B1A11] text-[#FF8C42]'
                      : 'text-[#A1A4AC] hover:text-white'
                  }`}
                >
                  {pullRequests.filter((p) => p.state === 'open').length} Open
                </button>
                <button
                  type="button"
                  onClick={() => setPrFilter('closed')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg ${
                    prFilter === 'closed'
                      ? 'bg-[#2B1A11] text-[#FF8C42]'
                      : 'text-[#A1A4AC] hover:text-white'
                  }`}
                >
                  248 Closed
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#282C35] bg-[#0E1015] divide-y divide-[#282C35]/60 overflow-hidden text-xs">
              {filteredPRs.map((pr) => (
                <div
                  key={pr.id}
                  className="p-4 hover:bg-[#16181D] transition-colors flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-purple-400 font-bold mt-0.5">⑂</span>
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white hover:text-[#FF8C42] cursor-pointer">
                          {pr.title}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[#1C1F26] text-[#A1A4AC]">
                          {pr.branchTarget} &larr; {pr.branchSource}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A1A4AC]">
                        #{pr.id} by{' '}
                        <span className="font-semibold text-slate-300">{pr.author}</span> •{' '}
                        {pr.createdAt}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-[11px]">
                    <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono">
                      <span>✓</span>
                      <span>checks passed</span>
                    </span>
                    <span className="text-[#A1A4AC]">💬 {pr.commentsCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: AGENTS (GitHub Copilot Agent Parity)                                */}
        {/* ========================================================================= */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Autonomous Swarm Fleet</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF8C42]/20 text-[#FF8C42] border border-[#FF8C42]/40 font-mono">
                    {deployedAgents.length} Active
                  </span>
                </h2>
                <p className="text-xs text-[#A1A4AC] mt-0.5">
                  Copilot agents perform deep architectural reviews, run test sweeps, and build
                  code.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDeployModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-[#FF8C42] hover:bg-[#ff9b5a] text-black text-xs font-bold transition-all shadow-md self-start sm:self-auto"
              >
                + Deploy Agent
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {deployedAgents.map((ag) => (
                <div
                  key={ag.id}
                  className="p-4 rounded-2xl bg-[#16181D] border border-[#282C35] hover:border-[#3A404D] transition-all flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="size-8 rounded-xl font-bold text-sm grid place-items-center text-black"
                          style={{ backgroundColor: ag.color }}
                        >
                          {ag.initial}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{ag.name}</h3>
                          <span className="text-[10px] font-mono text-[#A1A4AC]">{ag.pod}</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-bold capitalize">
                        {ag.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#FF8C42] font-medium">{ag.role}</p>
                    <p className="text-[11px] text-slate-300 leading-snug">{ag.currentTask}</p>

                    {ag.thoughts && (
                      <div className="p-2 rounded-lg bg-[#0B0C0E] border border-[#282C35] text-[10px] text-[#A1A4AC] font-mono leading-relaxed">
                        <span className="text-slate-400 font-bold block mb-0.5">Thought:</span>
                        {ag.thoughts}
                      </div>
                    )}
                  </div>

                  {ag.steps && ag.steps.length > 0 && (
                    <div className="pt-2 border-t border-[#282C35]/60 text-[10px] text-emerald-400 font-mono space-y-0.5">
                      {ag.steps.slice(-2).map((s, idx) => (
                        <div key={idx} className="flex items-center gap-1 truncate">
                          <span>✓</span>
                          <span className="text-slate-300 truncate">{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-[#0B0C0E] border border-[#282C35] text-center text-[11px] text-[#717682]">
              Quanty uses AI swarm intelligence. Check outputs for complete factual accuracy.
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: ACTIONS (GitHub Actions 1:1 Parity)                                 */}
        {/* ========================================================================= */}
        {activeTab === 'actions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">Workflows &amp; CI/CD Runs</h2>
                <p className="text-xs text-[#A1A4AC] mt-0.5">
                  Real-time pipeline results from GitHub Actions.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => showToast('Triggered deploy-staging.yml manually.')}
                  className="px-3 py-1.5 rounded-xl bg-[#16181D] border border-[#282C35] text-xs font-bold text-white hover:bg-[#20242D] transition-colors"
                >
                  Run workflow
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#282C35] bg-[#0E1015] divide-y divide-[#282C35]/60 overflow-hidden text-xs">
              {workflowRuns.map((run) => (
                <div
                  key={run.id}
                  className="p-4 hover:bg-[#16181D] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="size-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold grid place-items-center text-xs shrink-0">
                      ✓
                    </span>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white hover:text-[#FF8C42] cursor-pointer truncate">
                          {run.name}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[#1C1F26] text-[#A1A4AC]">
                          {run.workflow}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A1A4AC]">
                        #{run.id} pushed to{' '}
                        <span className="font-mono font-bold text-slate-300">{run.branch}</span> •{' '}
                        {run.commitSha} • {run.timeAgo}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#A1A4AC] font-mono shrink-0">
                    <span>⏱ {run.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS: File Viewer, New Issue, Deploy Agent, Toast                    */}
      {/* ========================================================================= */}

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#16181D] border border-[#282C35] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#282C35] bg-[#111318]">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <span>📄</span>
                <span>{viewingFile.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0B0C0E] text-[#FF8C42] uppercase">
                  {viewingFile.language}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingFile(null)}
                className="size-7 rounded-lg grid place-items-center text-[#A1A4AC] hover:text-white hover:bg-[#20242D]"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-slate-200 bg-[#0B0C0E] whitespace-pre-wrap leading-relaxed">
              {viewingFile.content}
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#282C35] bg-[#111318] text-xs">
              <span className="text-[#A1A4AC]">Read-only preview</span>
              <button
                type="button"
                onClick={() => {
                  handleCopyClone(viewingFile.content);
                  showToast('Copied file contents!');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#FF8C42] text-black font-bold hover:bg-[#ff9b5a] transition-colors"
              >
                Copy Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Issue Modal */}
      {isNewIssueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#16181D] border border-[#282C35] shadow-2xl p-5 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#282C35] pb-3">
              <h3 className="text-base font-bold text-white">Create New Issue</h3>
              <button
                type="button"
                onClick={() => setIsNewIssueModalOpen(false)}
                className="text-[#A1A4AC] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIssue} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#A1A4AC] mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newIssueTitle}
                  onChange={(e) => setNewIssueTitle(e.target.value)}
                  placeholder="Title or summary of issue..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[#0B0C0E] border border-[#282C35] text-white outline-none focus:border-[#FF8C42]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#A1A4AC] mb-1">Description</label>
                <textarea
                  rows={4}
                  value={newIssueBody}
                  onChange={(e) => setNewIssueBody(e.target.value)}
                  placeholder="Steps to reproduce, expected behavior, or context..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[#0B0C0E] border border-[#282C35] text-white outline-none focus:border-[#FF8C42] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewIssueModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-[#282C35] text-xs font-semibold text-[#A1A4AC] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-bold transition-all shadow-md"
                >
                  Submit issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deploy Agent Modal */}
      {isDeployModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg max-h-[80vh] rounded-2xl bg-[#16181D] border border-[#282C35] shadow-2xl p-5 flex flex-col overflow-hidden animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#282C35] pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Deploy Swarm Agent</h3>
                <p className="text-xs text-[#A1A4AC] mt-0.5">
                  Select an autonomous agent to assign to {selectedRepo.name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeployModalOpen(false)}
                className="text-[#A1A4AC] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 py-3 pr-1">
              {AGENT_FLEET_CATALOG.map((ag) => (
                <div
                  key={ag.id}
                  className="p-3 rounded-xl bg-[#0B0C0E] border border-[#282C35] hover:border-[#FF8C42]/50 transition-all flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="size-8 rounded-lg font-bold text-sm grid place-items-center text-black shrink-0"
                      style={{ backgroundColor: ag.color }}
                    >
                      {ag.initial}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-white">{ag.name}</h4>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#1C1F26] text-[#A1A4AC]">
                          {ag.pod}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#FF8C42] font-medium">{ag.role}</p>
                      <p className="text-[10px] text-[#A1A4AC] mt-0.5">{ag.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeployAgent(ag)}
                    className="px-3 py-1.5 rounded-lg bg-[#FF8C42] text-black font-bold text-xs hover:bg-[#ff9b5a] transition-colors shrink-0"
                  >
                    Deploy
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42] text-xs font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-3">
          {toastMessage}
        </div>
      )}
    </main>
  );
}
