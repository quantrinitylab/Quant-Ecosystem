'use client';

// ============================================================================
// CodeHub — the GitHub-style code home inside QuantMail, with Quanty at the
// helm (user decision, msg#30 P14): a Claude/Lovable-style chat hero where you
// describe what to build; Quanty plans or builds — there is NO model selector,
// Quanty picks the best model for the task. Below: agents activity, MCP
// connectors, repos and pipelines.
// ============================================================================

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Badge,
  Modal,
  Input,
  FormField,
  SearchInput,
  Skeleton,
  ErrorState,
  EmptyState,
} from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { Quanty, type QuantyExpression } from '../../components/Quanty';
import { QuantMailLogo } from '../../components/QuantMailLogo';
import { useRepos, useCreateRepo } from '../../hooks/useRepos';
import { useBuilds, useDeployments } from '../../hooks/usePipelines';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoLike {
  id: string;
  name: string;
  fullName?: string;
  description?: string;
  visibility?: string;
  language?: string;
  defaultBranch?: string;
  stars?: number;
  forks?: number;
  updatedAt?: string | Date;
  cloneUrl?: string;
  sshUrl?: string;
}

interface BuildLike {
  id: string;
  status?: string;
  branch?: string;
  commitMessage?: string;
  workflowName?: string;
  createdAt?: string | Date;
}

interface DeploymentLike {
  id: string;
  environment?: string;
  status?: string;
  createdAt?: string | Date;
}

const VISIBILITY_FILTERS = ['all', 'public', 'private', 'internal'] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(status?: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  switch (status) {
    case 'success':
    case 'succeeded':
    case 'active':
      return 'success';
    case 'failure':
    case 'failed':
      return 'danger';
    case 'running':
    case 'pending':
    case 'queued':
      return 'warning';
    case 'cancelled':
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
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return date.toLocaleDateString();
}

function languageDot(language?: string): string {
  const palette: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Go: '#00ADD8',
    Rust: '#dea584',
    Java: '#b07219',
  };
  return palette[language ?? ''] ?? '#8b8ff5';
}

/**
 * Derive the SSH clone URL for a repo.
 * If the backend already returns sshUrl/cloneUrl we use that;
 * otherwise we synthesise a plausible address.
 */
function getCloneUrl(repo: RepoLike): string {
  if (repo.sshUrl) return repo.sshUrl;
  const slug = repo.fullName || repo.name;
  return `git@quantrinity.in:${slug}.git`;
}

/** Repo name from a paste-in clone URL (GitHub, GitLab, ssh, …). */
function repoNameFromUrl(url: string): string {
  const clean = url.trim().replace(/\.git$/i, '');
  const seg = clean.split(/[/:]/).filter(Boolean).pop() ?? '';
  return seg.replace(/[^a-zA-Z0-9-_.]/g, '-').toLowerCase();
}

// ---------------------------------------------------------------------------
// Quanty build chat (Plan / Build — Quanty picks the model himself)
// ---------------------------------------------------------------------------

type BuildChatMessage = { id: string; role: 'user' | 'assistant'; content: string };
type BuildMode = 'plan' | 'build';

async function askQuanty(
  history: BuildChatMessage[],
  mode: BuildMode,
  repoNames: string[],
): Promise<string> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      messages: history.slice(-10).map(({ role, content }) => ({ role, content })),
      context: {
        app: 'QuantHub',
        route: '/codehub',
        view: `CodeHub home · ${mode === 'plan' ? 'Plan mode (explain, break down, estimate — no changes)' : 'Build mode (propose concrete repos, files, commits, deploy steps)'}`,
        screenText: `Existing repositories: ${repoNames.join(', ') || 'none yet'}`,
      },
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: { message?: string }; error?: { message?: string } }
    | null;
  if (response.ok && payload?.success && payload.data?.message) return payload.data.message;
  throw new Error(payload?.error?.message ?? `Quanty could not answer (${response.status}). Retry in a moment.`);
}

function QuantyBuildChat({ repoNames, onNewRepo }: { repoNames: string[]; onNewRepo: () => void }) {
  const [mode, setMode] = useState<BuildMode>('plan');
  const [messages, setMessages] = useState<BuildChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setChatError(null);
    const next: BuildChatMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: 'user', content: `[${mode.toUpperCase()}] ${text}` },
    ];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const reply = await askQuanty(next, mode, repoNames);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Quanty could not answer. Retry in a moment.');
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, mode, repoNames]);

  const expression: QuantyExpression = sending
    ? 'thinking'
    : chatError
      ? 'sad'
      : messages.some((m) => m.role === 'assistant')
        ? 'happy'
        : 'idle';

  return (
    <section className="ch-quanty-hero" aria-label="Build with Quanty">
      <div className="ch-quanty-head">
        <Quanty expression={expression} size={64} bob title="Quanty" />
        <div className="ch-quanty-copy">
          <h2>Build with Quanty</h2>
          <p>
            Describe the app, fix or automation you need. Quanty plans it, creates repos, runs
            agents and watches the pipelines — he picks the best model for the job himself.
          </p>
        </div>
        <div className="ch-mode-toggle" role="tablist" aria-label="Quanty mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'plan'}
            className={mode === 'plan' ? 'is-active' : ''}
            onClick={() => setMode('plan')}
          >
            Plan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'build'}
            className={mode === 'build' ? 'is-active' : ''}
            onClick={() => setMode('build')}
          >
            Build
          </button>
        </div>
      </div>

      {(messages.length > 0 || sending || chatError) && (
        <div className="ch-quanty-thread" ref={threadRef} aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`ch-msg is-${message.role}`}>
              {message.role === 'assistant' && <span className="ch-msg-author">Quanty</span>}
              <p>{message.content.replace(/^\[(PLAN|BUILD)\]\s*/, '')}</p>
            </div>
          ))}
          {sending && (
            <div className="ch-msg is-assistant ch-msg-typing">
              <Quanty expression="thinking" size={22} /> Quanty is {mode === 'plan' ? 'planning' : 'building the approach'}…
            </div>
          )}
          {chatError && (
            <div className="ch-msg is-error" role="alert">
              {chatError}
            </div>
          )}
        </div>
      )}

      <form
        className="ch-quanty-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={mode === 'plan' ? 'e.g. Plan a URL-shortener service with analytics' : 'e.g. Build a Next.js waitlist app with auth'}
          aria-label="Tell Quanty what to plan or build"
        />
        <button type="submit" disabled={sending || input.trim().length === 0}>
          {sending ? 'Working…' : mode === 'plan' ? 'Plan it' : 'Build it'}
        </button>
      </form>

      <div className="ch-quanty-quick">
        <button type="button" onClick={onNewRepo}>+ New repository</button>
        <span>Quanty can scaffold into a fresh repo once you approve a plan.</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Agents strip — who is doing what right now (msg#30 P14)
// ---------------------------------------------------------------------------

function AgentsStrip({ builds, deployments }: { builds: BuildLike[]; deployments: DeploymentLike[] }) {
  const latestBuild = builds[0];
  const latestDeploy = deployments[0];
  const agents = [
    {
      id: 'planner',
      name: 'Quanty Planner',
      status: 'ready',
      detail: 'Waiting for your next brief in Plan mode.',
    },
    {
      id: 'builder',
      name: 'Build agent',
      status: latestBuild?.status ?? 'idle',
      detail: latestBuild
        ? `${latestBuild.workflowName || latestBuild.branch || 'Workflow'} · ${latestBuild.commitMessage || 'latest commit'} · ${relativeTime(latestBuild.createdAt)}`
        : 'No builds yet — trigger one from a repository.',
    },
    {
      id: 'deployer',
      name: 'Deploy agent',
      status: latestDeploy?.status ?? 'idle',
      detail: latestDeploy
        ? `${latestDeploy.environment ?? 'environment'} · ${relativeTime(latestDeploy.createdAt)}`
        : 'Nothing deployed from CodeHub yet.',
    },
    {
      id: 'observer',
      name: 'Observer',
      status: 'active',
      detail: 'Watching pipelines and surfacing failures to Quanty.',
    },
  ];

  return (
    <section className="ch-agents" aria-label="Agents activity">
      <h2>Agents</h2>
      <div className="ch-agents-row">
        {agents.map((agent) => (
          <article key={agent.id} className="ch-agent-card">
            <header>
              <span className={`ch-agent-dot is-${statusVariant(agent.status)}`} aria-hidden="true" />
              <strong>{agent.name}</strong>
              <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
            </header>
            <p>{agent.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// MCP connectors — request/enable UI (deployment wiring follows backend batch)
// ---------------------------------------------------------------------------

const CONNECTORS = [
  { id: 'github', name: 'GitHub', detail: 'Clone, mirror and sync repositories' },
  { id: 'cloudflare', name: 'Cloudflare', detail: 'Workers, Pages and Worker AI deploys' },
  { id: 'aws', name: 'AWS', detail: 'EKS, ECR and infrastructure deploys' },
  { id: 'notion', name: 'Notion', detail: 'Specs, docs and build logs' },
  { id: 'custom', name: 'Custom MCP', detail: 'Bring your own MCP server URL' },
];

function ConnectorsRow() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('quanthub.connectors');
      if (raw) setEnabled(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem('quanthub.connectors', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <section className="ch-connectors" aria-label="MCP connectors">
      <h2>MCP connectors</h2>
      <p className="ch-connectors-sub">
        Connect tools once — Quanty and your agents use them to clone, build and deploy directly.
      </p>
      <div className="ch-connectors-row">
        {CONNECTORS.map((connector) => (
          <article key={connector.id} className="ch-connector-card">
            <strong>{connector.name}</strong>
            <p>{connector.detail}</p>
            <button
              type="button"
              className={enabled[connector.id] ? 'is-on' : ''}
              onClick={() => toggle(connector.id)}
            >
              {enabled[connector.id] ? 'Requested ✓' : 'Connect'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Clone button
// ---------------------------------------------------------------------------

function CloneButton({ repo }: { repo: RepoLike }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = getCloneUrl(repo);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API unavailable (e.g. non-HTTPS) — fallback: select a temp input
        const el = document.createElement('input');
        el.value = url;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    },
    [repo],
  );

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md border border-[var(--quant-border)] bg-[var(--quant-muted)] px-2 py-1 text-[11px] font-medium text-[var(--quant-muted-foreground)] transition-colors hover:border-[rgba(255,153,51,0.45)] hover:text-[var(--quant-foreground)]"
      title={`Clone: ${getCloneUrl(repo)}`}
      aria-label={copied ? 'Clone URL copied' : 'Copy clone URL'}
    >
      {copied ? (
        <>
          <svg className="h-3 w-3 text-[#22c55e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[#22c55e]">Copied!</span>
        </>
      ) : (
        <>
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>Clone</span>
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CodeHubPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', visibility: 'private', sourceUrl: '' });

  const { data: reposData, isLoading, error, refetch } = useRepos();
  const { data: buildsData } = useBuilds();
  const { data: deploymentsData } = useDeployments();
  const createRepo = useCreateRepo();

  const repos = (reposData ?? []) as unknown as RepoLike[];
  const builds = ((buildsData ?? []) as unknown as BuildLike[]).slice(0, 6);
  const deployments = ((deploymentsData ?? []) as unknown as DeploymentLike[]).slice(0, 4);
  const repoNames = useMemo(() => repos.map((repo) => repo.fullName || repo.name), [repos]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return repos.filter((repo) => {
      const matchesQuery =
        needle.length === 0 ||
        repo.name.toLowerCase().includes(needle) ||
        (repo.description ?? '').toLowerCase().includes(needle);
      const matchesVisibility = visibility === 'all' || repo.visibility === visibility;
      return matchesQuery && matchesVisibility;
    });
  }, [repos, query, visibility]);

  const handleCreate = useCallback(async () => {
    const source = draft.sourceUrl.trim();
    const name = draft.name.trim() || (source ? repoNameFromUrl(source) : '');
    if (!name) return;
    const description = source
      ? `${draft.description ? `${draft.description} · ` : ''}Imported from ${source}`
      : draft.description;
    const created = (await createRepo.mutateAsync({
      name,
      description,
      visibility: draft.visibility,
      initReadme: !source,
    })) as unknown as RepoLike;
    setShowCreate(false);
    setDraft({ name: '', description: '', visibility: 'private', sourceUrl: '' });
    if (created?.id) router.push(`/codehub/${created.id}`);
  }, [draft, createRepo, router]);

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page codehub-workspace flex flex-col h-full overflow-hidden">
        {/* Top bar — official Quant logo family mark (no more “CH” tile) */}
        <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-[var(--quant-border)] bg-[color-mix(in_srgb,var(--quant-card)_86%,transparent)]">
          <div className="flex items-center gap-3 min-w-0">
            <QuantMailLogo size={36} title="QuantHub" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight">CodeHub</h1>
              <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                Repositories, pipelines and deployments — with Quanty at the helm
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-64 max-w-[52vw]">
              <SearchInput
                placeholder="Search repositories…"
                value={query}
                onChange={setQuery}
              />
            </div>
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              New repository
            </Button>
          </div>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-0">
          {/* Main column */}
          <section className="min-h-0 overflow-y-auto p-5">
            <QuantyBuildChat repoNames={repoNames} onNewRepo={() => setShowCreate(true)} />
            <AgentsStrip builds={builds} deployments={deployments} />
            <ConnectorsRow />

            <div className="flex items-center gap-2 mb-4 mt-6 flex-wrap">
              {VISIBILITY_FILTERS.map((option) => {
                const active = visibility === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setVisibility(option)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                      active
                        ? 'border-[var(--quant-primary)] bg-[color-mix(in_srgb,var(--quant-primary)_18%,transparent)] text-[var(--quant-foreground)]'
                        : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
                    }`}
                  >
                    {option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                );
              })}
              <span className="ml-auto text-xs text-[var(--quant-muted-foreground)]">
                {filtered.length} of {repos.length} repositories
              </span>
            </div>

            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} variant="rect" width="100%" height="92px" />
                ))}
              </div>
            )}

            {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

            {!isLoading && !error && filtered.length === 0 && (
              <EmptyState
                title={query ? 'No repositories matched' : 'Start your first repository'}
                description={
                  query
                    ? `Nothing matched “${query}”. Clear the search to see everything in CodeHub.`
                    : 'Ask Quanty above to plan your first build, or create a repository directly.'
                }
                actionLabel={query ? 'Clear search' : 'New repository'}
                onAction={() => (query ? setQuery('') : setShowCreate(true))}
              />
            )}

            <ul className="space-y-3">
              {!isLoading &&
                !error &&
                filtered.map((repo) => (
                  <li key={repo.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/codehub/${repo.id}`)}
                      className="w-full text-left rounded-2xl border border-[var(--quant-border)] bg-[color-mix(in_srgb,var(--quant-card)_92%,transparent)] p-4 transition-all hover:border-[color-mix(in_srgb,var(--quant-primary)_45%,transparent)] hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[var(--quant-primary)] truncate">
                              {repo.fullName || repo.name}
                            </span>
                            <Badge variant={repo.visibility === 'public' ? 'success' : 'default'}>
                              {repo.visibility ?? 'private'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)] line-clamp-2">
                            {repo.description || 'No description yet.'}
                          </p>
                          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--quant-muted-foreground)] flex-wrap">
                            {repo.language && (
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ background: languageDot(repo.language) }}
                                />
                                {repo.language}
                              </span>
                            )}
                            <span>★ {repo.stars ?? 0}</span>
                            <span>⑂ {repo.forks ?? 0}</span>
                            {repo.defaultBranch && <span>default: {repo.defaultBranch}</span>}
                            {repo.updatedAt && <span>updated {relativeTime(repo.updatedAt)}</span>}
                            {/* Clone URL — one-click copy; stops propagation so row click still navigates */}
                            <CloneButton repo={repo} />
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          </section>

          {/* Activity rail */}
          <aside className="hidden xl:flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-[var(--quant-border)] p-5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)] mb-3">
                Recent builds
              </h2>
              {builds.length === 0 ? (
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  No builds yet. Trigger a workflow from a repository’s Actions tab.
                </p>
              ) : (
                <ul className="space-y-2">
                  {builds.map((build) => (
                    <li
                      key={build.id}
                      className="rounded-xl border border-[var(--quant-border)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">
                          {build.workflowName || build.branch || 'Workflow run'}
                        </span>
                        <Badge variant={statusVariant(build.status)}>
                          {build.status ?? 'unknown'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--quant-muted-foreground)] truncate">
                        {build.commitMessage || build.branch || '—'} · {relativeTime(build.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)] mb-3">
                Deployments
              </h2>
              {deployments.length === 0 ? (
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  Nothing deployed yet from CodeHub.
                </p>
              ) : (
                <ul className="space-y-2">
                  {deployments.map((deployment) => (
                    <li
                      key={deployment.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--quant-border)] p-3"
                    >
                      <span className="text-xs font-medium truncate">
                        {deployment.environment ?? 'environment'}
                      </span>
                      <Badge variant={statusVariant(deployment.status)}>
                        {deployment.status ?? 'unknown'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New repository">
          <div className="space-y-4">
            <FormField label="Clone from URL (optional)">
              <Input
                value={draft.sourceUrl}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, sourceUrl: event.target.value }))
                }
                placeholder="https://github.com/owner/repo or git@host:owner/repo.git"
              />
            </FormField>
            {draft.sourceUrl.trim() && (
              <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                Mirror sync runs through the GitHub connector — the repo is created now and the
                source is recorded on it.
              </p>
            )}
            <FormField label="Repository name" required>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={draft.sourceUrl.trim() ? repoNameFromUrl(draft.sourceUrl) || 'quant-service' : 'quant-service'}
              />
            </FormField>
            <FormField label="Description">
              <Input
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="What does this repository do?"
              />
            </FormField>
            <FormField label="Visibility">
              <select
                className="w-full rounded-lg border border-[var(--quant-border)] bg-[color-mix(in_srgb,var(--quant-card)_92%,transparent)] px-3 py-2 text-sm"
                value={draft.visibility}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, visibility: event.target.value }))
                }
              >
                <option value="private">Private</option>
                <option value="internal">Internal</option>
                <option value="public">Public</option>
              </select>
            </FormField>
            {createRepo.isError && (
              <p className="text-xs text-[var(--quant-danger,#f87171)]">
                {(createRepo.error as Error)?.message ?? 'Could not create the repository'}
              </p>
            )}
            {/* Clone URL preview for the new repo being created */}
            {(draft.name.trim() || draft.sourceUrl.trim()) && (
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-muted)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)] mb-1">Clone URL (after creation)</p>
                <code className="block truncate text-xs text-[var(--quant-foreground)]">
                  git@quantrinity.in:{draft.name.trim() || repoNameFromUrl(draft.sourceUrl)}.git
                </code>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleCreate()}
                disabled={(!draft.name.trim() && !draft.sourceUrl.trim()) || createRepo.isPending}
              >
                {createRepo.isPending ? 'Creating…' : 'Create repository'}
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
