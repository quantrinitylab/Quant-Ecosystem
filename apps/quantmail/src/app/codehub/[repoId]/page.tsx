'use client';

// ============================================================================
// CodeHub — repository view. GitHub-style tab layout (Code, Commits, Branches,
// Pull requests, Issues, Actions) over the QuantMail code + CI APIs.
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

const TABS = ['code', 'commits', 'branches', 'pulls', 'issues', 'actions'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  code: 'Code',
  commits: 'Commits',
  branches: 'Branches',
  pulls: 'Pull requests',
  issues: 'Issues',
  actions: 'Actions',
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

export default function CodeHubRepoPage() {
  const params = useParams<{ repoId: string }>();
  const router = useRouter();
  const repoId = String(params?.repoId ?? '');
  const [tab, setTab] = useState<Tab>('code');
  const [openFile, setOpenFile] = useState<string | null>(null);

  const { data: repo, isLoading: loadingRepo, error: repoError, refetch } = useRepo(repoId);
  const { data: branchesData } = useBranches(repoId);
  const { data: commitsData, isLoading: loadingCommits } = useCommits(repoId);
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

  const repoInfo = repo as unknown as {
    name?: string;
    fullName?: string;
    description?: string;
    visibility?: string;
    defaultBranch?: string;
    stars?: number;
    forks?: number;
  } | undefined;

  const counts = useMemo(
    () => ({
      pulls: pulls.filter((p) => (p.state ?? p.status ?? 'open') === 'open').length,
      issues: issues.filter((i) => (i.state ?? i.status ?? 'open') === 'open').length,
    }),
    [pulls, issues],
  );

  const fileText =
    typeof fileContent === 'string'
      ? fileContent
      : ((fileContent as unknown as { content?: string })?.content ?? '');

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
            <div className="ml-auto flex items-center gap-3 text-xs text-[var(--quant-muted-foreground)]">
              <span>★ {repoInfo?.stars ?? 0}</span>
              <span>⑂ {repoInfo?.forks ?? 0}</span>
              {repoInfo?.defaultBranch && <span>{repoInfo.defaultBranch}</span>}
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
                item === 'pulls' ? counts.pulls : item === 'issues' ? counts.issues : undefined;
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
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
              <Panel>
                <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                  Files
                </div>
                {loadingTree && (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={index} variant="rect" width="100%" height="20px" />
                    ))}
                  </div>
                )}
                {!loadingTree && tree.length === 0 && (
                  <p className="px-4 pb-4 text-xs text-[var(--quant-muted-foreground)]">
                    This repository is empty. Push your first commit or use the editor.
                  </p>
                )}
                <Rows>
                  {tree.map((node) => (
                    <li key={node.path ?? node.name}>
                      <button
                        type="button"
                        onClick={() => node.type !== 'dir' && setOpenFile(node.path ?? null)}
                        className={`w-full px-4 py-2 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--quant-primary)_10%,transparent)] ${
                          openFile === node.path ? 'text-[var(--quant-primary)]' : ''
                        }`}
                      >
                        {node.type === 'dir' ? '📁' : '📄'} {node.name ?? node.path}
                      </button>
                    </li>
                  ))}
                </Rows>
              </Panel>

              <Panel>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--quant-border)]">
                  <span className="text-xs font-medium truncate">
                    {openFile ?? 'Select a file to preview'}
                  </span>
                </div>
                {loadingFile && <Skeleton variant="rect" width="100%" height="220px" />}
                {!loadingFile && openFile && (
                  <pre className="max-h-[60vh] overflow-auto px-4 py-3 text-[11px] leading-5 text-[var(--quant-muted-foreground)] whitespace-pre-wrap">
                    {fileText || 'Empty file'}
                  </pre>
                )}
                {!openFile && (
                  <p className="px-4 py-6 text-xs text-[var(--quant-muted-foreground)]">
                    Pick a file on the left to read it here without leaving your inbox.
                  </p>
                )}
              </Panel>
            </div>
          )}

          {tab === 'commits' && (
            <Panel>
              {loadingCommits && <Skeleton variant="rect" width="100%" height="160px" />}
              {!loadingCommits && commits.length === 0 && (
                <EmptyState
                  title="No commits yet"
                  description="Commits will appear here as soon as code is pushed to this repository."
                />
              )}
              <Rows>
                {commits.map((commit) => (
                  <li key={commit.sha ?? commit.id} className="px-4 py-3">
                    <p className="text-sm truncate">{commit.message ?? 'commit'}</p>
                    <p className="mt-1 text-[11px] text-[var(--quant-muted-foreground)]">
                      {(commit.authorName ?? commit.author ?? 'unknown') as string} ·{' '}
                      {(commit.sha ?? '').slice(0, 7)} · {relativeTime(commit.createdAt)}
                    </p>
                  </li>
                ))}
              </Rows>
            </Panel>
          )}

          {tab === 'branches' && (
            <Panel>
              {branches.length === 0 && (
                <EmptyState
                  title="No branches"
                  description="Create a branch from the editor or push one from your machine."
                />
              )}
              <Rows>
                {branches.map((branch) => (
                  <li
                    key={branch.name ?? branch.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <span className="text-sm">{branch.name}</span>
                    {branch.isDefault && <Badge variant="info">default</Badge>}
                  </li>
                ))}
              </Rows>
            </Panel>
          )}

          {(tab === 'pulls' || tab === 'issues') && (
            <Panel>
              {(tab === 'pulls' ? pulls : issues).length === 0 && (
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
                {(tab === 'pulls' ? pulls : issues).map((item) => (
                  <li
                    key={item.id ?? item.number}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{item.title ?? 'Untitled'}</p>
                      <p className="mt-1 text-[11px] text-[var(--quant-muted-foreground)]">
                        #{item.number ?? '—'} · opened {relativeTime(item.createdAt)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(item.state ?? item.status)}>
                      {item.state ?? item.status ?? 'open'}
                    </Badge>
                  </li>
                ))}
              </Rows>
            </Panel>
          )}

          {tab === 'actions' && (
            <div className="space-y-4">
              <Panel>
                <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)] border-b border-[var(--quant-border)]">
                  Workflows
                </div>
                {workflows.length === 0 && (
                  <p className="px-4 py-5 text-xs text-[var(--quant-muted-foreground)]">
                    No workflows found for this repository yet.
                  </p>
                )}
                <Rows>
                  {workflows.map((workflow) => (
                    <li
                      key={workflow.id ?? workflow.name}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{workflow.name}</p>
                        <p className="text-[11px] text-[var(--quant-muted-foreground)] truncate">
                          {workflow.filename ?? ''}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={triggerWorkflow.isPending || !workflow.id}
                        onClick={() =>
                          void triggerWorkflow.mutateAsync({ id: String(workflow.id) })
                        }
                      >
                        Run workflow
                      </Button>
                    </li>
                  ))}
                </Rows>
              </Panel>

              <Panel>
                <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)] border-b border-[var(--quant-border)]">
                  Recent runs
                </div>
                {builds.length === 0 && (
                  <p className="px-4 py-5 text-xs text-[var(--quant-muted-foreground)]">
                    No runs recorded yet.
                  </p>
                )}
                <Rows>
                  {builds.map((build) => (
                    <li
                      key={build.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{build.branch ?? 'run'}</p>
                        <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                          {relativeTime(build.createdAt)}
                        </p>
                      </div>
                      <Badge variant={statusVariant(build.status)}>{build.status ?? '—'}</Badge>
                    </li>
                  ))}
                </Rows>
              </Panel>
            </div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
