export type MainDeckTab = 'quanty' | 'repos' | 'code' | 'lab';

export type GitHubTab =
  | 'code'
  | 'commits'
  | 'branches'
  | 'issues'
  | 'pulls'
  | 'agents'
  | 'discussions'
  | 'actions'
  | 'projects'
  | 'security'
  | 'insights'
  | 'settings'
  | 'mcp'
  | 'notifications';

export type BuildMode = 'plan' | 'build' | 'auto';
export type Effort = 'fast' | 'deep';
export type CloneProtocol = 'https' | 'ssh' | 'cli' | 'quant';

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
  branchCount?: number;
  commitCount?: number;
  branches?: string[];
};

export type CommitDiffLine = {
  type: 'addition' | 'deletion' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
};

export type CommitFileDiff = {
  filename: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  patch?: string;
  lines?: CommitDiffLine[];
};

export type CommitItem = {
  sha: string;
  shortSha?: string;
  message: string;
  body?: string;
  author: {
    name: string;
    email?: string;
    avatarUrl?: string;
    username?: string;
  };
  committer?: {
    name: string;
    email?: string;
  };
  date: string;
  relativeTime: string;
  verified: boolean;
  verificationReason?: string;
  stats?: {
    totalFiles: number;
    additions: number;
    deletions: number;
  };
  files?: CommitFileDiff[];
  parents?: string[];
};

export type BranchItem = {
  name: string;
  sha: string;
  isDefault: boolean;
  isProtected: boolean;
  protection?: string;
  aheadBy: number;
  behindBy: number;
  lastCommitAuthor?: string;
  lastCommitMessage?: string;
  lastCommitTime?: string;
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

export type PRReviewDecision = 'approve' | 'request_changes' | 'comment';

export type PRReviewItem = {
  id: string;
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  body: string;
  createdAt: string;
};

export type PRDiffLine = {
  id: string;
  type: 'addition' | 'deletion' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
};

export type PRDiffFile = {
  filename: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  hunks: {
    header: string;
    lines: PRDiffLine[];
  }[];
};

export type PRDiffComment = {
  id: string;
  lineId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export type WorkflowStepItem = {
  id: string;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'success';
  duration: string;
  logs: string[];
};

export type WorkflowRunItem = {
  id: number | string;
  name: string;
  workflow: string;
  status: 'success' | 'in_progress' | 'queued' | 'failed' | 'completed';
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
  actor?: string;
  conclusion?: string;
  createdAt?: string;
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

export type ModalState =
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
  | 'issue-detail';

export type ChatSession = {
  id: string;
  title: string;
  date: string;
  count: number;
};

export type AccessoryType =
  | 'none'
  | 'crown'
  | 'firefighter'
  | 'mustache'
  | 'scarf'
  | 'flower'
  | 'pencil'
  | 'duck'
  | 'cowboy'
  | 'propeller';

export type AIModelId = 'opus-5' | 'sonnet-35' | 'quant-slm';
export type NotionMode = 'default' | 'ask';
export type ContextSubmenu = 'none' | 'repos-files' | 'mention' | 'skills';
export type SettingsSubmenu = 'none' | 'computer' | 'sources' | 'mcp' | 'mode';
