'use client';

// ============================================================================
// QuantGit — Sovereign Operating Workspace Coordinator
// Modularized Architecture: Tabs, Modals, Header & Copilot decoupled.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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

import type {
  MainDeckTab,
  GitHubTab,
  BuildMode,
  Effort,
  CloneProtocol,
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
} from './types';

import {
  INITIAL_REPOS,
  MOCK_FILES,
  INITIAL_ISSUES,
  INITIAL_PRS,
  INITIAL_DISCUSSIONS,
  INITIAL_ACTIONS,
  INITIAL_PROJECT_CARDS,
  INITIAL_SECURITY_ALERTS,
  AGENT_FLEET_CATALOG,
} from './constants';

import { QuantGitHeader } from './components/QuantGitHeader';
import { ReposDirectoryView } from './components/ReposDirectoryView';
import { CodeTab } from './components/CodeTab';
import { IssuesTab } from './components/IssuesTab';
import { PullRequestsTab } from './components/PullRequestsTab';
import { AgentsTab } from './components/AgentsTab';
import { DiscussionsTab } from './components/DiscussionsTab';
import { ActionsTab } from './components/ActionsTab';
import { ProjectsTab } from './components/ProjectsTab';
import { SecurityTab } from './components/SecurityTab';
import { InsightsTab } from './components/InsightsTab';
import { SettingsTab } from './components/SettingsTab';
import { QuantyCopilotView } from './components/QuantyCopilotView';
import { QuantGitModals } from './components/QuantGitModals';
import { MCPRegistryTab } from './components/MCPRegistryTab';
import { CopilotFleetModeView } from './components/CopilotFleetModeView';
import { DeveloperAppearanceSettings } from './components/DeveloperAppearanceSettings';
import { NotificationsInbox } from './components/NotificationsInbox';

export default function QuantGitPage() {
  const router = useRouter();

  // Navigation & Deck State
  const { user } = useAuth();
  const currentUsername =
    user?.username || (user?.email ? user.email.split('@')[0] : 'kundansinghrajput31980');
  const [activeDeckTab, setActiveDeckTab] = useState<MainDeckTab>('repos');
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [activeGitHubTab, setActiveGitHubTab] = useState<GitHubTab>('code');
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [viewingFile, setViewingFile] = useState<FileNode | null>(null);
  const [viewingBlobSha, setViewingBlobSha] = useState('');
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
  const [activeSessionId, setActiveSessionId] = useState('sess-1');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
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
  const [activeSettingsSubmenu, setActiveSettingsSubmenu] = useState<SettingsSubmenu>('none');
  const [activeContextSubmenu, setActiveContextSubmenu] = useState<ContextSubmenu>('none');
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);
  const [quantyName, setQuantyName] = useState('Quanty');
  const [quantyInstructions, setQuantyInstructions] = useState('');
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
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>(['sess-1']);
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
  const [modalState, setModalState] = useState<ModalState>('none');
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

  // Fetch real repositories from backend with graceful fallback
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
            stars: typeof r.stars === 'number' ? r.stars : (r.starCount ?? 0),
            forks: typeof r.forks === 'number' ? r.forks : (r.forkCount ?? 0),
            watching: typeof r.watching === 'number' ? r.watching : 1,
            cloneUrl:
              r.cloneUrl || `https://quantmail.in/quantgit/${currentUsername}/${r.name}.git`,
            sshUrl: r.sshUrl || `git@quantmail.in:${currentUsername}/${r.name}.git`,
            defaultBranch: r.defaultBranch || 'main',
            latestCommit: r.latestCommit || 'Initial commit',
            latestCommitSha: r.latestCommitSha || '948e3612',
            latestCommitTime: r.latestCommitTime || 'recently',
            checksStatus: 'passing',
            license: r.license || 'MIT License',
            website: r.website || 'https://quantmail.in',
            topics:
              Array.isArray(r.topics) && r.topics.length > 0 ? r.topics : ['quant', 'workspace'],
            branchCount:
              typeof r.branchCount === 'number'
                ? r.branchCount
                : Array.isArray(r.branches)
                  ? r.branches.length
                  : 4,
            commitCount: typeof r.commitCount === 'number' ? r.commitCount : 2118,
            branches: Array.isArray(r.branches)
              ? r.branches.map((b: any) => (typeof b === 'string' ? b : b.name))
              : undefined,
          }));
          setBaseRepos(mappedRepos);
        } else {
          setBaseRepos(INITIAL_REPOS);
        }
      } else {
        setBaseRepos(INITIAL_REPOS);
      }
    } catch {
      setBaseRepos(INITIAL_REPOS);
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
            const mappedFiles: FileNode[] = json.data.map((item: any) => ({
              name: item.name || item.path?.split('/').pop() || 'file',
              path: item.path || item.name,
              type: item.type === 'tree' || item.type === 'dir' ? 'dir' : 'file',
              size: item.size ? `${Math.round(item.size / 1024)} KB` : undefined,
              lastCommit: item.lastCommit || 'Update file',
              lastCommitDate: item.lastCommitDate || 'recently',
            }));
            setFiles(mappedFiles);
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
      fetchRepoTree(selectedRepo.id || selectedRepo.name, currentBranch);
      setSettingsName(selectedRepo.name);
      setSettingsDesc(selectedRepo.description || '');
      setSettingsBranch(selectedRepo.defaultBranch || 'main');
      setSettingsVisibility(selectedRepo.visibility || 'public');
    }
  }, [
    selectedRepo,
    currentBranch,
    fetchRepoIssues,
    fetchRepoPulls,
    fetchRepoBranches,
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
      {/* 1. Global Navigation Bar & Sliding History Drawer */}
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
        <div className="bg-[#010409] border-b border-[#30363D] pt-4 px-4 sm:px-8">
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

          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none border-t border-[#21262D] text-xs font-semibold">
            {[
              { id: 'code', label: '<> Code', badge: null },
              { id: 'issues', label: '⨀ Issues', badge: openIssuesCount },
              { id: 'pulls', label: '⑂ Pull requests', badge: openPullsCount },
              { id: 'agents', label: '✨ Copilot Fleet', badge: 'Cloud OS' },
              { id: 'mcp', label: '🔌 MCP Registry', badge: '288+' },
              { id: 'actions', label: '▶ Actions', badge: actions.length },
              { id: 'notifications', label: '🔔 Notifications', badge: 3 },
              { id: 'discussions', label: '💬 Discussions', badge: discussions.length },
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

      {/* 3. Main Workspace / Tab Content Body */}
      <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden">
        {/* VIEW A: All Repositories Directory */}
        {activeDeckTab === 'repos' && !selectedRepo && (
          <ReposDirectoryView
            repoSearchQuery={repoSearchQuery}
            setRepoSearchQuery={setRepoSearchQuery}
            repoTypeFilter={repoTypeFilter}
            setRepoTypeFilter={setRepoTypeFilter}
            repoLangFilter={repoLangFilter}
            setRepoLangFilter={setRepoLangFilter}
            filteredRepos={filteredRepos}
            openRepository={openRepository}
            setSelectedRepo={setSelectedRepo}
            setModalState={setModalState}
            showToast={showToast}
          />
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
                  onSelectBranch={setCurrentBranch}
                  showToast={showToast}
                />
              )}

              {activeGitHubTab === 'issues' && (
                <IssuesTab
                  issueSearchQuery={issueSearchQuery}
                  setIssueSearchQuery={setIssueSearchQuery}
                  filteredIssues={filteredIssues}
                  openIssuesCount={openIssuesCount}
                  closedIssuesCount={closedIssuesCount}
                  setModalState={setModalState}
                  openIssueDetail={openIssueDetail}
                  handleToggleIssue={handleToggleIssue}
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
                      showToast(`Dispatched cloud agent [${mode}] with ${model}`)
                    }
                  />
                  <div className="pt-6 border-t border-[#30363D]">
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
                <SecurityTab securityAlerts={securityAlerts} showToast={showToast} />
              )}

              {activeGitHubTab === 'insights' && <InsightsTab />}

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
                  <div className="pt-8 border-t border-[#30363D]">
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

        {/* VIEW D: Agent Lab (Swarm Fleet Command) */}
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

      {/* 4. Modals and Dialogs */}
      <QuantGitModals
        modalState={modalState}
        setModalState={setModalState}
        newBranchInput={newBranchInput}
        setNewBranchInput={setNewBranchInput}
        repoBranches={repoBranches}
        currentBranch={currentBranch}
        setCurrentBranch={setCurrentBranch}
        handleCreateBranch={handleCreateBranch}
        fileSearchQuery={fileSearchQuery}
        setFileSearchQuery={setFileSearchQuery}
        filteredFiles={filteredFiles}
        setViewingFile={setViewingFile}
        viewingFile={viewingFile}
        selectedRepo={selectedRepo}
        cloneProtocol={cloneProtocol}
        setCloneProtocol={setCloneProtocol}
        viewingBlobSha={viewingBlobSha}
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

      {/* 5. Bottom Navigation Dock */}
      <nav
        aria-label="Bottom primary workspace navigation"
        className="fixed bottom-0 inset-x-0 z-40 h-[72px] border-t border-[#30363D] bg-[#0D1117]/95 backdrop-blur-md flex items-center justify-around px-4 sm:px-8 select-none shadow-2xl"
      >
        <button
          type="button"
          onClick={() => {
            setIsCopilotDrawerOpen((prev) => !prev);
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            isCopilotDrawerOpen
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

      {/* Floating Trigger Button for Quanty Copilot */}
      <button
        type="button"
        onClick={() => setIsCopilotDrawerOpen((prev) => !prev)}
        className="fixed bottom-24 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold text-xs shadow-2xl transition-all hover:scale-105 active:scale-95"
        title="Toggle Quanty AI Copilot Drawer"
      >
        <span className="text-sm">✨</span>
        <span className="font-semibold">Quanty Copilot</span>
        {isCopilotDrawerOpen ? (
          <span className="text-[10px] ml-1 bg-black/20 px-1.5 py-0.5 rounded-full">✕</span>
        ) : (
          <span className="text-[10px] ml-1 bg-black/20 px-1.5 py-0.5 rounded-full">AI</span>
        )}
      </button>

      {/* Collapsible Quanty Copilot Side Drawer */}
      {isCopilotDrawerOpen && (
        <aside
          aria-label="Quanty AI Copilot Drawer"
          className="fixed top-0 right-0 bottom-[72px] z-40 w-full sm:w-[500px] lg:w-[560px] bg-[#0D1117] border-l border-[#30363D] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#21262D] bg-[#161B22]">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Quanty Copilot</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#FF8C42]/20 text-[#FF8C42] font-semibold border border-[#FF8C42]/30">
                    Sidecar
                  </span>
                </div>
                <p className="text-[11px] text-[#7D8590]">Autonomous workspace assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCopilotDrawerOpen(false)}
              className="p-1.5 rounded-md text-[#7D8590] hover:text-white hover:bg-[#21262D] transition-colors"
              title="Close Copilot"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
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
          </div>
        </aside>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#111318]/90 backdrop-blur-xl border border-[#FF8C42]/35 text-[#FF8C42] text-xs font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.08),0_0_20px_rgba(255,140,66,0.15)] animate-in fade-in slide-in-from-bottom-3">
          {toastMessage}
        </div>
      )}
    </main>
  );
}
