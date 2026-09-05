'use client';

// ============================================================================
// CodeHub — repository shell with GitHub-parity tabs:
// Code · Issues · Pull requests · Agents · Discussions · Actions · Projects ·
// Security · Insights · Settings — over the QuantMail code + CI APIs.
// ============================================================================

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Skeleton, ErrorState, EmptyState } from '@quant/shared-ui';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
// The route stays `/codehub`; the name the user reads comes from the one place
// that owns app names, so the next rename does not have to find this crumb.
import { appDisplayName } from '../../../components/BrandWordmark';
import {
  useRepo,
  useBranches,
  useCommits,
  usePullRequests,
  useIssues,
  useFileTree,
  useFileContent,
} from '../../../hooks/useRepos';
import { useWorkflows, useBuilds, useTriggerWorkflow } from '../../../hooks/usePipelines';
import {
  IconChat,
  IconCheck,
  IconChevronLeft,
  IconCircle,
  IconGitBranch,
  IconGitCommit,
} from '../../../components/icons';

const TABS = [
  'code',
  'issues',
  'pulls',
  'agents',
  'discussions',
  'actions',
  'projects',
  'security',
  'insights',
  'settings',
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  code: 'Code',
  issues: 'Issues',
  pulls: 'Pull requests',
  agents: 'Agents',
  discussions: 'Discussions',
  actions: 'Actions',
  projects: 'Projects',
  security: 'Security',
  insights: 'Insights',
  settings: 'Settings',
};

interface Named {
  id?: string;
  name?: string;
  path?: string;
  type?: string;
  title?: string;
  message?: string;
  status?: string;
  state?: string;
  author?: string;
  authorName?: string;
  sha?: string;
  createdAt?: string | Date;
  isDefault?: boolean;
  filename?: string;
  branch?: string;
  number?: number;
  labels?: string[];
  comments?: number;
}

function statusVariant(status?: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  switch (status) {
    case 'success':
    case 'merged':
    case 'closed-completed':
      return 'success';
    case 'failure':
    case 'failed':
      return 'danger';
    case 'running':
    case 'pending':
    case 'queued':
    case 'open':
      return 'warning';
    case 'cancelled':
    case 'closed':
      return 'default';
    default:
      return 'info';
  }
}

function relativeTime(value?: string | Date): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return '';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--quant-border)] bg-[color-mix(in_srgb,var(--quant-card)_92%,transparent)] overflow-hidden">
      {children}
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-[var(--quant-border)]">{children}</ul>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-[var(--quant-border)] text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--quant-border)] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-[var(--quant-muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--quant-muted-foreground)]">{hint}</p>}
    </div>
  );
}

/**
 * `plural(2, 'Branch', 'Branches')` → `'2 Branches'`.
 *
 * Several counters on this page used to read `{n || 1} Branches`, which asserted
 * that at least one branch existed even when the API had returned none, and
 * pluralised unconditionally so a single branch read "1 Branches". The count is
 * cheap to state correctly, so state it correctly.
 */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A tab-level note that the controls below are a layout preview, not a wired
 * surface.
 *
 * The Settings, Security and Agents tabs render GitHub-shaped panels whose
 * buttons have no handler and whose inputs have no submit path — pressing
 * "Save changes" or "Delete" does nothing at all. A control that looks live and
 * silently does nothing is the worst of the three states, so those buttons are
 * now `disabled` and each tab says once, at the top, what is actually true.
 */
function PreviewNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[#5C3016] bg-[#2B1A11] px-3.5 py-2.5 text-[11px] leading-relaxed text-[#E9C9A9]">
      {children}
    </p>
  );
}

/** The author of an issue or PR, which the API returns as a string or an object. */
function authorLabel(item: Named): string {
  const raw = (item as unknown as { author?: unknown }).author;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const person = raw as { name?: string; username?: string };
    return person.name || person.username || '';
  }
  return item.authorName ?? '';
}

/**
 * Applies the issue/PR filter box to one item.
 *
 * That box shipped pre-filled with `is:issue state:open` and wired to nothing —
 * you could type `state:closed` and the list below would not move. It supports
 * the four qualifiers the placeholder text implies, and treats anything else as
 * a free-text match on the title or `#number`:
 *
 *   state:open|closed   author:<name>   label:<name>   is:issue|pr (ignored —
 *   the active tab already decides which collection is on screen)
 */
function matchesQuery(item: Named, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;

  const state = String(item.state ?? item.status ?? 'open').toLowerCase();
  const author = authorLabel(item).toLowerCase();
  const labels = (item.labels ?? []).map((l) => String(l).toLowerCase());
  const title = String(item.title ?? '').toLowerCase();
  const number = String(item.number ?? '');

  return tokens.every((token) => {
    if (token.startsWith('is:')) return true;
    if (token.startsWith('state:')) {
      const wanted = token.slice(6);
      // `closed` covers every terminal state the API reports, `merged` included.
      if (wanted === 'closed') return state !== 'open';
      if (wanted === 'open') return state === 'open';
      return state === wanted;
    }
    if (token.startsWith('author:')) return author.includes(token.slice(7));
    if (token.startsWith('label:')) {
      const wanted = token.slice(6);
      return labels.some((l) => l.includes(wanted));
    }
    const bare = token.replace(/^#/, '');
    return title.includes(bare) || number === bare;
  });
}

export default function CodeHubRepoPage() {
  const params = useParams<{ repoId: string }>();
  const router = useRouter();
  const repoId = String(params?.repoId ?? '');
  const [tab, setTab] = useState<Tab>('code');
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState('');
  const [issueQuery, setIssueQuery] = useState('is:issue state:open');
  const [pullQuery, setPullQuery] = useState('is:pr state:open');
  const [cloneCopied, setCloneCopied] = useState(false);
  // The branch `<select>` used to be uncontrolled with its own `defaultValue`,
  // so picking a branch changed the visible label and nothing else. It now
  // drives the commits query key. `null` means "whatever the repo calls default",
  // which is only known once `repo` has loaded.
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const { data: repo, isLoading: loadingRepo, error: repoError, refetch } = useRepo(repoId);
  const { data: branchesData, isLoading: loadingBranches } = useBranches(repoId);
  const { data: commitsData, isLoading: loadingCommits } = useCommits(
    repoId,
    selectedBranch ?? undefined,
  );
  const { data: pullsData } = usePullRequests(repoId);
  const { data: issuesData } = useIssues(repoId);
  const { data: treeData, isLoading: loadingTree } = useFileTree(repoId);
  const { data: fileContent, isLoading: loadingFile } = useFileContent(repoId, openFile);
  const { data: workflowsData } = useWorkflows(repoId);
  const { data: buildsData } = useBuilds({ repoId });
  const triggerWorkflow = useTriggerWorkflow();

  const branches = (branchesData ?? []) as unknown as Named[];
  const commits = (commitsData ?? []) as unknown as Named[];
  const pulls = (pullsData ?? []) as unknown as Named[];
  const issues = (issuesData ?? []) as unknown as Named[];
  const tree = (treeData ?? []) as unknown as Named[];
  const workflows = (workflowsData ?? []) as unknown as Named[];
  const builds = (buildsData ?? []) as unknown as Named[];

  const repoInfo = repo as unknown as
    | {
        name?: string;
        fullName?: string;
        description?: string;
        visibility?: string;
        defaultBranch?: string;
        stars?: number;
        forks?: number;
        watchers?: number;
        language?: string;
        license?: string;
        cloneUrl?: string;
        updatedAt?: string | Date;
      }
    | undefined;

  const openIssues = issues.filter((i) => (i.state ?? i.status ?? 'open') === 'open');
  const openPulls = pulls.filter((p) => (p.state ?? p.status ?? 'open') === 'open');

  const counts = useMemo(
    () => ({ pulls: openPulls.length, issues: openIssues.length }),
    [openPulls.length, openIssues.length],
  );

  const latestCommit = commits[0];
  const defaultBranch = repoInfo?.defaultBranch ?? 'main';
  const branchNames = branches.map((b) => b.name).filter((name): name is string => !!name);
  // A repo row can exist with no branch rows — a freshly created repo has none
  // until the first push. Offering the default branch as a choice is honest
  // (that is where a push would land); claiming it already exists is not, so the
  // count below is the real one and the switcher is disabled while empty.
  const branchOptions = branchNames.length ? branchNames : [defaultBranch];
  const currentBranch = selectedBranch ?? defaultBranch;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://quantmail.in';
  const cloneUrl =
    repoInfo?.cloneUrl ?? `${baseUrl}/git/${repoInfo?.fullName ?? repoInfo?.name ?? repoId}.git`;

  const readmeNode = tree.find((node) => /^readme(\.md|\.mdx)?$/i.test(node.name ?? ''));
  const { data: readmeContent } = useFileContent(repoId, readmeNode?.path ?? null);

  const fileText =
    typeof fileContent === 'string'
      ? fileContent
      : ((fileContent as unknown as { content?: string })?.content ?? '');
  const readmeText =
    typeof readmeContent === 'string'
      ? readmeContent
      : ((readmeContent as unknown as { content?: string })?.content ?? '');

  const visibleTree = useMemo(() => {
    const sorted = [...tree].sort((a, b) => {
      const dirDelta = (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1);
      if (dirDelta !== 0) return dirDelta;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    if (!fileFilter.trim()) return sorted;
    const needle = fileFilter.trim().toLowerCase();
    return sorted.filter((node) => (node.name ?? node.path ?? '').toLowerCase().includes(needle));
  }, [tree, fileFilter]);

  const failedBuilds = builds.filter(
    (b) => (b.status ?? '') === 'failure' || b.status === 'failed',
  );

  const visibleIssues = useMemo(
    () => issues.filter((item) => matchesQuery(item, issueQuery)),
    [issues, issueQuery],
  );
  const visiblePulls = useMemo(
    () => pulls.filter((item) => matchesQuery(item, pullQuery)),
    [pulls, pullQuery],
  );

  const copyClone = async () => {
    try {
      await navigator.clipboard.writeText(cloneUrl);
      setCloneCopied(true);
      window.setTimeout(() => setCloneCopied(false), 1600);
    } catch {
      setCloneCopied(false);
    }
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page codehub-workspace flex flex-col h-full overflow-hidden">
        <header className="px-5 pt-4 border-b border-[var(--quant-border)]">
          <button
            type="button"
            onClick={() => router.push('/codehub')}
            className="inline-flex min-h-11 items-center gap-1 -ml-1 pr-2 pl-1 text-xs text-[var(--quant-muted-foreground)] transition-colors hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] rounded-lg"
          >
            <IconChevronLeft size={14} />
            {appDisplayName('code')}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-base font-semibold">
              {loadingRepo ? 'Loading…' : repoInfo?.fullName || repoInfo?.name || 'Repository'}
            </h1>
            {repoInfo?.visibility && (
              <Badge variant={repoInfo.visibility === 'public' ? 'success' : 'default'}>
                {repoInfo.visibility}
              </Badge>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <Button variant="secondary" onClick={() => setTab('settings')}>
                <svg
                  className="size-3.5 mr-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </Button>
              {/*
                Watch / Fork / Star used to be three `<Button variant="secondary">`
                with no `onClick` — full hover states, cursor pointer, and nothing
                behind them. There is no watch or star endpoint at all, and
                `apiClient.forkRepo` posts to `/repos/:id/fork`, which the backend
                does not register. The numbers themselves are real, so they stay;
                only the false affordance goes. These become buttons again on the
                day the routes land.
              */}
              {/*
                No aria-label here: a role-less div is role=generic, and ARIA 1.2
                §5.2.8.5 prohibits aria-label on generic, so the whole string was
                being dropped and three bare numbers were all that was announced.
                Each count carries its own sr-only noun instead.
              */}
              <div className="flex items-center gap-1.5 rounded-lg border border-[var(--quant-border)] px-2.5 py-1.5 text-[var(--quant-muted-foreground)]">
                <span className="flex items-center gap-1">
                  <svg
                    className="size-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {repoInfo?.watchers ?? 0}
                  <span className="sr-only"> watching</span>
                </span>
                <span aria-hidden="true" className="text-[var(--quant-border)]">
                  ·
                </span>
                <span className="flex items-center gap-1">
                  <svg
                    className="size-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {repoInfo?.forks ?? 0}
                  <span className="sr-only"> forks</span>
                </span>
                <span aria-hidden="true" className="text-[var(--quant-border)]">
                  ·
                </span>
                <span className="flex items-center gap-1">
                  <svg
                    className="size-3.5 text-[#FF8C42]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {repoInfo?.stars ?? 0}
                  <span className="sr-only"> stars</span>
                </span>
              </div>
              <Button variant="secondary" onClick={() => router.push(`/repos/${repoId}/editor`)}>
                Open editor
              </Button>
            </div>
          </div>
          {repoInfo?.description && (
            <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
              {repoInfo.description}
            </p>
          )}
          <nav className="mt-4 flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((item) => {
              const active = tab === item;
              const badge =
                item === 'pulls'
                  ? counts.pulls
                  : item === 'issues'
                    ? counts.issues
                    : item === 'security'
                      ? failedBuilds.length
                      : undefined;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative min-h-11 whitespace-nowrap rounded-t-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    active
                      ? 'text-[var(--quant-foreground)] font-medium'
                      : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
                  }`}
                >
                  {TAB_LABELS[item]}
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--quant-primary)_22%,transparent)] px-1.5 py-0.5 text-[10px]">
                      {badge}
                    </span>
                  )}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--quant-primary)]" />
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {repoError && <ErrorState message={repoError.message} onRetry={() => void refetch()} />}

          {tab === 'code' && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
              <div className="space-y-4">
                {/* Branch bar — branch switcher, counts, find file, clone */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="min-h-11 rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] disabled:opacity-60"
                    value={currentBranch}
                    onChange={(event) => setSelectedBranch(event.target.value)}
                    disabled={branchNames.length <= 1}
                    aria-label="Switch branch"
                  >
                    {branchOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--quant-muted-foreground)]">
                    <IconGitBranch size={13} />
                    {loadingBranches
                      ? 'Loading branches…'
                      : plural(branches.length, 'Branch', 'Branches')}
                  </span>
                  <input
                    value={fileFilter}
                    onChange={(event) => setFileFilter(event.target.value)}
                    placeholder="Go to file"
                    className="ml-auto min-h-11 w-48 rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    aria-label="Go to file"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => router.push(`/repos/${repoId}/editor`)}
                  >
                    Add file
                  </Button>
                  <Button variant="primary" onClick={copyClone}>
                    {cloneCopied ? (
                      <span className="flex items-center gap-1">
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Copied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="16 18 22 12 16 6" />
                          <polyline points="8 6 2 12 8 18" />
                        </svg>
                        Code
                      </span>
                    )}
                  </Button>
                </div>

                {/* Latest commit strip */}
                <Panel>
                  {/*
                    This strip used to render unconditionally, with
                    `latestCommit?.authorName ?? 'quantrinitylab'` as the author and
                    `'No commits yet'` as the message — so an empty repo showed a
                    named person next to a blank sha and the words "No commits yet",
                    all in one line. `GET /repos/:id/commits` currently returns an
                    empty list for every repo, which means that fabricated row was
                    the *only* thing this strip ever showed. Now the empty case says
                    what is true and names nobody.
                  */}
                  {latestCommit ? (
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
                      <span className="font-medium">
                        {
                          (latestCommit.authorName ??
                            latestCommit.author ??
                            'Unknown author') as string
                        }
                      </span>
                      <span className="truncate text-[var(--quant-muted-foreground)]">
                        {latestCommit.message ?? ''}
                      </span>
                      <span className="ml-auto flex items-center gap-1.5 font-mono text-[var(--quant-muted-foreground)]">
                        {(latestCommit.sha ?? '').slice(0, 7)}
                        <span aria-hidden="true">·</span>
                        {relativeTime(latestCommit.createdAt)}
                      </span>
                      <span className="flex items-center gap-1.5 text-[var(--quant-muted-foreground)]">
                        <IconGitCommit size={13} />
                        {plural(commits.length, 'commit', 'commits')}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs text-[var(--quant-muted-foreground)]">
                      <IconGitCommit size={13} />
                      {loadingCommits
                        ? 'Loading commit history…'
                        : `No commits on ${currentBranch} yet.`}
                    </div>
                  )}

                  {loadingTree && (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} variant="rect" width="100%" height="20px" />
                      ))}
                    </div>
                  )}
                  {!loadingTree && visibleTree.length === 0 && (
                    <p className="px-4 py-4 text-xs text-[var(--quant-muted-foreground)]">
                      {tree.length === 0
                        ? 'This repository is empty. Push your first commit or use the editor.'
                        : 'No file matches that name.'}
                    </p>
                  )}
                  <Rows>
                    {visibleTree.map((node) => (
                      <li key={node.path ?? node.name}>
                        <button
                          type="button"
                          onClick={() => node.type !== 'dir' && setOpenFile(node.path ?? null)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--quant-primary)_10%,transparent)] ${
                            openFile === node.path ? 'text-[var(--quant-primary)]' : ''
                          }`}
                        >
                          <span className="text-[#FF8C42]">
                            {node.type === 'dir' ? (
                              <svg
                                className="size-4 inline"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              </svg>
                            ) : (
                              <svg
                                className="size-4 inline text-[#A1A4AC]"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                            )}
                          </span>
                          <span className="truncate">{node.name ?? node.path}</span>
                          {/*
                            Each row used to end with `latestCommit?.message` and
                            `relativeTime(latestCommit?.createdAt)` — the repo's newest
                            commit, repeated verbatim on every file. GitHub's version of
                            that column is per-file history, which the tree endpoint does
                            not return, so every row was claiming a commit touched it
                            when most had not. Removed until `/tree` carries per-node
                            commit data; it also buys back the width mobile needs.
                          */}
                        </button>
                      </li>
                    ))}
                  </Rows>
                </Panel>

                {/* File viewer / README */}
                {openFile ? (
                  <Panel>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--quant-border)]">
                      <span className="text-xs font-medium truncate">{openFile}</span>
                      <button
                        type="button"
                        onClick={() => setOpenFile(null)}
                        className="text-[11px] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                      >
                        Close
                      </button>
                    </div>
                    {loadingFile && <Skeleton variant="rect" width="100%" height="220px" />}
                    {!loadingFile && (
                      <pre className="max-h-[60vh] overflow-auto px-4 py-3 text-[11px] leading-5 text-[var(--quant-muted-foreground)] whitespace-pre-wrap">
                        {fileText || 'Empty file'}
                      </pre>
                    )}
                  </Panel>
                ) : (
                  readmeText && (
                    <Panel>
                      <SectionTitle>{readmeNode?.name ?? 'README.md'}</SectionTitle>
                      <pre className="max-h-[60vh] overflow-auto px-4 py-3 text-[12px] leading-6 whitespace-pre-wrap">
                        {readmeText}
                      </pre>
                    </Panel>
                  )
                )}
              </div>

              {/* About rail */}
              <aside className="space-y-3">
                <Panel>
                  <SectionTitle>About</SectionTitle>
                  <div className="px-4 py-3 space-y-2 text-xs">
                    <p className="text-[var(--quant-muted-foreground)]">
                      {repoInfo?.description || 'No description provided.'}
                    </p>
                    <ul className="space-y-2 text-[var(--quant-muted-foreground)]">
                      {readmeNode && (
                        <li className="flex items-center gap-2">
                          <svg
                            className="size-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                          </svg>
                          <span>Readme</span>
                        </li>
                      )}
                      {repoInfo?.license && (
                        <li className="flex items-center gap-2">
                          <svg
                            className="size-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          <span>{repoInfo.license}</span>
                        </li>
                      )}
                      {repoInfo?.language && (
                        <li className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-[#FF8C42]" />
                          <span>{repoInfo.language}</span>
                        </li>
                      )}
                      <li className="flex items-center gap-2">
                        <svg
                          className="size-3.5 text-[#FF8C42]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span>{repoInfo?.stars ?? 0} stars</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>{repoInfo?.watchers ?? 0} watching</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="6" y1="3" x2="6" y2="15" />
                          <circle cx="18" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                        <span>{repoInfo?.forks ?? 0} forks</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span>{commits.length} commits</span>
                      </li>
                    </ul>
                    <div className="pt-1">
                      <p className="text-[11px] uppercase tracking-wide">Clone</p>
                      <code className="mt-1 block truncate rounded-lg border border-[var(--quant-border)] px-2 py-1 text-[10px]">
                        {cloneUrl}
                      </code>
                    </div>
                  </div>
                </Panel>
                <Panel>
                  <SectionTitle>Recent activity</SectionTitle>
                  <Rows>
                    {commits.slice(0, 5).map((commit) => (
                      <li key={commit.sha ?? commit.id} className="px-4 py-2 text-[11px]">
                        <p className="truncate">{commit.message ?? 'commit'}</p>
                        <p className="text-[var(--quant-muted-foreground)]">
                          {relativeTime(commit.createdAt)}
                        </p>
                      </li>
                    ))}
                    {commits.length === 0 && (
                      <li className="px-4 py-3 text-[11px] text-[var(--quant-muted-foreground)]">
                        No activity yet.
                      </li>
                    )}
                  </Rows>
                </Panel>
              </aside>
            </div>
          )}

          {(tab === 'issues' || tab === 'pulls') && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={tab === 'issues' ? issueQuery : pullQuery}
                  onChange={(event) =>
                    tab === 'issues'
                      ? setIssueQuery(event.target.value)
                      : setPullQuery(event.target.value)
                  }
                  placeholder="state:open author:name label:bug free text"
                  className="min-h-11 flex-1 min-w-[220px] rounded-lg border border-[var(--quant-border)] bg-transparent px-3 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  aria-label="Filter query"
                />
                {/*
                  Six dropdown buttons stood here — Author, Labels, Projects,
                  Milestones, Assignees, Sort — each with a `▾`, no handler and no
                  menu, and they wrapped onto four rows at 375px. The box to their
                  left now actually filters (see `matchesQuery`), which is what
                  they were imitating.
                */}
                <Button variant="primary" disabled>
                  {tab === 'issues' ? 'New issue' : 'New pull request'}
                </Button>
              </div>

              <Panel>
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[var(--quant-border)] text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <IconCircle size={12} />
                    {(tab === 'issues' ? openIssues : openPulls).length} Open
                  </span>
                  <span className="flex items-center gap-1.5 text-[var(--quant-muted-foreground)]">
                    <IconCheck size={12} />
                    {(tab === 'issues' ? issues : pulls).length -
                      (tab === 'issues' ? openIssues : openPulls).length}{' '}
                    Closed
                  </span>
                  {(tab === 'issues' ? issueQuery : pullQuery).trim() && (
                    <span className="ml-auto text-[var(--quant-muted-foreground)]">
                      {(tab === 'issues' ? visibleIssues : visiblePulls).length} match
                      {(tab === 'issues' ? visibleIssues : visiblePulls).length === 1 ? '' : 'es'}
                    </span>
                  )}
                </div>
                {(tab === 'issues' ? issues : pulls).length === 0 && (
                  <EmptyState
                    title={tab === 'pulls' ? 'No pull requests' : 'No issues'}
                    description={
                      tab === 'pulls'
                        ? 'Open a pull request to get review, checks and merge history in QuantGit.'
                        : 'Track bugs and work items right next to the code and pipelines.'
                    }
                  />
                )}
                {(tab === 'issues' ? issues : pulls).length > 0 &&
                  (tab === 'issues' ? visibleIssues : visiblePulls).length === 0 && (
                    <p className="px-4 py-4 text-xs text-[var(--quant-muted-foreground)]">
                      Nothing matches that filter.
                    </p>
                  )}
                <Rows>
                  {(tab === 'issues' ? visibleIssues : visiblePulls).map((item) => (
                    <li
                      key={item.id ?? item.number}
                      className="flex items-start justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{item.title ?? 'Untitled'}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--quant-muted-foreground)]">
                          <span>
                            #{item.number ?? '—'}
                            {relativeTime(item.createdAt)
                              ? ` · opened ${relativeTime(item.createdAt)}`
                              : ''}
                          </span>
                          {item.comments ? (
                            <span className="flex items-center gap-1">
                              <span aria-hidden="true">·</span>
                              <IconChat size={11} />
                              {item.comments}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <Badge variant={statusVariant(item.state ?? item.status)}>
                        {item.state ?? item.status ?? 'open'}
                      </Badge>
                    </li>
                  ))}
                </Rows>
              </Panel>
            </div>
          )}

          {tab === 'actions' && (
            <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
              <Panel>
                <SectionTitle>Workflows</SectionTitle>
                <Rows>
                  <li className="px-4 py-2 text-xs font-medium">All workflows</li>
                  {workflows.map((workflow) => (
                    <li
                      key={workflow.id ?? workflow.name}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-xs"
                    >
                      <span className="truncate">{workflow.name ?? workflow.filename}</span>
                      <button
                        type="button"
                        onClick={() =>
                          triggerWorkflow.mutate({
                            repoId,
                            workflowId: String(workflow.id ?? ''),
                            ref: currentBranch,
                          } as never)
                        }
                        aria-label={`Run ${workflow.name ?? workflow.filename} on ${currentBranch}`}
                        className="min-h-11 flex-none rounded-lg px-2 text-[11px] font-medium text-[var(--quant-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--quant-primary)_12%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                      >
                        Run
                      </button>
                    </li>
                  ))}
                  {workflows.length === 0 && (
                    <li className="px-4 py-3 text-xs text-[var(--quant-muted-foreground)]">
                      No workflows yet.
                    </li>
                  )}
                </Rows>
              </Panel>
              <Panel>
                <SectionTitle>Workflow runs</SectionTitle>
                {builds.length === 0 && (
                  <EmptyState
                    title="No runs yet"
                    description="Runs appear here as soon as a workflow is triggered."
                  />
                )}
                <Rows>
                  {builds.map((build) => (
                    <li key={build.id} className="flex items-center gap-3 px-4 py-3 text-xs">
                      <Badge variant={statusVariant(build.status)}>
                        {build.status ?? 'queued'}
                      </Badge>
                      <div className="min-w-0">
                        <p className="truncate">{build.message ?? build.name ?? 'workflow run'}</p>
                        <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                          {[build.branch, relativeTime(build.createdAt)]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </Rows>
              </Panel>
            </div>
          )}

          {tab === 'insights' && (
            <div className="space-y-4">
              {/*
                A `Last 7 / 30 / 90 days` selector sat here. Its state was read in
                exactly one place — its own active border — so all three buttons
                showed the same four numbers. None of the four are time-scoped in
                the first place ("open right now", "need triage", "in this
                repository"), so there is nothing for a window to narrow. It comes
                back the day these become series rather than totals.
              */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Active PRs" value={openPulls.length} hint="open right now" />
                <StatCard label="Open issues" value={openIssues.length} hint="need triage" />
                <StatCard
                  label="Commits"
                  value={loadingCommits ? '—' : commits.length}
                  hint={`on ${currentBranch}`}
                />
                <StatCard
                  label="Branches"
                  value={loadingBranches ? '—' : branches.length}
                  hint={branches.length === 0 ? 'nothing pushed yet' : undefined}
                />
              </div>
              <Panel>
                <SectionTitle>Top committers</SectionTitle>
                <Rows>
                  {Object.entries(
                    commits.reduce<Record<string, number>>((acc, commit) => {
                      const key = String(commit.authorName ?? commit.author ?? 'unknown');
                      acc[key] = (acc[key] ?? 0) + 1;
                      return acc;
                    }, {}),
                  )
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([author, total]) => (
                      <li
                        key={author}
                        className="flex items-center justify-between px-4 py-2 text-xs"
                      >
                        <span>{author}</span>
                        <span className="text-[var(--quant-muted-foreground)]">
                          {total} commits
                        </span>
                      </li>
                    ))}
                  {commits.length === 0 && (
                    <li className="px-4 py-3 text-xs text-[var(--quant-muted-foreground)]">
                      No commits to analyse yet.
                    </li>
                  )}
                </Rows>
              </Panel>
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-3">
              <PreviewNotice>
                Code scanning below is live — it reads your real pipeline runs. Policy, advisories
                and dependency alerts are not built yet, so those three buttons are disabled rather
                than silently doing nothing.
              </PreviewNotice>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    title: 'Security policy',
                    body: 'Publish a SECURITY.md so reporters know where to send findings.',
                    action: 'Set up policy',
                    onClick: undefined as (() => void) | undefined,
                  },
                  {
                    title: 'Security advisories',
                    body: 'Draft private advisories and coordinate a fix before disclosure.',
                    action: 'View advisories',
                    onClick: undefined,
                  },
                  {
                    title: 'Dependency alerts',
                    body: 'Get alerted when a dependency has a known vulnerability.',
                    action: 'Enable alerts',
                    onClick: undefined,
                  },
                  {
                    title: 'Code scanning',
                    body:
                      failedBuilds.length === 0
                        ? 'No failing runs in the latest pipelines.'
                        : `${plural(failedBuilds.length, 'failing run', 'failing runs')} in the latest pipelines.`,
                    action: 'Review runs',
                    onClick: () => setTab('actions'),
                  },
                ].map((card) => (
                  <Panel key={card.title}>
                    <SectionTitle>{card.title}</SectionTitle>
                    <div className="px-4 py-3 space-y-3 text-xs">
                      <p className="text-[var(--quant-muted-foreground)]">{card.body}</p>
                      <Button variant="secondary" disabled={!card.onClick} onClick={card.onClick}>
                        {card.action}
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4 max-w-3xl">
              {/*
                Everything on this tab was fully interactive and connected to
                nothing: two inputs you could type into, a primary "Save changes",
                five pre-checked feature toggles, and a Danger zone whose Delete
                button had no handler at all. There is no repository-update route
                on the backend — `api-client` has `createRepo` and `deleteRepo` and
                nothing in between — so none of it could have worked.

                The fields are now read-only mirrors of the real values, the
                actions are disabled, and the notice says so once. Delete stays
                disabled deliberately even though `DELETE /repos/:id` exists: a
                destructive action needs a confirmation step before it gets a
                handler, not just a route.
              */}
              <PreviewNotice>
                These settings are read-only for now — there is no repository-update endpoint behind
                them yet, so nothing here saves. The values shown are the live ones.
              </PreviewNotice>
              <Panel>
                <SectionTitle>General</SectionTitle>
                <div className="px-4 py-4 space-y-3 text-xs">
                  <label className="block">
                    <span className="text-[var(--quant-muted-foreground)]">Repository name</span>
                    <input
                      value={repoInfo?.name ?? ''}
                      readOnly
                      className="mt-1 min-h-11 w-full rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 text-[var(--quant-muted-foreground)]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[var(--quant-muted-foreground)]">Default branch</span>
                    <input
                      value={defaultBranch}
                      readOnly
                      className="mt-1 min-h-11 w-full rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 text-[var(--quant-muted-foreground)]"
                    />
                  </label>
                  <Button variant="primary" disabled>
                    Save changes
                  </Button>
                </div>
              </Panel>
              <Panel>
                <SectionTitle>Features</SectionTitle>
                {/*
                  Five checkboxes are one set — repository features — and a styled
                  div is neither a heading nor a label, so nothing tied them
                  together. role="group" with a name says where the set starts and
                  ends.
                */}
                <div role="group" aria-label="Features" className="px-4 py-4 space-y-2 text-xs">
                  {['Issues', 'Pull requests', 'Discussions', 'Projects', 'Actions'].map(
                    (feature) => (
                      <label
                        key={feature}
                        className="flex min-h-11 items-center gap-2 text-[var(--quant-muted-foreground)]"
                      >
                        <input type="checkbox" checked disabled readOnly />
                        <span>{feature}</span>
                      </label>
                    ),
                  )}
                </div>
              </Panel>
              <div className="rounded-2xl border border-[rgba(255,99,71,0.4)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[rgba(255,99,71,0.3)] text-xs font-semibold uppercase tracking-wide text-[#ff8f6b]">
                  Danger zone
                </div>
                <div className="divide-y divide-[rgba(255,99,71,0.2)] text-xs">
                  {[
                    ['Change visibility', 'Make this repository public or private.'],
                    ['Transfer ownership', 'Move this repository to another owner or org.'],
                    ['Archive this repository', 'Mark it read-only for everyone.'],
                    ['Delete this repository', 'This action cannot be undone.'],
                  ].map(([title, body]) => (
                    <div key={title} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-medium">{title}</p>
                        <p className="text-[var(--quant-muted-foreground)]">{body}</p>
                      </div>
                      <Button variant="secondary" disabled>
                        {title.split(' ')[0]}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'agents' && (
            <Panel>
              <SectionTitle>QuantAI agents</SectionTitle>
              <div className="px-4 py-4 space-y-3 text-xs">
                <p className="text-[var(--quant-muted-foreground)]">
                  Hand a task to QuantAI: review an open pull request, triage an issue, or explain a
                  failing pipeline run — right inside QuantGit.
                </p>
                <PreviewNotice>
                  Not wired to the agent runner yet. Quanty in the mail workspace is the one that
                  works today.
                </PreviewNotice>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled>
                    Review latest PR
                  </Button>
                  <Button variant="secondary" disabled>
                    Triage open issues
                  </Button>
                  <Button variant="secondary" disabled>
                    Explain failing run
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {tab === 'discussions' && (
            <Panel>
              <SectionTitle>Discussions</SectionTitle>
              <EmptyState
                title="Start the first discussion"
                description="Discussions keep design debates and questions next to the code, and every reply can be mailed from QuantMail."
              />
            </Panel>
          )}

          {tab === 'projects' && (
            <Panel>
              <SectionTitle>Projects</SectionTitle>
              <EmptyState
                title="No projects yet"
                description="Group issues and pull requests into a board, and mirror milestone dates onto your QuantMail calendar."
              />
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
