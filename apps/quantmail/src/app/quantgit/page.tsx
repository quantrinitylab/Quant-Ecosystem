'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useRepos } from '../../hooks/useRepos';

type WorkspaceTab = 'quanty' | 'repos' | 'lab';
type BuildMode = 'plan' | 'build';
type Effort = 'fast' | 'deep';
type CloneProtocol = 'https' | 'ssh';

type Repo = {
  id: string;
  name: string;
  fullName?: string;
  description?: string;
  visibility?: string;
  language?: string;
  stars?: number;
  forks?: number;
  cloneUrl?: string;
  sshUrl?: string;
  defaultBranch?: string;
  latestCommit?: string;
  checksStatus?: 'passing' | 'pending' | 'failing';
};

type IconName =
  | 'sparkles'
  | 'repo'
  | 'lab'
  | 'exit'
  | 'plan'
  | 'build'
  | 'paperclip'
  | 'arrow'
  | 'search'
  | 'star'
  | 'fork'
  | 'branch'
  | 'copy'
  | 'close'
  | 'terminal'
  | 'monitor'
  | 'tasks'
  | 'ask'
  | 'schedule'
  | 'memory'
  | 'graph'
  | 'activity'
  | 'commands'
  | 'workers'
  | 'coffee';

const agents = [
  {
    id: '001',
    name: 'Astra',
    role: 'Fleet lead',
    pod: 'ORBIT',
    thought: 'Roadmap clear',
    initial: 'A',
  },
  {
    id: '002',
    name: 'Forge',
    role: 'Builder',
    pod: 'SHIP',
    thought: 'Compiling',
    initial: 'F',
  },
  {
    id: '003',
    name: 'Scout',
    role: 'Research',
    pod: 'RADAR',
    thought: '3 signals',
    initial: 'S',
  },
  {
    id: '004',
    name: 'Pixel',
    role: 'Design',
    pod: 'STUDIO',
    thought: 'Polishing',
    initial: 'P',
  },
  {
    id: '005',
    name: 'Sentinel',
    role: 'Security',
    pod: 'SHIELD',
    thought: 'Perimeter clean',
    initial: 'S',
  },
  {
    id: '006',
    name: 'Ledger',
    role: 'Data',
    pod: 'VAULT',
    thought: 'Index synced',
    initial: 'L',
  },
  {
    id: '007',
    name: 'Relay',
    role: 'Operations',
    pod: 'PULSE',
    thought: 'Deploy healthy',
    initial: 'R',
  },
  {
    id: '008',
    name: 'Voice Bot',
    role: 'Voice',
    pod: 'ECHO',
    thought: 'Listening',
    initial: 'V',
  },
] as const;

const commands: Array<{ label: string; icon: IconName; memoryQuery?: string }> = [
  { label: 'Terminal', icon: 'terminal' },
  { label: 'Monitor', icon: 'monitor' },
  { label: 'Tasks', icon: 'tasks' },
  { label: 'Ask me', icon: 'ask' },
  { label: 'Schedules', icon: 'schedule' },
  { label: 'Memory', icon: 'memory', memoryQuery: 'deploy' },
  { label: 'Graph', icon: 'graph' },
  { label: 'Activity', icon: 'activity' },
  { label: 'Commands', icon: 'commands' },
  { label: 'Workers', icon: 'workers' },
];

const memoryFacts = [
  { id: '01', text: 'Deploys require a green gate', kind: 'policy' },
  { id: '02', text: 'Brand orange is #FF8C42', kind: 'design' },
  { id: '03', text: 'Primary region is us-east-1', kind: 'infra' },
] as const;

function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    sparkles: (
      <>
        <path d="m12 3-1.4 3.6L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.4L12 3Z" />
        <path d="m5 14-.9 2.1L2 17l2.1.9L5 20l.9-2.1L8 17l-2.1-.9L5 14Zm13-1-1.1 2.9L14 17l2.9 1.1L18 21l1.1-2.9L22 17l-2.9-1.1L18 13Z" />
      </>
    ),
    repo: (
      <>
        <path d="M5 3h11a2 2 0 0 1 2 2v16H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z" />
        <path d="M6 17h12M8 7h6" />
      </>
    ),
    lab: (
      <>
        <path d="M9 3v5l-5 9a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-5-9V3" />
        <path d="M8 13h8M8 3h8" />
      </>
    ),
    exit: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      </>
    ),
    plan: (
      <>
        <path d="M4 4h16v16H4zM8 9h8M8 13h5" />
      </>
    ),
    build: (
      <>
        <path d="m14 6 4 4M3 21l3.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L3 21Z" />
      </>
    ),
    paperclip: (
      <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.9-2.9l8.5-8.5" />
    ),
    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
    fork: (
      <>
        <circle cx="7" cy="5" r="2" />
        <circle cx="17" cy="5" r="2" />
        <circle cx="12" cy="19" r="2" />
        <path d="M7 7v2a3 3 0 0 0 3 3h2m5-5v2a3 3 0 0 1-3 3h-2v5" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10M8 12h4a6 6 0 0 0 6-6" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    terminal: <path d="m4 7 4 4-4 4m7 0h9" />,
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    tasks: (
      <>
        <path d="m4 7 2 2 4-4M12 7h8M4 15l2 2 4-4M12 15h8" />
      </>
    ),
    ask: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
        <path d="M9 11h6" />
      </>
    ),
    schedule: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    memory: (
      <>
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    ),
    graph: (
      <>
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="5" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
        <path d="m6.5 10.5 4-4m3 0 4 4m0 3-4 4m-3 0-4-4" />
      </>
    ),
    activity: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    commands: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 4v4m8 2v4M10 16v4" />
      </>
    ),
    workers: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
    coffee: (
      <>
        <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
        <path d="M17 10h2a2 2 0 1 1 0 4h-2M8 3v2m4-2v2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="relative grid size-10 place-items-center rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-[var(--brand-primary)]">
        <span className="size-[17px] rotate-45 rounded-[4px] border-2 border-current" />
        <span className="absolute size-1.5 rounded-full bg-current shadow-[0_0_12px_var(--brand-primary)]" />
      </span>
      <span>
        <strong className="block text-[15px] font-semibold tracking-[-0.035em]">QuantGit</strong>
        <small className="block text-[10px] font-semibold uppercase tracking-[0.17em] text-[var(--quant-muted-foreground)]">
          Agentic code studio
        </small>
      </span>
    </div>
  );
}

function Deck({
  tab,
  setTab,
  exit,
}: {
  tab: WorkspaceTab;
  setTab: (tab: WorkspaceTab) => void;
  exit: () => void;
}) {
  const items = [
    { key: 'quanty', label: 'Quanty', icon: 'sparkles' },
    { key: 'repos', label: 'Repos', icon: 'repo' },
    { key: 'lab', label: 'Agent Lab', icon: 'lab' },
    { key: 'exit', label: 'Exit', icon: 'exit' },
  ] as const;
  return (
    <nav
      aria-label="QuantGit deck"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-xl grid-cols-4 gap-1 rounded-2xl border border-[var(--quant-border)] bg-[color-mix(in_srgb,var(--quant-surface)_94%,transparent)] p-1.5 shadow-[var(--quant-shadow-xl)] backdrop-blur-xl"
    >
      {items.map((item) => {
        const selected = item.key === tab;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => (item.key === 'exit' ? exit() : setTab(item.key))}
            aria-current={selected ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors ${selected ? 'bg-[var(--brand-soft)] text-[var(--brand-primary)] ring-1 ring-inset ring-[var(--brand-soft-border)]' : 'text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-elevated)] hover:text-[var(--quant-foreground)]'}`}
          >
            <Icon name={item.icon} className="size-[18px]" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function Quanty({ repoNames }: { repoNames: string[] }) {
  const [mode, setMode] = useState<BuildMode>('plan');
  const [effort, setEffort] = useState<Effort>('fast');
  const [prompt, setPrompt] = useState('');
  const [contexts, setContexts] = useState(() =>
    repoNames.slice(0, 2).length ? repoNames.slice(0, 2) : ['Quant-Ecosystem', 'main'],
  );
  const [queued, setQueued] = useState('');
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = prompt.trim();
    if (!value) return;
    setQueued(
      `${mode === 'plan' ? 'Planning' : 'Building'} · ${effort === 'fast' ? 'Fast' : 'Deep'} · ${value}`,
    );
    setPrompt('');
  };
  const suggestions = [
    'Audit this repository',
    'Build a release plan',
    'Fix failing checks',
    'Create a feature branch',
  ];
  return (
    <section
      aria-labelledby="quanty-title"
      className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-6 sm:pt-14"
    >
      <div className="text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-[20px] border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-[var(--brand-primary)]">
          <Icon name="sparkles" className="size-8" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">
          Build alongside Quanty
        </p>
        <h1
          id="quanty-title"
          className="mt-2 text-3xl font-semibold tracking-[-0.055em] sm:text-5xl"
        >
          What should we ship next?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--quant-muted-foreground)]">
          Turn an idea into an executable plan, or let your agent fleet build the first working
          pass.
        </p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="mt-8 overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-[var(--quant-shadow-xl)] transition-colors focus-within:border-[var(--brand-soft-border)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--quant-border-subtle)] p-2">
          <div aria-label="Mode" className="flex rounded-xl bg-[var(--quant-background)] p-1">
            {(['plan', 'build'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold ${mode === value ? 'bg-[var(--quant-surface-elevated)] text-[var(--quant-foreground)]' : 'text-[var(--quant-muted-foreground)]'}`}
              >
                <Icon name={value} />
                {value === 'plan' ? 'Plan' : 'Build'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)] sm:inline">
              Effort
            </span>
            <button
              type="button"
              aria-label={`Effort: ${effort}. Activate for ${effort === 'fast' ? 'deep' : 'fast'} effort`}
              aria-pressed={effort === 'deep'}
              onClick={() => setEffort((value) => (value === 'fast' ? 'deep' : 'fast'))}
              className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 text-xs font-semibold"
            >
              <span
                className={`size-2 rounded-full ${effort === 'deep' ? 'bg-[var(--quant-warning)]' : 'bg-[var(--quant-info)]'}`}
              />
              {effort === 'fast' ? 'Fast' : 'Deep'}
            </button>
            <span
              className={`rounded-lg px-2 py-1 text-[10px] font-bold ${mode === 'plan' ? 'bg-[color-mix(in_srgb,var(--quant-info)_12%,transparent)] text-[var(--quant-info)]' : 'bg-[var(--brand-soft)] text-[var(--brand-primary)]'}`}
            >
              {mode === 'plan' ? 'READ ONLY' : 'WRITES ON'}
            </span>
          </div>
        </div>
        <textarea
          aria-label="Prompt for Quanty"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={5}
          placeholder={`Tell Quanty what to ${mode}…`}
          className="w-full resize-none bg-transparent p-5 text-base leading-7 outline-none placeholder:text-[var(--quant-muted-foreground)]"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--quant-border-subtle)] p-3">
          <button
            type="button"
            onClick={() =>
              setContexts((current) =>
                current.includes('Current selection') ? current : [...current, 'Current selection'],
              )
            }
            className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 text-xs text-[var(--quant-muted-foreground)]"
          >
            <Icon name="paperclip" />
            Context
          </button>
          {contexts.map((context, index) => (
            <button
              type="button"
              key={`${context}-${index}`}
              onClick={() =>
                setContexts((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
              aria-label={`Remove ${context} context`}
              className="min-h-11 rounded-full border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-xs text-[var(--quant-muted-foreground)]"
            >
              {context} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            disabled={!prompt.trim()}
            className="ml-auto flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 text-xs font-bold text-[var(--quant-background)] hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === 'plan' ? 'Plan it' : 'Build it'}
            <Icon name="arrow" />
          </button>
        </div>
      </form>
      {queued && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] p-4 text-sm"
        >
          <strong className="text-[var(--brand-primary)]">Queued:</strong> {queued}
        </p>
      )}
      <div aria-label="Suggested actions" className="mt-5 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setPrompt(suggestion)}
            className="min-h-11 rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 text-xs text-[var(--quant-muted-foreground)] hover:border-[var(--brand-soft-border)] hover:text-[var(--brand-primary)]"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}

function CloneDialog({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const [protocol, setProtocol] = useState<CloneProtocol>('https');
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const slug = repo.fullName || `quantrinitylab/${repo.name}`;
  const url =
    protocol === 'https'
      ? repo.cloneUrl || 'https:' + '//github.com/' + slug + '.git'
      : repo.sshUrl || `git@github.com:${slug}.git`;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/75 p-3 backdrop-blur-sm sm:place-items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-[var(--quant-border-strong)] bg-[var(--quant-surface-elevated)] p-5 shadow-[var(--quant-shadow-dialog)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Clone repository
            </p>
            <h2 id={titleId} className="mt-1 break-all text-lg font-semibold">
              {slug}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close clone dialog"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
          >
            <Icon name="close" />
          </button>
        </div>
        <div
          aria-label="Clone protocol"
          className="mt-5 flex rounded-xl bg-[var(--quant-background)] p-1"
        >
          {(['https', 'ssh'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={protocol === value}
              onClick={() => setProtocol(value)}
              className={`min-h-10 flex-1 rounded-lg text-xs font-semibold uppercase ${protocol === value ? 'bg-[var(--quant-surface)] text-[var(--brand-primary)]' : 'text-[var(--quant-muted-foreground)]'}`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-background)] p-2">
          <code className="min-w-0 flex-1 overflow-x-auto p-2 text-xs text-[var(--quant-foreground)]">
            {url}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 text-xs font-bold text-[var(--quant-background)] hover:bg-[var(--brand-primary-hover)]"
          >
            <Icon name="copy" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] p-4 text-xs leading-5 text-[var(--quant-muted-foreground)]">
          <strong className="text-[var(--brand-primary)]">PAT guidance:</strong> Use a fine-grained
          personal access token as the HTTPS password. Grant access only to this repository with the
          minimum Contents permission. Never put a token in a URL or commit it.
        </div>
      </section>
    </div>
  );
}

function Repos({
  repos,
  loading,
  error,
  retry,
}: {
  repos: Repo[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  const [query, setQuery] = useState('');
  const [cloneRepo, setCloneRepo] = useState<Repo | null>(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? repos.filter((repo) =>
          `${repo.fullName || repo.name} ${repo.description || ''}`.toLowerCase().includes(needle),
        )
      : repos;
  }, [repos, query]);
  const status = (repo: Repo) => repo.checksStatus || 'passing';
  return (
    <section aria-labelledby="repos-title" className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
            Source control
          </p>
          <h1 id="repos-title" className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
            Repositories
          </h1>
          <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">
            Code, commits, and deployment confidence in one place.
          </p>
        </div>
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 text-[var(--quant-muted-foreground)] focus-within:border-[var(--brand-soft-border)]">
          <Icon name="search" />
          <span className="sr-only">Search repositories</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--quant-foreground)] outline-none placeholder:text-[var(--quant-muted-foreground)]"
          />
        </label>
      </div>
      {loading && (
        <div role="status" aria-label="Loading repositories" className="mt-6 grid gap-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl border border-[var(--quant-border-subtle)] bg-[var(--quant-surface)]"
            />
          ))}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] p-4 text-sm"
        >
          <span>Could not load repositories.</span>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-lg px-3 font-semibold text-[var(--brand-primary)]"
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--quant-border-strong)] p-10 text-center text-sm text-[var(--quant-muted-foreground)]">
          No repositories match “{query}”.
        </div>
      )}
      <ul className="mt-6 grid list-none gap-3 p-0">
        {rows.map((repo) => (
          <li
            key={repo.id}
            className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4 transition-colors hover:border-[var(--quant-border-strong)]"
          >
            <div className="flex gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--quant-surface-elevated)] text-[var(--brand-primary)]">
                <Icon name="repo" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="min-w-0 truncate text-sm">{repo.fullName || repo.name}</strong>
                  <span className="rounded-full border border-[var(--quant-border)] px-2 py-0.5 text-[10px] text-[var(--quant-muted-foreground)]">
                    {repo.visibility || 'private'}
                  </span>
                  <span
                    className={`ml-auto flex items-center gap-1.5 text-[10px] font-semibold ${status(repo) === 'passing' ? 'text-[var(--quant-success)]' : status(repo) === 'pending' ? 'text-[var(--quant-warning)]' : 'text-[var(--quant-destructive)]'}`}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {status(repo) === 'passing'
                      ? 'Checks passing'
                      : status(repo) === 'pending'
                        ? 'Checks pending'
                        : 'Checks failing'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--quant-muted-foreground)]">
                  {repo.description || 'No description yet.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[var(--quant-muted-foreground)]">
                  <span className="flex items-center gap-1.5 text-[var(--quant-info)]">
                    <span className="size-2 rounded-full bg-current" />
                    {repo.language || 'TypeScript'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="star" className="size-3.5" />
                    {repo.stars ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="fork" className="size-3.5" />
                    {repo.forks ?? 0}
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <Icon name="branch" className="size-3.5" />
                    {repo.defaultBranch || 'main'}
                  </span>
                  <span className="font-mono">{repo.latestCommit || 'Latest commit'}</span>
                  <button
                    type="button"
                    onClick={() => setCloneRepo(repo)}
                    className="ml-auto min-h-11 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 font-semibold text-[var(--quant-foreground)] hover:border-[var(--brand-soft-border)] hover:text-[var(--brand-primary)]"
                  >
                    Clone
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {cloneRepo && <CloneDialog repo={cloneRepo} onClose={() => setCloneRepo(null)} />}
    </section>
  );
}

function AgentLab() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fleet, setFleet] = useState(8);
  const [memoryQuery, setMemoryQuery] = useState('');
  const selected = agents[selectedIndex];
  const facts = memoryFacts.filter(
    (fact) =>
      !memoryQuery.trim() ||
      `${fact.text} ${fact.kind}`.toLowerCase().includes(memoryQuery.toLowerCase()),
  );
  const onAgentKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % agents.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + agents.length) % agents.length;
    else return;
    event.preventDefault();
    setSelectedIndex(next);
    document.getElementById(`agent-${agents[next].id}`)?.focus();
  };
  return (
    <section aria-labelledby="lab-title" className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
        Autonomous operations
      </p>
      <h1 id="lab-title" className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
        Agent Lab
      </h1>
      <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">
        Eight specialists, one always-on digital office.
      </p>
      <section
        aria-labelledby="office-title"
        className="mt-6 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="office-title" className="font-semibold">
            Quantrinity Paper Co. · Night shift
          </h2>
          <span className="flex items-center gap-2 text-xs text-[var(--quant-success)]">
            <span className="size-2 animate-pulse rounded-full bg-current" />
            LIVE <Icon name="coffee" />
          </span>
        </div>
        <div
          role="tablist"
          aria-label="Agent desks"
          className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {agents.map((agent, index) => (
            <button
              id={`agent-${agent.id}`}
              role="tab"
              aria-selected={selectedIndex === index}
              tabIndex={selectedIndex === index ? 0 : -1}
              key={agent.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              onKeyDown={(event) => onAgentKeyDown(event, index)}
              className={`relative min-h-32 rounded-xl border p-3 text-left transition-colors ${selectedIndex === index ? 'border-[var(--brand-soft-border)] bg-[var(--brand-soft)]' : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[var(--quant-border-strong)]'}`}
            >
              <span className="absolute -top-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-1 text-[10px] text-[var(--quant-muted-foreground)]">
                {agent.thought}
              </span>
              <span className="mt-4 grid size-10 place-items-center rounded-lg bg-[var(--quant-background)] font-bold text-[var(--brand-primary)]">
                {agent.initial}
              </span>
              <strong className="mt-2 block text-xs">{agent.name}</strong>
              <small className="text-[10px] text-[var(--quant-muted-foreground)]">
                Desk {index + 1} · {agent.pod}
              </small>
              <span className="mt-2 block h-1 rounded-full bg-[var(--quant-border)]">
                <span className="block h-full w-2/3 rounded-full bg-[var(--quant-success)]" />
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3 text-center text-xs text-[var(--quant-muted-foreground)]">
          <Icon name="coffee" />
          <span>Coffee break corner</span>
          <span className="text-[var(--quant-success)]">steam online</span>
        </div>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article
          role="tabpanel"
          aria-label={`${selected.name} agent dossier`}
          className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--quant-muted-foreground)]">
                Agent dossier
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Node #{selected.id} · {selected.name}
              </h2>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-[var(--quant-success)]">
              <span className="size-1.5 rounded-full bg-current" />
              ONLINE
            </span>
          </div>
          <div className="mt-5 flex gap-4">
            <div className="grid size-20 shrink-0 place-items-center rounded-2xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-3xl font-bold text-[var(--brand-primary)]">
              {selected.initial}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
              <dt className="text-[var(--quant-muted-foreground)]">Assignment</dt>
              <dd>{selected.role}</dd>
              <dt className="text-[var(--quant-muted-foreground)]">Pod</dt>
              <dd>{selected.pod}</dd>
              <dt className="text-[var(--quant-muted-foreground)]">Queue</dt>
              <dd className="text-[var(--quant-warning)]">3 tasks</dd>
            </dl>
          </div>
          <div
            aria-label="Agent activity waveform"
            className="mt-5 flex h-10 items-center gap-1 overflow-hidden"
          >
            {Array.from({ length: 46 }, (_, index) => (
              <span
                key={index}
                className="w-0.5 shrink-0 rounded-full bg-[var(--quant-foreground)] opacity-50"
                style={{ height: `${8 + ((index * 13) % 28)}px` }}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {agents.map((agent, index) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`Select ${agent.name}`}
                className={`size-11 shrink-0 rounded-xl border text-xs ${index === selectedIndex ? 'border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-[var(--brand-primary)]' : 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)]'}`}
              >
                {agent.id}
              </button>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--quant-muted-foreground)]">
            Command center
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {commands.map((command) => (
              <button
                key={command.label}
                type="button"
                onClick={() => command.memoryQuery && setMemoryQuery(command.memoryQuery)}
                className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-[10px] text-[var(--quant-muted-foreground)] hover:border-[var(--brand-soft-border)] hover:text-[var(--brand-primary)]"
              >
                <Icon name={command.icon} />
                {command.label}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-[var(--quant-border-subtle)] pt-4">
            <div className="flex items-end justify-between gap-4">
              <p>
                <strong>Fleet scale</strong>
                <br />
                <span className="text-xs text-[var(--quant-muted-foreground)]">
                  8 to 32 workers
                </span>
              </p>
              <output
                htmlFor="fleet-scale"
                className="font-mono text-2xl text-[var(--brand-primary)]"
              >
                {fleet}
              </output>
            </div>
            <input
              id="fleet-scale"
              aria-label="Fleet scale"
              type="range"
              min="8"
              max="32"
              value={fleet}
              onChange={(event) => setFleet(Number(event.target.value))}
              className="mt-4 min-h-11 w-full accent-[var(--brand-primary)]"
            />
          </div>
        </article>
      </div>
      <article className="mt-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--quant-info)]">
          Memory inspector
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-[var(--quant-muted-foreground)] focus-within:border-[var(--quant-info)]">
            <Icon name="search" />
            <span className="sr-only">Semantic memory search</span>
            <input
              value={memoryQuery}
              onChange={(event) => setMemoryQuery(event.target.value)}
              placeholder="Semantic search…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--quant-foreground)] outline-none"
            />
          </label>
          {facts.length ? (
            facts.map((fact) => (
              <div
                key={fact.id}
                className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3"
              >
                <strong className="text-[10px] text-[var(--quant-info)]">
                  FACT {fact.id} · {fact.kind.toUpperCase()}
                </strong>
                <p className="mt-2 text-xs leading-5">{fact.text}</p>
              </div>
            ))
          ) : (
            <div className="md:col-span-3 rounded-xl border border-dashed border-[var(--quant-border-strong)] p-4 text-xs text-[var(--quant-muted-foreground)]">
              No memories match “{memoryQuery}”.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

function normalizeRepos(value: unknown): Repo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
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
        language: typeof source.language === 'string' ? source.language : undefined,
        stars:
          typeof source.stars === 'number'
            ? source.stars
            : typeof source.stargazers_count === 'number'
              ? source.stargazers_count
              : 0,
        forks:
          typeof source.forks === 'number'
            ? source.forks
            : typeof source.forks_count === 'number'
              ? source.forks_count
              : 0,
        cloneUrl:
          typeof source.cloneUrl === 'string'
            ? source.cloneUrl
            : typeof source.clone_url === 'string'
              ? source.clone_url
              : undefined,
        sshUrl:
          typeof source.sshUrl === 'string'
            ? source.sshUrl
            : typeof source.ssh_url === 'string'
              ? source.ssh_url
              : undefined,
        defaultBranch:
          typeof source.defaultBranch === 'string'
            ? source.defaultBranch
            : typeof source.default_branch === 'string'
              ? source.default_branch
              : 'main',
        latestCommit: typeof source.latestCommit === 'string' ? source.latestCommit : undefined,
        checksStatus:
          source.checksStatus === 'pending' || source.checksStatus === 'failing'
            ? source.checksStatus
            : 'passing',
      },
    ];
  });
}

export default function QuantGitPage() {
  const [tab, setTab] = useState<WorkspaceTab>('quanty');
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRepos();
  const repos = useMemo(() => normalizeRepos(data), [data]);
  return (
    <main
      id="main-content"
      className="min-h-dvh bg-[var(--quant-background)] text-[var(--quant-foreground)] [color-scheme:dark]"
    >
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--quant-border-subtle)] bg-[color-mix(in_srgb,var(--quant-background)_94%,transparent)] px-4 backdrop-blur-xl sm:px-6">
        <Logo />
        <span className="flex items-center gap-2 text-xs text-[var(--quant-success)]">
          <span className="size-2 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
          24/7 online
        </span>
      </header>
      {tab === 'quanty' ? (
        <Quanty repoNames={repos.map((repo) => repo.fullName || repo.name)} />
      ) : tab === 'repos' ? (
        <Repos
          repos={repos}
          loading={isLoading}
          error={Boolean(error)}
          retry={() => void refetch()}
        />
      ) : (
        <AgentLab />
      )}
      <Deck tab={tab} setTab={setTab} exit={() => router.push('/')} />
    </main>
  );
}
