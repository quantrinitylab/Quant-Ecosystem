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
import { PageTransition } from '../../../components/PageTransition';
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

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
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
  const [insightsPeriod, setInsightsPeriod] = useState<'7' | '30' | '90'>('30');

  const { data: repo, isLoading: loadingRepo, error: repoError, refetch } = useRepo(repoId);
  const { data: branchesData } = useBranches(repoId);
  const { data: commitsData } = useCommits(repoId);
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
  const cloneUrl =
    repoInfo?.cloneUrl ??
    `https://quantmail.quantrinity.in/git/${repoInfo?.fullName ?? repoInfo?.name ?? repoId}.git`;

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

  const failedBuilds = builds.filter((b) => (b.status ?? '') === 'failure' || b.status === 'failed');

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
      <PageTransition className="workspace-page codehub-workspace flex flex-col h-full overflow-hidden">
        <header className="px-5 pt-4 border-b border-[var(--quant-border)]">
          <button
            type="button"
            onClick={() => router.push('/codehub')}
            className="text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
          >
            ← CodeHub
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
                ⚙ Settings
              </Button>
              <Button variant="secondary">👁 Watch {repoInfo?.watchers ?? 0}</Button>
              <Button variant="secondary">⑂ Fork {repoInfo?.forks ?? 0}</Button>
              <Button variant="secondary">★ Star {repoInfo?.stars ?? 0}</Button>
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
          <nav className="mt-4 flex gap-1 overflow-x-auto">
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
                  className={`relative whitespace-nowrap rounded-t-lg px-3 py-2 text-sm transition-colors ${
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
                    className="rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 py-1.5 text-xs"
                    defaultValue={defaultBranch}
                    aria-label="Switch branch"
                  >
                    {(branches.length ? branches : [{ name: defaultBranch }]).map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    ⑂ {branches.length || 1} Branches
                  </span>
                  <input
                    value={fileFilter}
                    onChange={(event) => setFileFilter(event.target.value)}
                    placeholder="Go to file"
                    className="ml-auto w-48 rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 py-1.5 text-xs"
                    aria-label="Go to file"
                  />
                  <Button variant="secondary" onClick={() => router.push(`/repos/${repoId}/editor`)}>
                    Add file
                  </Button>
                  <Button variant="primary" onClick={copyClone}>
                    {cloneCopied ? 'Copied ✓' : '<> Code'}
                  </Button>
                </div>

                {/* Latest commit strip */}
                <Panel>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
                    <span className="font-medium">
                      {(latestCommit?.authorName ?? latestCommit?.author ?? 'quantrinitylab') as string}
                    </span>
                    <span className="truncate text-[var(--quant-muted-foreground)]">
                      {latestCommit?.message ?? 'No commits yet'}
                    </span>
                    <span className="ml-auto text-[var(--quant-muted-foreground)]">
                      {(latestCommit?.sha ?? '').slice(0, 7)} · {relativeTime(latestCommit?.createdAt)}
                    </span>
                    <span className="text-[var(--quant-muted-foreground)]">
                      ⏱ {commits.length} Commits
                    </span>
                  </div>

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
                          <span>{node.type === 'dir' ? '📁' : '📄'}</span>
                          <span className="truncate">{node.name ?? node.path}</span>
                          <span className="ml-auto truncate text-[var(--quant-muted-foreground)] hidden sm:inline">
                            {latestCommit?.message ?? ''}
                          </span>
                          <span className="text-[var(--quant-muted-foreground)] whitespace-nowrap">
                            {relativeTime(latestCommit?.createdAt)}
                          </span>
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
                    <ul className="space-y-1.5 text-[var(--quant-muted-foreground)]">
                      {readmeNode && <li>📖 Readme</li>}
                      {repoInfo?.license && <li>⚖ {repoInfo.license}</li>}
                      {repoInfo?.language && <li>● {repoInfo.language}</li>}
                      <li>★ {repoInfo?.stars ?? 0} stars</li>
                      <li>👁 {repoInfo?.watchers ?? 0} watching</li>
                      <li>⑂ {repoInfo?.forks ?? 0} forks</li>
                      <li>⏱ {commits.length} commits</li>
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
                  className="flex-1 min-w-[220px] rounded-lg border border-[var(--quant-border)] bg-transparent px-3 py-1.5 text-xs font-mono"
                  aria-label="Filter query"
                />
                {['Author', 'Labels', 'Projects', 'Milestones', 'Assignees', 'Sort'].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className="rounded-lg border border-[var(--quant-border)] px-2.5 py-1.5 text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                  >
                    {filter} ▾
                  </button>
                ))}
                <Button variant="primary">
                  {tab === 'issues' ? 'New issue' : 'New pull request'}
                </Button>
              </div>

              <Panel>
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[var(--quant-border)] text-xs">
                  <span className="font-medium">
                    ◉ {(tab === 'issues' ? openIssues : openPulls).length} Open
                  </span>
                  <span className="text-[var(--quant-muted-foreground)]">
                    ✓{' '}
                    {(tab === 'issues' ? issues : pulls).length -
                      (tab === 'issues' ? openIssues : openPulls).length}{' '}
                    Closed
                  </span>
                </div>
                {(tab === 'issues' ? issues : pulls).length === 0 && (
                  <EmptyState
                    title={tab === 'pulls' ? 'No pull requests' : 'No issues'}
                    description={
                      tab === 'pulls'
                        ? 'Open a pull request to get review, checks and merge history in CodeHub.'
                        : 'Track bugs and work items right next to the code and pipelines.'
                    }
                  />
                )}
                <Rows>
                  {(tab === 'issues' ? issues : pulls).map((item) => (
                    <li
                      key={item.id ?? item.number}
                      className="flex items-start justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{item.title ?? 'Untitled'}</p>
                        <p className="mt-1 text-[11px] text-[var(--quant-muted-foreground)]">
                          #{item.number ?? '—'} · opened {relativeTime(item.createdAt)}
                          {item.comments ? ` · 💬 ${item.comments}` : ''}
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
                            ref: defaultBranch,
                          } as never)
                        }
                        className="text-[10px] text-[var(--quant-primary)]"
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
                      <Badge variant={statusVariant(build.status)}>{build.status ?? 'queued'}</Badge>
                      <div className="min-w-0">
                        <p className="truncate">{build.message ?? build.name ?? 'workflow run'}</p>
                        <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                          {build.branch ?? defaultBranch} · {relativeTime(build.createdAt)}
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
              <div className="flex items-center gap-2">
                {(['7', '30', '90'] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setInsightsPeriod(period)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                      insightsPeriod === period
                        ? 'border-[var(--quant-primary)] text-[var(--quant-foreground)]'
                        : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)]'
                    }`}
                  >
                    Last {period} days
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Active PRs" value={openPulls.length} hint="open right now" />
                <StatCard label="Open issues" value={openIssues.length} hint="need triage" />
                <StatCard label="Commits" value={commits.length} hint="in this repository" />
                <StatCard label="Branches" value={branches.length || 1} />
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
                        <span className="text-[var(--quant-muted-foreground)]">{total} commits</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  title: 'Security policy',
                  body: 'Publish a SECURITY.md so reporters know where to send findings.',
                  action: 'Set up policy',
                },
                {
                  title: 'Security advisories',
                  body: 'Draft private advisories and coordinate a fix before disclosure.',
                  action: 'View advisories',
                },
                {
                  title: 'Dependency alerts',
                  body: 'Get alerted when a dependency has a known vulnerability.',
                  action: 'Enable alerts',
                },
                {
                  title: 'Code scanning',
                  body: `${failedBuilds.length} failing run(s) in the latest pipelines.`,
                  action: 'Review runs',
                },
              ].map((card) => (
                <Panel key={card.title}>
                  <SectionTitle>{card.title}</SectionTitle>
                  <div className="px-4 py-3 space-y-3 text-xs">
                    <p className="text-[var(--quant-muted-foreground)]">{card.body}</p>
                    <Button variant="secondary">{card.action}</Button>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4 max-w-3xl">
              <Panel>
                <SectionTitle>General</SectionTitle>
                <div className="px-4 py-4 space-y-3 text-xs">
                  <label className="block">
                    <span className="text-[var(--quant-muted-foreground)]">Repository name</span>
                    <input
                      defaultValue={repoInfo?.name ?? ''}
                      className="mt-1 w-full rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 py-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[var(--quant-muted-foreground)]">Default branch</span>
                    <input
                      defaultValue={defaultBranch}
                      className="mt-1 w-full rounded-lg border border-[var(--quant-border)] bg-transparent px-2.5 py-1.5"
                    />
                  </label>
                  <Button variant="primary">Save changes</Button>
                </div>
              </Panel>
              <Panel>
                <SectionTitle>Features</SectionTitle>
                <div className="px-4 py-4 space-y-2 text-xs">
                  {['Issues', 'Pull requests', 'Discussions', 'Projects', 'Actions'].map(
                    (feature) => (
                      <label key={feature} className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked />
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
                      <Button variant="secondary">{title.split(' ')[0]}</Button>
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
                  failing pipeline run — right inside CodeHub.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary">Review latest PR</Button>
                  <Button variant="secondary">Triage open issues</Button>
                  <Button variant="secondary">Explain failing run</Button>
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
      </PageTransition>
    </AppShell>
  );
}
