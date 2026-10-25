'use client';

// ============================================================================
// QuantGit — Sovereign Operating Workspace Coordinator
// Modularized Architecture: Tabs, Modals, Header & Copilot decoupled.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import type { FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../providers/auth-provider';
import { browserAuthSession } from '../../services/browser-auth-session';
import { AgentOfficeCanvas, type OfficeAgent } from '../../components/AgentOfficeCanvas';
import type { CommitBlobInput } from '../../components/BlobEditor';
import {
  navigateQuantGit,
  parseQuantGitRoute,
  subscribeToQuantGitRoute,
  type QuantGitRoute,
} from '../../lib/quantgit-route';
import { mapTreeItemToFileNode } from './lib/map-tree-item';

import type {
  MainDeckTab,
  GitHubTab,
  BuildMode,
  Effort,
  Repo,
  FileNode,
  IssueItem,
  PRItem,
  DiscussionItem,
  WorkflowRunItem,
  ProjectCard,
  SecurityAlert,
  DeployedAgent,
  ToolExecutionCard,
  ChatMessage,
  ModalState,
  ChatSession,
  AccessoryType,
  AIModelId,
  NotionMode,
  ContextSubmenu,
  SettingsSubmenu,
  IssueCommentItem,
  CommitItem,
  BranchItem,
} from './types';


import { QuantGitHeader } from './components/QuantGitHeader';
import { AppShell } from '../../components/AppShell';
import { emitQuantGitMascotEvent } from '../../components/marks/quantgit-mascot-events';
import { AppSidebar } from '../../components/AppSidebar';
import { CodeTab } from './components/CodeTab';
import { CommitsTab } from './components/CommitsTab';
import { mapBackendCommitToItem } from './components/mapBackendCommit';
import { mapBackendBranchToItem } from './components/mapBackendBranch';
import { BranchesTab } from './components/BranchesTab';
import { IssuesTab } from './components/IssuesTab';
import { PullRequestsTab } from './components/PullRequestsTab';
import { interpretMergeResult, mergeFailureToast } from './mergeOutcome';
import { resolveBlobLoadOutcome } from './blobLoadOutcome';
import { assertBranchCreated, BranchExistsError } from './branchCreate';
import { assertCommitResponse, toCommitFailure } from './commitBlob';
import {
  headShaFromBlobPayload,
  newBranchBaseSha,
  toParentShaParam,
} from './blobHeadSha';
import { AgentsTab } from './components/AgentsTab';
import { DiscussionsTab } from './components/DiscussionsTab';
import { ActionsTab } from './components/ActionsTab';
import { ProjectsTab } from './components/ProjectsTab';
import { SecurityTab } from './components/SecurityTab';
import { InsightsTab } from './components/InsightsTab';
import { SettingsTab } from './components/SettingsTab';
import { QuantyCopilotView } from './components/QuantyCopilotView';
import { QuantGitModals } from './components/QuantGitModals';
import { MCPRegistryTab, OFFICIAL_MCP_CATALOG } from './components/MCPRegistryTab';
import { CopilotFleetModeView } from './components/CopilotFleetModeView';
import { DeveloperAppearanceSettings } from './components/DeveloperAppearanceSettings';
import { NotificationsInbox } from './components/NotificationsInbox';
import { RepoImportModal } from './components/RepoImportModal';
import { formatCommitToast } from './components/formatCommitToast';
import {
  QuantGitSubViews,
  type ContextSubViewTab,
  type RepositoryItem,
  type PullRequestItem,
  type IssueTrackItem,
  type WorkflowRun,
} from './components/QuantGitSubViews';

function QuantGitContent() {  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  const initialSubTab: ContextSubViewTab =
    tabParam && ['feed', 'repos', 'prs', 'issues', 'actions', 'copilot'].includes(tabParam)
      ? (tabParam as ContextSubViewTab)
      : 'repos';

  const [activeContextSubTab, setActiveContextSubTab] = useState<ContextSubViewTab>(initialSubTab);

  // Sync with ?tab=... query param
  useEffect(() => {
    if (tabParam && ['feed', 'repos', 'prs', 'issues', 'actions', 'copilot'].includes(tabParam)) {
      setActiveContextSubTab(tabParam as ContextSubViewTab);
      if (tabParam !== 'repos') {
        setSelectedRepo(null);
      }
    }
  }, [tabParam]);

  // Re-tap active app tab → refresh QuantGit view (P1: app-switcher refresh).
  // QuantGit repos load LIVE from the Prisma-backed /api/repos endpoint
  // (fetchRepos maps the response to Repo[] and re-fetches each sub-view
  // from its own /api/repos/:id/... route); an empty or failed response
  // degrades to the honest "No repositories yet" empty state — nothing is
  // seeded from static/mock data. Re-tap resets to the repos tab and scrolls
  // to top as visible acknowledgment.
  useEffect(() => {
    const handleRefresh = () => {
      setActiveContextSubTab('repos');
      setSelectedRepo(null);
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('quant:refresh', handleRefresh);
    return () => window.removeEventListener('quant:refresh', handleRefresh);
  }, []);

  // Synchronize with custom events from the shell's MobileSubTabStrip
  useEffect(() => {
    const handleSubTabChange = (e: Event) => {
      const custom = e as CustomEvent<{ pillar?: string; tabId?: string }>;
      if (custom.detail?.pillar === 'quantgit' && custom.detail?.tabId) {
        const tabId = custom.detail.tabId as ContextSubViewTab;
        if (['feed', 'repos', 'prs', 'issues', 'actions', 'copilot'].includes(tabId)) {
          setActiveContextSubTab(tabId);
          if (tabId !== 'repos') {
            setSelectedRepo(null);
          }
        }
      }
    };

    const handleCopilotOpen = () => {
      setActiveContextSubTab('copilot');
      setSelectedRepo(null);
    };

    window.addEventListener('quant:subtab-change', handleSubTabChange);
    window.addEventListener('quant:copilot:open', handleCopilotOpen);

    return () => {
      window.removeEventListener('quant:subtab-change', handleSubTabChange);
      window.removeEventListener('quant:copilot:open', handleCopilotOpen);
    };
  }, []);

  // Navigation & Deck State
  const { user } = useAuth();
  const currentUsername =
    user?.username || (user?.email ? user.email.split('@')[0] : '');
  const [activeDeckTab, setActiveDeckTab] = useState<MainDeckTab>('repos');
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [activeGitHubTab, setActiveGitHubTab] = useState<GitHubTab>('code');
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  // QM-SCREEN-013: "Browse code at commit" — the file-tree ref currently being
  // browsed as a detached commit SHA. When set, the code tab's workspace view
  // shows the tree at this commit instead of the branch head. Cleared whenever
  // the user picks a branch or opens another repository.
  const [browsingCommitSha, setBrowsingCommitSha] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [viewingFile, setViewingFile] = useState<FileNode | null>(null);
  /*
   * Optimistic-concurrency token for the blob editor: the commit SHA the
   * open file was read at (backend `headSha`, resolved from the browsed
   * ref). Sent as `parentSha` on commit; the backend 409s when the branch
   * head moved since the read. This is a COMMIT sha, never the blob
   * (content) hash and never the raw ref string — both of those made every
   * blob-editor commit fail (400/409).
   */
  const [viewingHeadSha, setViewingHeadSha] = useState('');
  const [pendingRoute, setPendingRoute] = useState<QuantGitRoute | null>(null);
  const [routeHydrated, setRouteHydrated] = useState(false);
  const [selectedOfficeAgent, setSelectedOfficeAgent] = useState<DeployedAgent | null>(null);
  const [isCopilotDrawerOpen, setIsCopilotDrawerOpen] = useState(false);

  // Notion AI & Quanty Studio State
  const [activeModel, setActiveModel] = useState<AIModelId>('opus-5');
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({
    'msg-1': true,
  });
  const [activeSessionId, setActiveSessionId] = useState('');
  // QM-SCREEN-013 R3 P1: the copilot session list starts EMPTY — the four
  // fabricated sessions below were invented theater, rendered as if they were
  // the user's real history. Sessions only ever appear here after the user
  // actually chats. Honest empty copy lives in QuantGitHeader.
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

  // Notion AI Submenus & Personalization States
  const [activeSettingsSubmenu, setActiveSettingsSubmenu] = useState<SettingsSubmenu>('none');
  const [activeContextSubmenu, setActiveContextSubmenu] = useState<ContextSubmenu>('none');
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);
  const [quantyName, setQuantyName] = useState('Quanty');
  const [quantyInstructions, setQuantyInstructions] = useState('');
  // QM-SCREEN-013 P2: restore personalization saved to browser-local storage
  // by the Personalize modal. Read in an effect (not the state initializer)
  // so the server-rendered HTML matches on hydration.
  useEffect(() => {
    try {
      const savedName = localStorage.getItem('quantgit.quantyName');
      if (savedName) setQuantyName(savedName);
      const savedInstructions = localStorage.getItem('quantgit.quantyInstructions');
      if (savedInstructions != null) setQuantyInstructions(savedInstructions);
    } catch {
      // Storage unavailable (private mode, etc.) — defaults stand.
    }
  }, []);
  const [selectedAccessory, setSelectedAccessory] = useState<AccessoryType>('none');
  const [enableWorkersBeta, setEnableWorkersBeta] = useState(true);
  const [sourcesState, setSourcesState] = useState<Record<string, boolean>>({
    all: true,
    dev6: true,
    helpCenter: true,
    webAccess: true,
  });
  const [mcpServers, setMcpServers] = useState<string[]>(['Cloudflare', 'GitHub']);
  const [notionMode, setNotionMode] = useState<NotionMode>('default');
  const [skillsSearch, setSkillsSearch] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [repoFileSearch, setRepoFileSearch] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  // QM-SCREEN-013 R3 P1: no fabricated sessions pinned — pinned list starts
  // empty like the session list itself.
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>([]);
  // QM-SCREEN-013 R3 P2: skills are a not-yet-available roadmap — toggles
  // default OFF, never ON for capabilities that are not wired up.
  const [activeSkills, setActiveSkills] = useState<Record<string, boolean>>({
    'Git Smart HTTP Engine': false,
    'Monorepo AST Parser': false,
    'Vitest QA Sentinel': false,
    'LiveKit WebRTC Gateway': false,
    'Redis 3-Layer Memory': false,
    'Prisma Schema Auditor': false,
  });

  // Data Collections
  const [baseRepos, setBaseRepos] = useState<Repo[]>([]);
  const repos = useMemo(() => {
    return baseRepos.map((r) => ({
      ...r,
      fullName: `${currentUsername}/${r.name}`,
    }));
  }, [baseRepos, currentUsername]);

  const [files, setFiles] = useState<FileNode[]>([]);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [pulls, setPulls] = useState<PRItem[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([]);
  const [actions, setActions] = useState<WorkflowRunItem[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [agents, setAgents] = useState<DeployedAgent[]>([]);

  // QM-SCREEN-013 R3 P1: wire the REAL fetched data into the landing
  // sub-views (repos / prs / issues / actions tabs). These states are the
  // backend's truth — the sub-views keep their honest empty states whenever
  // an array is genuinely empty.
  const LANGUAGE_COLORS: Record<string, string> = {
    TypeScript: '#3178C6',
    JavaScript: '#F1E05A',
    Python: '#3572A5',
    Java: '#B07219',
    Go: '#00ADD8',
    Rust: '#DEA584',
    'C++': '#F34B7D',
    C: '#555555',
    'C#': '#178600',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    HTML: '#E34C26',
    CSS: '#563D7C',
    Shell: '#89E051',
    Dockerfile: '#384D54',
    Vue: '#41B883',
    Prisma: '#0C344B',
  };

  const landingRepos: RepositoryItem[] = useMemo(() => {
    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.fullName,
      description: r.description || '',
      language: r.language || '',
      languageColor: LANGUAGE_COLORS[r.language] ?? '#8B949E',
      stars: r.stars,
      forks: r.forks,
      // Per-branch protection is not fetched for the landing list, so we
      // never claim a branch is protected here.
      branches: (r.branches && r.branches.length > 0 ? r.branches : [r.defaultBranch]).map(
        (name) => ({ name, isProtected: false }),
      ),
      defaultBranch: r.defaultBranch,
      isPrivate: r.visibility === 'private',
      updatedAt: r.latestCommitTime || '',
    }));
  }, [repos]);

  const landingPrs: PullRequestItem[] = useMemo(() => {
    return pulls.map((p) => {
      const status: PullRequestItem['status'] =
        p.state === 'merged'
          ? 'merged'
          : p.state === 'closed'
            ? 'closed'
            : p.checksStatus === 'passing'
              ? 'ci_passing'
              : 'review_in_progress';
      const statusText =
        p.state === 'merged'
          ? 'Merged'
          : p.state === 'closed'
            ? 'Closed'
            : p.checksStatus === 'passing'
              ? 'CI passing'
              : p.checksStatus === 'failing'
                ? 'Checks failing'
                : p.checksStatus === 'pending'
                  ? 'Checks pending'
                  : 'Open';
      return {
        id: String(p.id),
        prNumber: p.id,
        title: p.title,
        author: p.author,
        sourceBranch: p.branchSource,
        targetBranch: p.branchTarget,
        status,
        statusText,
        diffStats: {
          additions: p.additions ?? 0,
          deletions: p.deletions ?? 0,
          filesChanged: p.changedFiles ?? 0,
        },
        labels: [] as string[],
        createdAt: p.createdAt,
      };
    });
  }, [pulls]);

  const landingIssues: IssueTrackItem[] = useMemo(() => {
    return issues.map((i) => ({
      id: String(i.id),
      issueNumber: i.id,
      title: i.title,
      // The Issue model has no priority field — leave unset rather than
      // invent a priority badge.
      labels: i.labels.map((l) => l.name),
      state: i.state,
      author: i.author,
      createdAt: i.createdAt,
      commentsCount: i.commentsCount,
    }));
  }, [issues]);

  const landingWorkflows: WorkflowRun[] = useMemo(() => {
    return actions.map((a) => {
      const status: WorkflowRun['status'] =
        a.status === 'success' || (a.status === 'completed' && a.conclusion === 'success')
          ? 'success'
          : a.status === 'failed' || (a.status === 'completed' && a.conclusion === 'failure')
            ? 'failed'
            : a.status === 'queued'
              ? 'queued'
              : 'running';
      return {
        id: String(a.id),
        name: a.name,
        branch: a.branch,
        status,
        duration: a.duration,
        commitSha: a.commitSha,
        author: a.actor ?? '',
        triggerEvent: a.event,
        jobs: a.jobs.map((j, idx) => ({
          id: `${a.id}-job-${idx}`,
          name: j.name,
          status: (
            j.status === 'success'
              ? 'pass'
              : j.status === 'failed'
                ? 'fail'
                : j.status === 'in_progress'
                  ? 'running'
                  : 'queued'
          ) as 'pass' | 'fail' | 'running' | 'queued',
          duration: j.duration,
        })),
        createdAt: a.createdAt ?? '',
      };
    });
  }, [actions]);

  // Modals & Drawers
  const [modalState, setModalState] = useState<ModalState>('none');
  const [selectedActionRun, setSelectedActionRun] = useState<WorkflowRunItem | null>(null);
  const [selectedPr, setSelectedPr] = useState<PRItem | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [issueComments, setIssueComments] = useState<IssueCommentItem[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [repoBranches, setRepoBranches] = useState<string[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [detailedBranches, setDetailedBranches] = useState<BranchItem[]>([]);
  /*
   * Head commit SHA of the currently selected branch, for CodeTab's inline
   * editor / upload / delete commit inputs (`expectedHeadSha` →
   * `parentSha`). Sourced from the branches endpoint's per-branch sha, with
   * the default-branch projection as fallback. Null when unknown — the
   * commit then degrades to the backend's honest 409 instead of sending a
   * blob hash or ref string that can never validate.
   */
  const currentBranchHeadSha = useMemo(() => {
    const match = detailedBranches.find((b) => b.name === currentBranch);
    if (match?.sha) return match.sha;
    if (
      currentBranch &&
      selectedRepo &&
      currentBranch === selectedRepo.defaultBranch &&
      selectedRepo.latestCommitSha
    ) {
      return selectedRepo.latestCommitSha;
    }
    return null;
  }, [detailedBranches, currentBranch, selectedRepo]);
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
      // A newly opened repository always starts at its branch head.
      setBrowsingCommitSha(null);

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
    setViewingHeadSha('');

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
        // QM-SCREEN-013: when browsing at a commit, load the blob at that
        // commit. The backend GET /:id/file reads `ref` (git accepts a SHA
        // tree-ish); sending `ref` also makes branch-accurate reads correct.
        const query = new URLSearchParams({
          ref: browsingCommitSha ?? branch,
          path: file.path,
        });
        const response = await apiFetch(
          `/api/repos/${encodeURIComponent(repoTarget)}/file?${query.toString()}`,
        );
        const payload = await response.json().catch(() => null);

        const outcome = resolveBlobLoadOutcome({
          ok: response.ok,
          status: response.status,
          payload,
        });

        if (outcome.kind === 'not-found') {
          // Honest 404: the file does not exist at this ref. Never invent
          // template content — report the miss and keep the editor closed.
          const fileName = file.path.split('/').pop() || file.name || 'file.txt';
          showToast(`File not found: ${fileName}`);
          closeBlobEditor();
          return;
        }
        if (outcome.kind === 'error') {
          throw new Error(outcome.message);
        }

        setViewingFile({
          ...file,
          content: outcome.content,
        });
        // headSha (commit at read time) is the commit token — never `sha`
        // (the raw ref like "main") which the backend rejects.
        setViewingHeadSha(headShaFromBlobPayload(payload));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load file.';
        showToast(message);

        // Honest failure: keep the blob editor closed. Opening it with an
        // invented empty string would present fake bytes as the file's real
        // content — and a commit from that state could clobber the actual file.
        closeBlobEditor();
      }
    },
    [
      apiFetch,
      browsingCommitSha,
      closeBlobEditor,
      currentBranch,
      repositoryOwner,
      selectedRepo,
      showToast,
    ],
  );

  useEffect(() => {
    const applyLocation = (route: QuantGitRoute) => {
      setPendingRoute(route);
      setRouteHydrated(true);
    };

    applyLocation(parseQuantGitRoute(window.location.pathname));
    return subscribeToQuantGitRoute(applyLocation);
  }, []);

  // Fetch real repositories from backend with graceful fallback.
  // Returns the fresh list so callers can act on it (e.g. open a repo that
  // was just created) instead of relying on stale closure state.
  const fetchRepos = useCallback(async (): Promise<Repo[]> => {
    try {
      const res = await apiFetch('/api/repos');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mappedRepos: Repo[] = json.data.map((r: any) => ({
            id: r.id || r.name,
            name: r.name,
            fullName: `${currentUsername}/${r.name}`,
            description: r.description || '',
            visibility: (r.visibility?.toLowerCase() === 'public' ? 'public' : 'private') as
              | 'public'
              | 'private',
            language: r.language || '',
            stars: typeof r.stars === 'number' ? r.stars : (r.starCount ?? 0),
            forks: typeof r.forks === 'number' ? r.forks : (r.forkCount ?? 0),
            watching: typeof r.watching === 'number' ? r.watching : 0,
            cloneUrl: r.cloneUrl || '',
            defaultBranch: r.defaultBranch || 'main',
            latestCommit: r.latestCommit || '',
            latestCommitSha: r.latestCommitSha || '',
            latestCommitTime: r.latestCommitTime || '',
            checksStatus: 'unknown',
            license: r.license || '',
            website: r.website || '',
            topics: Array.isArray(r.topics) ? r.topics : [],
            branchCount:
              typeof r.branchCount === 'number'
                ? r.branchCount
                : Array.isArray(r.branches)
                  ? r.branches.length
                  : undefined,
            commitCount: typeof r.commitCount === 'number' ? r.commitCount : undefined,
            branches: Array.isArray(r.branches)
              ? r.branches.map((b: any) => (typeof b === 'string' ? b : b.name))
              : undefined,
          }));
          setBaseRepos(mappedRepos);
          return mappedRepos;
        } else {
          // Genuine empty state — no fake repos. UI shows "No repositories yet".
          setBaseRepos([]);
          return [];
        }
      } else {
        setBaseRepos([]);
        return [];
      }
    } catch {
      setBaseRepos([]);
      return [];
    }
  }, [currentUsername, apiFetch]);

  // Fetch real file tree from backend
  const fetchRepoTree = useCallback(
    async (repoIdOrName: string, branch: string) => {
      try {
        const res = await apiFetch(
          `/api/repos/${encodeURIComponent(repoIdOrName)}/tree?ref=${encodeURIComponent(branch)}`,
        );
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            setFiles(json.data.map(mapTreeItemToFileNode));
            return;
          }
        }
      } catch {
        // Fallback to mock files
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  useEffect(() => {
    if (!routeHydrated || !pendingRoute) return;

    if (pendingRoute.kind === 'quanty') {
      setActiveDeckTab('repos');
      setIsCopilotDrawerOpen(true);
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
      setBrowsingCommitSha(null);
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
              assignee: item.assignee || 'Unassigned',
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
              // checksStatus honesty (#1071): normalize unrecognized values to 'unknown'
              // so an untyped leak never reaches the PR detail modal's CI cell.
              checksStatus: (['passing', 'pending', 'failing', 'unknown'] as string[]).includes(
                item.checksStatus,
              )
                ? item.checksStatus
                : 'unknown',
              // Pass through honestly: null (unknown) stays null, never becomes an invented 0.
              commentsCount: item.commentsCount ?? null,
              // Review-requirement verdict: only a real `true` from the list
              // endpoint may render the row chip; anything else hides it.
              reviewRequired: item.reviewRequired === true,
              createdAt: item.createdAt || 'recently',
              body: item.body || '',
              // Diff stats: pass through honestly — the list endpoint reports
              // null (unknown) and must never become invented +12/-2 counts.
              additions: item.additions ?? undefined,
              deletions: item.deletions ?? undefined,
              changedFiles: item.changedFiles ?? undefined,
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
            setDetailedBranches(
              json.data.map((b: any) => mapBackendBranchToItem(b, selectedRepo?.defaultBranch)),
            );
          }
        }
      } catch {
        // Retain existing branches
      }
    },
    [apiFetch, selectedRepo?.defaultBranch],
  );

  const fetchRepoCommits = useCallback(
    async (repoIdOrName: string, ref = currentBranch) => {
      try {
        const res = await apiFetch(
          `/api/repos/${encodeURIComponent(repoIdOrName)}/commits?ref=${encodeURIComponent(ref)}`,
        );
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mappedCommits: CommitItem[] = json.data.map((c: any) =>
              mapBackendCommitToItem(c, currentUsername),
            );
            setCommits(mappedCommits);
          }
        }
      } catch {
        // Retain existing commits
      }
    },
    [apiFetch, currentBranch, currentUsername],
  );

  // AUD-P0-G3: the ONLY branch create/delete path used by the UI — it always
  // hits the backend and only updates local state on real API success.
  // Returns true when the branch was genuinely created, false otherwise.
  const handleCreateBranch = async (name: string, source = currentBranch): Promise<boolean> => {
    if (!selectedRepo) return false;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sourceBranch: source }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        // Only update local state on real API success — never lie.
        setRepoBranches((prev) => (prev.includes(name) ? prev : [...prev, name]));
        setDetailedBranches((prev) => {
          if (prev.some((b) => b.name === name)) return prev;
          return [
            ...prev,
            {
              name,
              sha: json?.data?.sha || 'pending',
              isDefault: false,
              isProtected: false,
              protection: 'none',
              aheadBy: 0,
              behindBy: 0,
              lastCommitAuthor: currentUsername,
              lastCommitMessage: `Branch created from ${source}`,
              lastCommitTime: 'just now',
            },
          ];
        });
        setBrowsingCommitSha(null);
        setCurrentBranch(name);
        showToast(`Branch "${name}" created in repository!`);
        emitQuantGitMascotEvent('branch');
        return true;
      } else {
        showToast(json?.error?.message || `Failed to create branch "${name}"`);
        emitQuantGitMascotEvent('error');
        return false;
      }
    } catch {
      showToast(`Failed to create branch "${name}" — network error`);
      emitQuantGitMascotEvent('error');
      return false;
    }
  };

  // AUD-P0-G3: real backend delete; returns true only when the branch was
  // genuinely deleted from repository storage.
  const handleDeleteBranch = async (name: string): Promise<boolean> => {
    if (!selectedRepo) return false;
    if (name === selectedRepo.defaultBranch) {
      showToast('Cannot delete the default branch');
      return false;
    }
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(
        `/api/repos/${encodeURIComponent(repoTarget)}/branches/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && (json?.success !== false)) {
        // Only update local state on real API success — never lie.
        setRepoBranches((prev) => prev.filter((b) => b !== name));
        setDetailedBranches((prev) => prev.filter((b) => b.name !== name));
        showToast(`Deleted branch "${name}"`);
        emitQuantGitMascotEvent('branch');
        return true;
      } else {
        showToast(json?.error?.message || `Failed to delete branch "${name}"`);
        emitQuantGitMascotEvent('error');
        return false;
      }
    } catch {
      showToast(`Failed to delete branch "${name}" — network error`);
      emitQuantGitMascotEvent('error');
      return false;
    }
  };

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
      fetchRepoCommits(selectedRepo.id || selectedRepo.name, currentBranch);
      fetchRepoActions(selectedRepo.id || selectedRepo.name);
      // A commit-SHA ref is a real git tree-ish — the backend runs
      // `git ls-tree <ref>`, so browsing at a commit shows the true tree.
      fetchRepoTree(selectedRepo.id || selectedRepo.name, browsingCommitSha ?? currentBranch);
      setSettingsName(selectedRepo.name);
      setSettingsDesc(selectedRepo.description || '');
      setSettingsBranch(selectedRepo.defaultBranch || 'main');
      setSettingsVisibility(selectedRepo.visibility || 'public');
    } else {
      // QM-SCREEN-013 R3 P1: pulls/issues/actions are fetched per selected
      // repo — clear them on deselect so the landing tabs never show a
      // previous repo's data as if it were global.
      setIssues([]);
      setPulls([]);
      setActions([]);
    }
  }, [
    selectedRepo,
    currentBranch,
    browsingCommitSha,
    fetchRepoIssues,
    fetchRepoPulls,
    fetchRepoBranches,
    fetchRepoCommits,
    fetchRepoActions,
    fetchRepoTree,
  ]);

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
      if (e.key === '/') {
        e.preventDefault();
        const searchInput =
          document.getElementById('app-shell-search-input') ||
          document.getElementById('app-shell-mobile-search-input');
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

  // Shared core for creating an issue via POST /api/repos/:repo/issues.
  // Used by the new-issue modal AND the IssuesTab inline composer — one real
  // code path, no alert stubs, no fake fallbacks. On failure the caller's
  // input is never cleared: the result carries the honest error instead.
  const createIssueViaApi = useCallback(
    async (
      title: string,
      body: string,
      labels: string[],
    ): Promise<{ ok: boolean; issue?: IssueItem; error?: string }> => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return { ok: false, error: 'Issue title is required.' };
      const repoTarget = selectedRepo?.id || selectedRepo?.name || 'Quant-Ecosystem';
      try {
        const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/issues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: cleanTitle,
            body: body.trim() || 'No description provided.',
            labels,
          }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          const item = json.data;
          const fallbackLabel = labels[0] ?? 'bug';
          const created: IssueItem = {
            id: item.number || item.id,
            title: item.title,
            body: item.body || body.trim() || 'No description provided.',
            state: 'open',
            author: currentUsername,
            labels: Array.isArray(item.labels)
              ? item.labels
              : [
                  {
                    name: fallbackLabel,
                    color: fallbackLabel === 'bug' ? '#D73A4A' : '#1D76DB',
                  },
                ],
            commentsCount: 0,
            createdAt: 'just now',
          };
          setIssues((prev) => [created, ...prev]);
          return { ok: true, issue: created };
        }
        return { ok: false, error: json?.error?.message || 'Failed to create issue.' };
      } catch {
        return { ok: false, error: 'Failed to create issue — network error.' };
      }
    },
    [apiFetch, selectedRepo, currentUsername],
  );

  const handleCreateIssue = async (e: FormEvent) => {
    e.preventDefault();
    if (!newIssueTitle.trim()) return;
    const result = await createIssueViaApi(newIssueTitle, newIssueBody, [newIssueLabel]);
    if (result.ok && result.issue) {
      setNewIssueTitle('');
      setNewIssueBody('');
      setModalState('none');
      showToast(`Issue #${result.issue.id} created`);
      return;
    }

    // No fake fallback — never create phantom issues or lie about success.
    showToast(result.error || 'Failed to create issue. Please try again.');
  };

  const handleToggleIssue = async (issueNumber: number) => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    const target = issues.find((i) => i.id === issueNumber);
    if (!target) return;
    const nextState = target.state === 'open' ? 'closed' : 'open';
    try {
      const res = await apiFetch(
        `/api/repos/${encodeURIComponent(repoTarget)}/issues/${issueNumber}/toggle`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && (json?.success !== false)) {
        // Only update local state on real API success — never lie.
        setIssues((prev) =>
          prev.map((i) => (i.id === issueNumber ? { ...i, state: nextState } : i)),
        );
        if (selectedIssue && selectedIssue.id === issueNumber) {
          setSelectedIssue((curr) => (curr ? { ...curr, state: nextState } : null));
        }
        showToast(`Issue #${issueNumber} marked as ${nextState}!`);
      } else {
        showToast(json?.error?.message || `Failed to update issue #${issueNumber}`);
      }
    } catch {
      showToast(`Failed to update issue #${issueNumber} — network error`);
    }
  };

  // Shared core for posting an issue comment via
  // POST /api/repos/:repo/issues/:number/comments.
  // Used by the issue-detail modal AND the IssuesTab inline composer.
  // Never throws: failure comes back as { ok: false, error } so the caller
  // can keep the user's text instead of wiping it.
  const postIssueCommentViaApi = useCallback(
    async (issueId: number, body: string): Promise<{ ok: boolean; error?: string }> => {
      const cleanBody = body.trim();
      if (!cleanBody) return { ok: false, error: 'Comment cannot be empty.' };
      if (!selectedRepo) return { ok: false, error: 'Select a repository first.' };
      try {
        const repoTarget = selectedRepo.id || selectedRepo.name;
        const res = await apiFetch(
          `/api/repos/${encodeURIComponent(repoTarget)}/issues/${issueId}/comments`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: cleanBody }),
          },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          return { ok: false, error: json?.error?.message || 'Failed to post comment.' };
        }
        const created = json.data as IssueCommentItem;
        setIssueComments((current) => [...current, created]);
        setIssues((current) =>
          current.map((issue) =>
            issue.id === issueId
              ? { ...issue, commentsCount: issue.commentsCount + 1 }
              : issue,
          ),
        );
        setSelectedIssue((current) =>
          current && current.id === issueId
            ? { ...current, commentsCount: current.commentsCount + 1 }
            : current,
        );
        return { ok: true };
      } catch {
        return { ok: false, error: 'Failed to post comment — network error.' };
      }
    },
    [apiFetch, selectedRepo],
  );

  const handleSubmitIssueComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRepo || !selectedIssue || isSubmittingComment) return;
    const body = commentDraft.trim();
    if (!body) return;

    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      const result = await postIssueCommentViaApi(selectedIssue.id, body);
      if (!result.ok) {
        // Draft is preserved — the user can retry instead of retyping.
        setCommentError(result.error || 'Failed to post comment');
      } else {
        setCommentDraft('');
        showToast('Comment posted');
      }
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Adapters wiring the IssuesTab inline composers to the real backend.
  // Same endpoints as the modal flows above; the tab keeps its own drafts and
  // shows honest inline errors on failure (never wipes user input).
  // The tab composer has no label picker, so it uses the same 'bug' default as
  // the new-issue modal's newIssueLabel initial value.
  const handleCreateIssueFromTab = useCallback(
    (title: string, body: string) => createIssueViaApi(title, body, ['bug']),
    [createIssueViaApi],
  );
  const handlePostIssueCommentFromTab = useCallback(
    (issueId: number, body: string) => postIssueCommentViaApi(issueId, body),
    [postIssueCommentViaApi],
  );

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
          checksStatus: 'unknown',
          commentsCount: 0,
          createdAt: 'just now',
          // Diff stats: pass through honestly — null/undefined stays
          // unknown ('—' in the UI), never invented +12/-2 counts.
          additions: item.additions ?? undefined,
          deletions: item.deletions ?? undefined,
          changedFiles: item.changedFiles ?? undefined,
        };
        setPulls((prev) =>
          prev.some((p) => p.id === created.id) ? prev : [created, ...prev],
        );
        setNewPrTitle('');
        setNewPrBody('');
        setModalState('none');
        // The backend is idempotent: a 200 for an already-open PR on the same
        // branch pair returns the existing PR (deduplicated: true) — say so
        // honestly instead of claiming a new PR was opened.
        showToast(
          json.deduplicated
            ? `Pull request #${created.id} is already open for this branch`
            : `Pull Request #${created.id} opened`,
        );
        emitQuantGitMascotEvent('pull');
        return;
      }
    } catch {
      // Fallback
    }

    // No fake fallback — never create phantom PRs or lie about success.
    showToast('Failed to open pull request. Please try again.');
  };

  const handleStartPullRequest = useCallback(
    async (params: { sourceBranch: string; targetBranch: string; title: string; body: string }) => {
      const repoTarget = selectedRepo?.id || selectedRepo?.name || 'Quant-Ecosystem';
      const title = params.title.trim() || `Update from ${params.sourceBranch}`;
      const body = params.body.trim() || 'No description provided.';
      const targetBranch = params.targetBranch || currentBranch || 'main';

      // Check if PR already exists in local state
      const existing = pulls.find(
        (p) =>
          p.branchSource === params.sourceBranch &&
          p.branchTarget === targetBranch &&
          p.state === 'open',
      );
      if (existing) {
        setSelectedPr(existing);
        setActiveDeckTab('repos');
        setActiveGitHubTab('pulls');
        return existing;
      }

      let createdPr: PRItem;
      // Tracks whether the backend idempotently returned an already-open PR
      // (deduplicated: true) instead of creating a new one — used by the
      // toast below, which runs outside the try/catch.
      let wasDeduplicated = false;

      try {
        const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/pulls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body,
            sourceBranch: params.sourceBranch,
            targetBranch,
          }),
        });
        const json = await res.json().catch(() => null);
        wasDeduplicated = json?.deduplicated === true;
        if (res.ok && json?.success && json?.data) {
          const item = json.data;
          createdPr = {
            id: item.number || item.id,
            title: item.title,
            body: item.body || body,
            state: 'open',
            author: currentUsername,
            branchSource: params.sourceBranch,
            branchTarget: targetBranch,
            checksStatus: 'unknown',
            commentsCount: 0,
            createdAt: 'just now',
            // Diff stats: pass through honestly — null/undefined stays
            // unknown ('—' in the UI), never invented +12/-2 counts.
            additions: item.additions ?? undefined,
            deletions: item.deletions ?? undefined,
            changedFiles: item.changedFiles ?? undefined,
          };
        } else {
          throw new Error('Failed to create pull request on server');
        }
      } catch (err) {
        // No fake fallback — never create phantom PRs or lie about success.
        showToast(
          err instanceof Error ? err.message : 'Failed to create pull request. Please try again.',
        );
        throw err;
      }

      // Prepend only when the row is not already listed: the backend may
      // return an idempotent 200 for an existing OPEN PR (deduplicated: true)
      // and we must not render it twice.
      setPulls((prev) =>
        prev.some((p) => p.id === createdPr.id) ? prev : [createdPr, ...prev],
      );
      setSelectedPr(createdPr);
      setActiveDeckTab('repos');
      setActiveGitHubTab('pulls');
      // The backend is idempotent: a 200 with deduplicated: true means the PR
      // already existed — report that honestly instead of claiming creation.
      showToast(
        wasDeduplicated
          ? `Pull Request #${createdPr.id} is already open for branch ${params.sourceBranch}`
          : `Pull Request #${createdPr.id} created from branch ${params.sourceBranch}!`,
      );
      emitQuantGitMascotEvent('pull');
      return createdPr;
    },
    [apiFetch, currentBranch, currentUsername, pulls, selectedRepo, showToast],
  );

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
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const r = json.data;
        const newRepo: Repo = {
          id: r.id || name,
          name: r.name,
          fullName: slug,
          description: r.description || desc,
          visibility,
          language: r.language || '',
          stars: typeof r.stars === 'number' ? r.stars : 0,
          forks: typeof r.forks === 'number' ? r.forks : 0,
          watching: 0,
          cloneUrl: r.cloneUrl || '',
          defaultBranch: r.defaultBranch || 'main',
          latestCommit: r.latestCommit || '',
          latestCommitSha: r.latestCommitSha || '',
          latestCommitTime: r.latestCommitTime || '',
          checksStatus: 'unknown',
          license: r.license || '',
          website: r.website || '',
          topics: Array.isArray(r.topics) ? r.topics : [],
        };
        setBaseRepos((prev) => [newRepo, ...prev.filter((p) => p.name !== name)]);
        setSelectedRepo(newRepo);
        setNewRepoName('');
        setNewRepoDesc('');
        setModalState('none');
        showToast(`Repository ${slug} created.`);
        emitQuantGitMascotEvent('repo');
        return;
      }
      // Truthful error: surface the server's own message when it provides one.
      const serverMessage =
        typeof json?.error?.message === 'string' && json.error.message
          ? json.error.message
          : typeof json?.message === 'string' && json.message
            ? json.message
            : null;
      showToast(serverMessage || 'Failed to create repository. Please try again.');
    } catch {
      // Network/transport failure — never create phantom repos or lie about success.
      showToast('Failed to create repository. Please try again.');
    }
  };

  const handleStarRepo = async () => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/star`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        // Only update local state on real API success — never lie.
        const serverStars =
          typeof json?.data?.stars === 'number' ? json.data.stars : selectedRepo.stars + 1;
        setSelectedRepo((curr) => (curr ? { ...curr, stars: serverStars } : null));
        setBaseRepos((prev) =>
          prev.map((r) =>
            r.id === selectedRepo.id || r.name === selectedRepo.name
              ? { ...r, stars: serverStars }
              : r,
          ),
        );
        showToast('Starred repository!');
      } else {
        showToast(json?.error?.message || 'Failed to star repository');
      }
    } catch {
      showToast('Failed to star repository — network error');
    }
  };

  const handleForkRepo = async () => {
    if (!selectedRepo) return;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(
        `/api/repos/${encodeURIComponent(repoTarget)}/forks`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        // Only announce a fork the server really created — never toast
        // a fake "copied" message again.
        showToast('Fork created in your workspace');
      } else {
        showToast(json?.error?.message || 'Could not fork repository');
      }
    } catch {
      showToast('Could not fork repository — network error');
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
      const json = await res.json().catch(() => null);
      if (res.ok && (json?.success !== false)) {
        // Only clear local state on real API success — never lie.
        setBaseRepos((prev) =>
          prev.filter((r) => r.id !== selectedRepo.id && r.name !== selectedRepo.name),
        );
        setSelectedRepo(null);
        setViewingFile(null);
        setActiveGitHubTab('code');
        showToast(`Repository ${repoName} archived and deleted.`);
      } else {
        showToast(json?.error?.message || `Failed to delete repository ${repoName}`);
      }
    } catch {
      showToast(`Failed to delete repository ${repoName} — network error`);
    }
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
          showToast('Settings saved successfully');
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

  // QM-SCREEN-013: picking a branch always exits "browse code at commit" mode.
  const handleSelectBranch = useCallback((branch: string) => {
    setBrowsingCommitSha(null);
    setCurrentBranch(branch);
  }, []);

  const handleMergePR = async (
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
  ): Promise<boolean> => {    if (!selectedRepo) return false;
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(
        `/api/repos/${encodeURIComponent(repoTarget)}/pulls/${prNumber}/merge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: mergeMethod }),
        },
      );
      if (res.ok) {
        setPulls((prev) => prev.map((p) => (p.id === prNumber ? { ...p, state: 'merged' } : p)));
        if (selectedPr && selectedPr.id === prNumber) {
          setSelectedPr((prev) => (prev ? { ...prev, state: 'merged' } : null));
        }
        showToast(
          `Pull request #${prNumber} merged into ${selectedRepo.defaultBranch} via ${mergeMethod}!`,
        );
        return true;
      }
      // Non-ok response: the merge did NOT happen. Keep the PR open, report the
      // backend's real error, and resolve false so callers never claim success.
      const outcome = await interpretMergeResult(res, prNumber);
      showToast(outcome.merged ? mergeFailureToast(prNumber) : outcome.toast);
      return false;
    } catch {
      // Network/exception: the merge did NOT happen. Keep the PR open and say so.
      showToast(`Could not merge pull request #${prNumber}. Please try again.`);
      return false;
    }
  };

  const handleCreateBranchModal = async () => {
    if (!selectedRepo || !newBranchInput.trim()) return;
    const branchName = newBranchInput.trim();
    const repoTarget = selectedRepo.id || selectedRepo.name;
    try {
      const res = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: branchName, sha: selectedRepo.latestCommitSha || undefined }),
      });
      if (res.ok) {
        if (!repoBranches.includes(branchName)) {
          setRepoBranches((prev) => [...prev, branchName]);
        }
        setCurrentBranch(branchName);
        setNewBranchInput('');
        setModalState('none');
        showToast(`Branch ${branchName} created and checked out!`);
        emitQuantGitMascotEvent('branch');
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
      // Local-only workspace agent — no agent backend exists. Honest labeling only:
      // never fabricate an 'active' status, a swarm task, thought chain, or setup steps.
      status: 'local-only',
      currentTask: 'Local only — not connected to an agent backend.',
      initial: newAgentName.trim().charAt(0).toUpperCase(),
      color: 'var(--app-accent)',
    };
    setAgents([...agents, newAg]);
    setNewAgentName('');
    setNewAgentRole('');
    setModalState('none');
    showToast(`Agent ${newAg.name} added locally (no backend deployment yet)`);
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

      const repoTarget = selectedRepo.id || selectedRepo.name;
      const method = input.isDelete ? 'DELETE' : 'PATCH';
      let payload: any = null;

      // If newBranch is requested, create the branch on the backend first if needed.
      // The branch MUST be created at the commit the file was read at
      // (expectedHeadSha — the browsed historical commit when browsing at an
      // old commit), NOT at selectedRepo.latestCommitSha: the follow-up file
      // commit sends parentSha = expectedHeadSha, and the backend 409s with
      // STALE_PARENT_SHA whenever the new branch head differs from it.
      //
      // The branch create is NOT fire-and-forget: a 409 BRANCH_EXISTS means
      // the requested name already exists, and committing anyway would
      // silently land the commit on the pre-existing branch — exactly what
      // "Create a new branch for this commit" promised not to do. Surface
      // the conflict and STOP before the file commit runs.
      if (input.newBranch) {
        const branchName: string = input.newBranch;
        try {
          await assertBranchCreated(
            () =>
              apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/branches`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: branchName,
                  sha: newBranchBaseSha(input.expectedHeadSha, selectedRepo.latestCommitSha),
                }),
              }),
            branchName,
          );
        } catch (err) {
          if (err instanceof BranchExistsError) throw err;
          // offline fallback: transport/timeout failure only — attempt the
          // file commit on whatever branch state exists and let ITS honest
          // errors surface.
        }
        setRepoBranches((prev) =>
          prev.includes(branchName) ? prev : [...prev, branchName],
        );
      }

      try {
        const response = await apiFetch(`/api/repos/${encodeURIComponent(repoTarget)}/file`, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: input.path,
            branch: input.newBranch || input.branch,
            content: input.content,
            message: input.message,
            parentSha: toParentShaParam(input.expectedHeadSha),
            isDelete: input.isDelete,
            originalPath: input.originalPath,
          }),
        });
        payload = assertCommitResponse(response, await response.json().catch(() => null));
      } catch (err: any) {
        // Fail closed (fix/qm-commitblob-false-success): a network failure,
        // a 404, or an unconfirmed response must NEVER fall through to the
        // "Committed" toast + closeBlobEditor() below — nothing was
        // committed, so surface the honest error and keep the blob editor
        // open with its content intact.
        throw toCommitFailure(err);
      }

      // Handle Delete Action
      if (input.isDelete) {
        setFiles((currentFiles) =>
          currentFiles.filter(
            (f) => f.path !== input.path && f.path !== (input.originalPath || input.path),
          ),
        );
        setViewingFile((current) =>
          current && (current.path === input.path || current.path === input.originalPath)
            ? null
            : current,
        );
        showToast(`Deleted ${input.path}`);
        closeBlobEditor();
        await fetchRepos();
        return;
      }

      // Handle Rename Action
      if (input.originalPath && input.originalPath !== input.path) {
        setFiles((currentFiles) => {
          const withoutOld = currentFiles.filter((f) => f.path !== input.originalPath);
          const parts = input.path.split('/');
          const name = parts[parts.length - 1];
          return [
            ...withoutOld.filter((f) => f.path !== input.path),
            {
              path: input.path,
              name,
              type: 'file',
              content: input.content,
              size: `${input.content.length} B`,
            },
          ];
        });
        setViewingFile((current) =>
          current && current.path === input.originalPath
            ? {
                ...current,
                path: input.path,
                name: input.path.split('/').pop() || input.path,
                content: input.content,
              }
            : current,
        );
        showToast(`Renamed ${input.originalPath} to ${input.path}`);
        closeBlobEditor();
        await fetchRepos();
        return;
      }

      // Regular Create / Update Commit
      setViewingFile((current) =>
        current
          ? {
              ...current,
              content: input.content,
            }
          : current,
      );
      // After a successful commit the branch head IS the new commit.
      setViewingHeadSha(payload?.data?.commitSha || '');

      setFiles((currentFiles) => {
        const path = input.path;
        const exists = currentFiles.some((f) => f.path === path);
        if (exists) {
          return currentFiles.map((f) => (f.path === path ? { ...f, content: input.content } : f));
        } else {
          const parts = path.split('/');
          const name = parts[parts.length - 1];
          return [
            ...currentFiles,
            {
              path,
              name,
              type: 'file',
              content: input.content,
              size: `${input.content.length} B`,
            },
          ];
        }
      });

      showToast(formatCommitToast(input.path, payload?.data?.commitSha));
      emitQuantGitMascotEvent('commit');
      closeBlobEditor();
      await fetchRepos();

      // fix/qm-commit-double-pr: PR creation for commit-to-new-branch lives
      // ONLY in the CodeTab commit modal (onStartPullRequest) — the single
      // creation site. This handler used to POST a second creation request,
      // so one commit action produced PRs N and N+1: the second slipped past
      // handleStartPullRequest's local-state dedupe because React state had
      // not re-rendered between the two awaits.
    },
    [
      apiFetch,
      closeBlobEditor,
      fetchRepos,
      selectedRepo,
      showToast,
    ],
  );

  const handleDeleteBlob = useCallback(
    async (path: string, message: string, branch = currentBranch) => {
      await handleCommitBlob({
        path,
        branch,
        content: '',
        message: message || `Delete ${path.split('/').pop() || path}`,
        // Delete is a commit too: it needs the head SHA captured when the
        // file was opened. '' (→ parentSha null) 409s on any non-empty
        // branch, so an unknown head degrades to the honest 409 path.
        expectedHeadSha: viewingHeadSha,
        isDelete: true,
      });
    },
    [currentBranch, handleCommitBlob, viewingHeadSha],
  );

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      searchValue={repoSearchQuery}
      onSearchChange={(val) => {
        setRepoSearchQuery(val);
        setFileSearchQuery(val);
      }}
      searchPlaceholder="Search in QuantGit (repositories, files, branches)..."
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#0D1117] text-[#E6EDF3] font-sans antialiased">
        {/* 1. QuantGit Sovereign Sub-Header */}
        <QuantGitHeader
          activeDeckTab={activeDeckTab}
          setActiveDeckTab={setActiveDeckTab}
          selectedRepo={selectedRepo}
          setSelectedRepo={setSelectedRepo}
          viewingFile={viewingFile}
          setViewingFile={setViewingFile}
          setActiveGitHubTab={setActiveGitHubTab}
          currentUsername={currentUsername}
          isHistoryOpen={isHistoryOpen}
          setIsHistoryOpen={setIsHistoryOpen}
          chatSessions={chatSessions}
          setChatSessions={setChatSessions}
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
          pinnedSessionIds={pinnedSessionIds}
          setPinnedSessionIds={setPinnedSessionIds}
          setChatMessages={setChatMessages}
          setModalState={setModalState}
          setIsPersonalizeOpen={setIsPersonalizeOpen}
          showToast={showToast}
          isCopilotDrawerOpen={isCopilotDrawerOpen}
          setIsCopilotDrawerOpen={setIsCopilotDrawerOpen}
        />
      {/* 2. Repository Sub-Navigation Bar & 10 Tabs (When in Repo view with selected repo) */}
      {activeDeckTab === 'repos' && selectedRepo && (
 <div className="bg-[#010409] pt-4 px-4 sm:px-8">
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

            {/* Watch button removed (QM-SCREEN-013 P2): it toasted
                'Notification settings updated' with no API behind it. Watch
                returns when a real subscription endpoint exists. */}
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleForkRepo}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
              >
                <svg className="size-3.5 text-[#7D8590]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="6" r="3" />
                  <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
                  <path d="M12 12v3" />
                </svg>
                <span>Fork</span>
                <span className="px-1.5 py-px rounded-full bg-[#30363D] text-[10px] text-[#7D8590]">
                  {selectedRepo.forks}
                </span>
              </button>
              <button
                type="button"
                onClick={handleStarRepo}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors font-semibold"
              >
                <svg className="size-3.5 text-[#E3B341]" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>Star</span>
                <span className="px-1.5 py-px rounded-full bg-[#30363D] text-[10px] text-[#7D8590]">
                  {selectedRepo.stars}
                </span>
              </button>
            </div>
          </div>

 <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs font-semibold">
            {[
              { id: 'code', label: 'Code', badge: null },
              { id: 'commits', label: 'Commits', badge: commits.length },
              {
                id: 'branches',
                label: 'Branches',
                badge: detailedBranches.length || repoBranches.length,
              },
              { id: 'issues', label: 'Issues', badge: openIssuesCount },
              { id: 'pulls', label: 'Pull requests', badge: openPullsCount },
              { id: 'agents', label: 'Copilot Fleet', badge: null },
              { id: 'mcp', label: 'MCP Registry', badge: OFFICIAL_MCP_CATALOG.length },
              { id: 'actions', label: 'Actions', badge: actions.length },
              { id: 'notifications', label: 'Notifications', badge: null },
              { id: 'discussions', label: 'Discussions', badge: discussions.length },
              { id: 'projects', label: 'Projects', badge: projects.length },
              { id: 'security', label: 'Security', badge: securityAlerts.length },
              { id: 'insights', label: 'Insights', badge: null },
              { id: 'settings', label: 'Settings', badge: null },
            ].map((t) => {
              const active = activeGitHubTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openRepositoryTab(t.id as GitHubTab)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 transition-all shrink-0 ${
                    active
                      ? 'border-[var(--app-accent)] text-white font-bold'
                      : 'border-transparent text-[#7D8590] hover:text-[#E6EDF3] hover:border-[#30363D]'
                  }`}
                >
                  <span>{t.label}</span>
                  {t.badge !== null && (
                    <span
                      className={`px-1.5 py-px rounded-full text-[10px] ${
                        active
                          ? 'bg-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] text-[var(--app-accent)] font-bold'
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

      {/* 3. Main Workspace / Tab Content Body */}
      <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden">
        {/* VIEW A: Contextual Sub-Views (repos, prs, issues, actions, copilot) */}
        {activeDeckTab === 'repos' && !selectedRepo && (
          // The header notification bell sets `activeGitHubTab` to
          // 'notifications' — with no repo selected the inbox below would
          // otherwise render nothing and the bell would appear dead.
          activeGitHubTab === 'notifications' ? (
            <NotificationsInbox />
          ) : (
          <QuantGitSubViews
            activeTab={activeContextSubTab}
            searchQuery={repoSearchQuery}
            onSearchChange={setRepoSearchQuery}
            // BB-P1-9: the AppShell header (desktop) / pillar top bar (mobile)
            // already renders this same search field — hide the in-view copy.
            hideSearchField
            // QM-SCREEN-013 R3 P1: real fetched data for the landing tabs.
            repos={landingRepos}
            prs={landingPrs}
            issues={landingIssues}
            workflows={landingWorkflows}
            onSelectTab={(tab) => {
              setActiveContextSubTab(tab);
              router.push(`/quantgit?tab=${tab}`);
            }}
            onSelectRepo={(repoName) => {
              const matched = repos.find(
                (r) => r.name === repoName || r.fullName.includes(repoName),
              );
              if (matched) {
                openRepository(matched);
              } else {
                // Honest: the repository was NOT opened — no such repo exists.
                showToast(`Repository "${repoName}" not found`);
                emitQuantGitMascotEvent('error');
              }
            }}
            onMergePR={(prId) => {
              // Real merge via backend — never lie about success.
              // NOTE: this sub-view only renders when no repository is selected
              // (guarded by `!selectedRepo` above), so there is no repo target
              // to merge into — say so honestly instead of pretending.
              void prId;
              showToast('Select a repository first to merge');
            }}
            onOpenPR={(prId) => {
              // No repo context here — no detail navigation happens. Honest
              // instruction instead of a false "opened" claim.
              void prId;
              showToast('Select a repository first to view pull request details');
            }}
            onSelectIssue={(issueId) => {
              // Same: no navigation without a repository.
              void issueId;
              showToast('Select a repository first to view issue details');
            }}
            onNewRepo={() => setModalState('new-repo')}
            onNewIssue={() => setModalState('new-issue')}
            showToast={showToast}
          />
          )
        )}

        {/* VIEW B: Repository 10 Tabs */}
        {activeDeckTab === 'repos' && selectedRepo && (
          <div className="flex-1 w-full min-h-0 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-20">
              {activeGitHubTab === 'code' && (
                <CodeTab
                  selectedRepo={selectedRepo}
                  currentBranch={currentBranch}
                  repoBranches={repoBranches}
                  currentPath={currentPath}
                  files={files}
                  setModalState={setModalState}
                  openBlobEditor={openBlobEditor}
                  onNavigatePath={setCurrentPath}
                  onSelectBranch={handleSelectBranch}
                  onOpenCommitHistory={() => setActiveGitHubTab('commits')}
                  onOpenSecurityPolicy={() => setActiveGitHubTab('security')}
                  showToast={showToast}
                  onCommitBlob={handleCommitBlob}
                  onDeleteBlob={handleDeleteBlob}
                  branchHeadSha={currentBranchHeadSha}
                  onStartPullRequest={handleStartPullRequest}
                  browsingCommitSha={browsingCommitSha}
                  onExitBrowseCommit={() => setBrowsingCommitSha(null)}
                />
              )}

              {activeGitHubTab === 'commits' && (
                <CommitsTab
                  repo={selectedRepo}
                  currentBranch={currentBranch}
                  repoBranches={repoBranches}
                  commits={commits}
                  onSelectBranch={handleSelectBranch}
                  onBrowseCodeAtCommit={(sha) => {
                    // Real switch: the tree refetch runs `git ls-tree <sha>`
                    // and the code tab renders that tree. The toast only
                    // fires after the switch state is committed.
                    setBrowsingCommitSha(sha);
                    setCurrentPath('');
                    setActiveGitHubTab('code');
                    showToast(`Browsing repository files at commit ${sha.slice(0, 7)}`);
                  }}
                  showToast={showToast}
                />
              )}

              {activeGitHubTab === 'branches' && (
                <BranchesTab
                  repo={selectedRepo}
                  currentUsername={currentUsername}
                  branches={
                    detailedBranches.length > 0
                      ? detailedBranches
                      : repoBranches.map((b) => ({
                          name: b,
                          sha: selectedRepo.latestCommitSha || '',
                          isDefault: b === selectedRepo.defaultBranch,
                          isProtected: b === selectedRepo.defaultBranch,
                          aheadBy: 0,
                          behindBy: 0,
                          // Honest fallback: the name-only list carries no
                          // per-branch commit data, so leave the author empty
                          // and let BranchesTab render its 'Unknown' fallback.
                          lastCommitAuthor: '',
                          lastCommitMessage: selectedRepo.latestCommit || '',
                          lastCommitTime: selectedRepo.latestCommitTime || '',
                        }))
                  }
                  currentBranch={currentBranch}
                  onSelectBranch={(b) => {
                    handleSelectBranch(b);
                    showToast(`Checked out branch: ${b}`);
                  }}
                  // AUD-P0-G3: wired to the real backend handlers — no local-only
                  // theater. State changes only after the API genuinely succeeds.
                  onCreateBranch={(name, sourceBranch) => handleCreateBranch(name, sourceBranch)}
                  onDeleteBranch={async (b) => {
                    const ok = await handleDeleteBranch(b);
                    if (ok && currentBranch === b) {
                      handleSelectBranch(selectedRepo.defaultBranch || 'main');
                    }
                    return ok;
                  }}
                  showToast={showToast}
                />
              )}

              {activeGitHubTab === 'issues' && (
                <IssuesTab
                  issueSearchQuery={issueSearchQuery}
                  setIssueSearchQuery={setIssueSearchQuery}
                  filteredIssues={filteredIssues}
                  allIssues={issues}
                  openIssuesCount={openIssuesCount}
                  closedIssuesCount={closedIssuesCount}
                  setModalState={setModalState}
                  openIssueDetail={openIssueDetail}
                  handleToggleIssue={handleToggleIssue}
                  onCreateIssue={handleCreateIssueFromTab}
                  onPostIssueComment={handlePostIssueCommentFromTab}
                />
              )}

              {activeGitHubTab === 'pulls' && (
                <PullRequestsTab
                  pullSearchQuery={pullSearchQuery}
                  setPullSearchQuery={setPullSearchQuery}
                  filteredPulls={filteredPulls}
                  openPullsCount={openPullsCount}
                  closedPullsCount={closedPullsCount}
                  setModalState={setModalState}
                  openPullDetail={openPullDetail}
                  repoId={selectedRepo?.id || selectedRepo?.name}
                  currentUsername={currentUsername}
                  showToast={showToast}
                  onMergePR={handleMergePR}
                />
              )}

              {activeGitHubTab === 'agents' && (
                <div className="space-y-6">
                  <CopilotFleetModeView
                    repoOwner={
                      selectedRepo.fullName ? selectedRepo.fullName.split('/')[0] : 'quantrinitylab'
                    }
                    repoName={selectedRepo.name}
                    onDispatchTask={(prompt, model, mode) =>
                      showToast(
                        `Saved locally [${mode}] with ${model} — no cloud agent backend connected`,
                      )
                    }
                  />
 <div className="pt-6">
                    <h4 className="text-sm font-bold text-white mb-3">Deployed Workspace Agents</h4>
                    <AgentsTab agents={agents} setModalState={setModalState} />
                  </div>
                </div>
              )}

              {activeGitHubTab === 'mcp' && <MCPRegistryTab />}

              {activeGitHubTab === 'notifications' && <NotificationsInbox />}

              {activeGitHubTab === 'discussions' && (
                <DiscussionsTab
                  discussions={discussions}
                  discussionCategory={discussionCategory}
                  setDiscussionCategory={setDiscussionCategory}
                  handleUpvoteDiscussion={handleUpvoteDiscussion}
                  showToast={showToast}
                />
              )}

              {activeGitHubTab === 'actions' && (
                <ActionsTab
                  actions={actions}
                  handleTriggerWorkflow={handleTriggerWorkflow}
                  setSelectedActionRun={setSelectedActionRun}
                  setModalState={setModalState}
                  runnerConnected={false}
                />
              )}

              {activeGitHubTab === 'projects' && (
                <ProjectsTab projects={projects} handleMoveKanban={handleMoveKanban} />
              )}

              {activeGitHubTab === 'security' && (
                <SecurityTab
                  securityAlerts={securityAlerts}
                  showToast={showToast}
                  selectedRepo={selectedRepo}
                  repoId={selectedRepo?.id}
                />
              )}

              {activeGitHubTab === 'insights' && (
                <InsightsTab commits={commits} pullRequests={pulls} workflowRuns={actions} />
              )}

              {activeGitHubTab === 'settings' && (
                <div className="space-y-8">
                  <SettingsTab
                    settingsName={settingsName}
                    setSettingsName={setSettingsName}
                    settingsDesc={settingsDesc}
                    setSettingsDesc={setSettingsDesc}
                    settingsBranch={settingsBranch}
                    setSettingsBranch={setSettingsBranch}
                    settingsVisibility={settingsVisibility}
                    setSettingsVisibility={setSettingsVisibility}
                    isSavingSettings={isSavingSettings}
                    handleSaveSettings={handleSaveSettings}
                    handleDeleteRepo={handleDeleteRepo}
                  />
 <div className="pt-8">
                    <DeveloperAppearanceSettings
                      onSave={() => showToast('Developer appearance settings saved!')}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW C: Quanty AI Autonomous Copilot Studio */}
        {activeDeckTab === 'quanty' && (
          <QuantyCopilotView
            chatMessages={chatMessages}
            setPromptInput={setPromptInput}
            promptInput={promptInput}
            isChatSubmitting={isChatSubmitting}
            chatError={chatError}
            handleChatSubmit={handleChatSubmit}
            expandedThoughts={expandedThoughts}
            setExpandedThoughts={setExpandedThoughts}
            isContextOpen={isContextOpen}
            setIsContextOpen={setIsContextOpen}
            activeContextSubmenu={activeContextSubmenu}
            setActiveContextSubmenu={setActiveContextSubmenu}
            repoFileSearch={repoFileSearch}
            setRepoFileSearch={setRepoFileSearch}
            attachedFiles={attachedFiles}
            setAttachedFiles={setAttachedFiles}
            mentionSearch={mentionSearch}
            setMentionSearch={setMentionSearch}
            skillsSearch={skillsSearch}
            setSkillsSearch={setSkillsSearch}
            activeSkills={activeSkills}
            setActiveSkills={setActiveSkills}
            isSettingsOpen={isSettingsOpen}
            setIsSettingsOpen={setIsSettingsOpen}
            activeSettingsSubmenu={activeSettingsSubmenu}
            setActiveSettingsSubmenu={setActiveSettingsSubmenu}
            sourcesState={sourcesState}
            setSourcesState={setSourcesState}
            mcpServers={mcpServers}
            setMcpServers={setMcpServers}
            notionMode={notionMode}
            setNotionMode={setNotionMode}
            activeModel={activeModel}
            setActiveModel={setActiveModel}
            effort={effort}
            setEffort={setEffort}
            enableWorkersBeta={enableWorkersBeta}
            setEnableWorkersBeta={setEnableWorkersBeta}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            setIsPersonalizeOpen={setIsPersonalizeOpen}
            baseRepos={baseRepos}
            openRepository={openRepository}
            fetchRepos={fetchRepos}
            setActiveDeckTab={setActiveDeckTab}
            showToast={showToast}
          />
        )}

        {/* VIEW D: Agent Lab (Agent Workspace) */}
        {activeDeckTab === 'lab' && (
          <div className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain">
            <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 px-4 py-5 pb-20 text-xs sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#30363D]">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Agent Workspace
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#30363D]/60 text-[#8D96A0] border border-[#30363D]">
                      Local only — no backend connected
                    </span>
                  </h3>
                  <p className="text-[#7D8590]">
                    Workspace agents you configure here are local to this session. Connect a
                    real agent backend to enable autonomous reviews and migrations. Select a
                    local agent to inspect its dossier.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalState('deploy-agent')}
                  className="px-3.5 py-1.5 rounded-md bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-black font-bold text-xs transition-colors"
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

      {/* 4. Modals and Dialogs */}
      <QuantGitModals
        modalState={modalState}
        setModalState={setModalState}
        newBranchInput={newBranchInput}
        setNewBranchInput={setNewBranchInput}
        repoBranches={repoBranches}
        currentBranch={currentBranch}
        setCurrentBranch={setCurrentBranch}
        handleCreateBranch={handleCreateBranchModal}
        fileSearchQuery={fileSearchQuery}
        setFileSearchQuery={setFileSearchQuery}
        filteredFiles={filteredFiles}
        setViewingFile={setViewingFile}
        viewingFile={viewingFile}
        selectedRepo={selectedRepo}
        viewingHeadSha={viewingHeadSha}
        closeBlobEditor={closeBlobEditor}
        handleCommitBlob={handleCommitBlob}
        selectedOfficeAgent={selectedOfficeAgent}
        setSelectedOfficeAgent={setSelectedOfficeAgent}
        newIssueTitle={newIssueTitle}
        setNewIssueTitle={setNewIssueTitle}
        newIssueBody={newIssueBody}
        setNewIssueBody={setNewIssueBody}
        newIssueLabel={newIssueLabel}
        setNewIssueLabel={setNewIssueLabel}
        handleCreateIssue={handleCreateIssue}
        newPrBranch={newPrBranch}
        newPrTitle={newPrTitle}
        setNewPrTitle={setNewPrTitle}
        newPrBody={newPrBody}
        setNewPrBody={setNewPrBody}
        handleCreatePR={handleCreatePR}
        newRepoName={newRepoName}
        setNewRepoName={setNewRepoName}
        newRepoDesc={newRepoDesc}
        setNewRepoDesc={setNewRepoDesc}
        newRepoVisibility={newRepoVisibility}
        setNewRepoVisibility={setNewRepoVisibility}
        handleCreateRepo={handleCreateRepo}
        newAgentName={newAgentName}
        setNewAgentName={setNewAgentName}
        newAgentRole={newAgentRole}
        setNewAgentRole={setNewAgentRole}
        newAgentPod={newAgentPod}
        setNewAgentPod={setNewAgentPod}
        handleDeployAgent={handleDeployAgent}
        selectedActionRun={selectedActionRun}
        selectedPr={selectedPr}
        closePullDetail={closePullDetail}
        handleMergePR={handleMergePR}
        selectedIssue={selectedIssue}
        closeIssueDetail={closeIssueDetail}
        issueComments={issueComments}
        isLoadingComments={isLoadingComments}
        commentError={commentError}
        commentDraft={commentDraft}
        setCommentDraft={setCommentDraft}
        handleSubmitIssueComment={handleSubmitIssueComment}
        isSubmittingComment={isSubmittingComment}
        handleToggleIssue={handleToggleIssue}
        currentUsername={currentUsername}
        isPersonalizeOpen={isPersonalizeOpen}
        setIsPersonalizeOpen={setIsPersonalizeOpen}
        selectedAccessory={selectedAccessory}
        setSelectedAccessory={setSelectedAccessory}
        quantyName={quantyName}
        setQuantyName={setQuantyName}
        quantyInstructions={quantyInstructions}
        setQuantyInstructions={setQuantyInstructions}
        showToast={showToast}
      />

      <RepoImportModal
        isOpen={modalState === 'repo-import'}
        onClose={() => setModalState('none')}
        currentUsername={currentUsername}
        onImportSuccess={(result) => {
          const imported = result.repo;
          const repoFormatted: Repo = {
            id: imported.id,
            name: imported.name,
            fullName: imported.fullName || `${currentUsername}/${imported.name}`,
            description: imported.description || '',
            visibility: imported.visibility || 'public',
            language: imported.language || '',
            stars: imported.starCount ?? 0,
            forks: imported.forkCount ?? 0,
            watching: 0,
            cloneUrl: imported.cloneUrl,
            defaultBranch: imported.defaultBranch || 'main',
            latestCommit: imported.latestCommit || '',
            latestCommitSha: imported.latestCommitSha || '',
            latestCommitTime: imported.latestCommitTime || '',
            checksStatus: 'unknown',
            license: imported.license || '',
            website: '',
            topics: Array.isArray(imported.topics) ? imported.topics : [],
            branches: imported.branches || ['main'],
            commitCount: typeof imported.commitCount === 'number' ? imported.commitCount : undefined,
          };
          setBaseRepos((prev) => {
            if (prev.some((r) => r.id === repoFormatted.id || r.name === repoFormatted.name)) {
              return prev;
            }
            return [repoFormatted, ...prev];
          });
          setSelectedRepo(repoFormatted);
          setActiveGitHubTab('code');
          setActiveDeckTab('code');
          showToast(`Repository ${imported.name} imported successfully!`);
        }}
        showToast={showToast}
      />





      {/* Dark bottom safeguard — covers any light safe-area strip between content and bottom nav */}
      <div
        aria-hidden="true"
        className="fixed bottom-0 inset-x-0 h-[80px] bg-[var(--quant-background)] pointer-events-none z-20"
      />

      {/* Floating Toast Notification — above the single bottom nav */}
      {toastMessage && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[var(--quant-surface)]/90 backdrop-blur-xl border border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)] text-[var(--app-accent)] text-xs font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.08),0_0_20px_color-mix(in_srgb,var(--app-accent)_15%,transparent)] animate-in fade-in slide-in-from-bottom-3 bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)]">
          {toastMessage}
        </div>
      )}
      </div>
    </AppShell>
  );
}

export default function QuantGitPage() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh max-h-dvh w-full flex items-center justify-center bg-[var(--quant-background)] text-[#8B5CF6] font-mono text-xs">
          Loading QuantGit Workspace...
        </div>
      }
    >
      <QuantGitContent />
    </Suspense>
  );
}
