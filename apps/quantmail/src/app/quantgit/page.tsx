'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
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

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  mode?: BuildMode;
  timestamp: string;
  suggestions?: string[];
};

type DeployedAgent = {
  id: string;
  name: string;
  role: string;
  pod: string;
  status: 'active' | 'idle' | 'building' | 'analyzing';
  currentTask: string;
  initial: string;
  color: string;
};

const AGENT_FLEET_CATALOG = [
  {
    id: 'astra',
    name: 'Astra',
    role: 'Executive Lead & Architecture Gatekeeper',
    pod: 'COMMAND',
    initial: 'A',
    description: 'Verifies architectural invariants, reviews diffs, and controls security gates.',
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Autonomous Code Builder',
    pod: 'BUILD',
    initial: 'F',
    description: 'Implements deep refactors, generates tests, and resolves compile errors.',
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Codebase Researcher & Bug Finder',
    pod: 'RESEARCH',
    initial: 'S',
    description: 'Performs semantic searches, traces AST paths, and benchmarks competitor APIs.',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    role: 'UI/UX & Mobile Ergonomics',
    pod: 'STUDIO',
    initial: 'P',
    description: 'Polishes component responsiveness, touch targets, and visual fidelity.',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Security & QA Auditor',
    pod: 'SHIELD',
    initial: 'S',
    description: 'Runs zero-mock test gates, checks OWASP top 10, and monitors CI/CD status.',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    role: 'Data Services & Migrations',
    pod: 'DATA',
    initial: 'L',
    description: 'Manages database schemas, Prisma migrations, and caching layers.',
  },
];

type IconName =
  | 'sparkles'
  | 'repo'
  | 'lab'
  | 'exit'
  | 'plan'
  | 'build'
  | 'arrow'
  | 'search'
  | 'star'
  | 'fork'
  | 'branch'
  | 'copy'
  | 'close'
  | 'check'
  | 'plus'
  | 'back'
  | 'bot'
  | 'shield'
  | 'cpu'
  | 'terminal';

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
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="9" r="3" />
        <path d="M6 9v6M9 6h3a3 3 0 0 1 3 3v0" />
      </>
    ),
    copy: (
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    close: <path d="M18 6 6 18M6 6l12 12" />,
    check: <polyline points="20 6 9 17 4 12" />,
    plus: <path d="M12 5v14M5 12h14" />,
    back: <path d="M19 12H5M12 19l-7-7 7-7" />,
    bot: (
      <>
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M12 4v4M9 13h.01M15 13h.01M8 17h8" />
      </>
    ),
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    cpu: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
      </>
    ),
    terminal: (
      <>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function QuantGitLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative grid size-8 place-items-center rounded-lg border border-[#5C3016] bg-[#2B1A11] text-[#FF8C42]">
        <span className="size-3.5 rotate-45 rounded-[3px] border-2 border-current" />
        <span className="absolute size-1 rounded-full bg-current shadow-[0_0_8px_#FF8C42]" />
      </span>
      <span className="text-sm font-semibold tracking-tight text-white">QuantGit</span>
    </div>
  );
}

function BottomDeck({
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
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-xl grid-cols-4 gap-1 rounded-2xl border border-[#282C35] bg-[#0B0C0E]/95 p-1.5 shadow-2xl backdrop-blur-xl"
    >
      {items.map((item) => {
        const selected = item.key === tab;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => (item.key === 'exit' ? exit() : setTab(item.key))}
            aria-current={selected ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-all ${
              selected
                ? 'bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016]'
                : 'text-[#A1A4AC] hover:bg-[#1C1F26] hover:text-white'
            }`}
          >
            <Icon name={item.icon} className="size-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function QuantyChatStream({ repoNames }: { repoNames: string[] }) {
  const [mode, setMode] = useState<BuildMode>('plan');
  const [effort, setEffort] = useState<Effort>('fast');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi! I'm Quanty, your autonomous coding companion in QuantGit. What would you like to plan, audit, or build today?",
      timestamp: 'Just now',
      suggestions: [
        'Audit repository',
        'Plan next sprint wave',
        'Check CI/CD health',
        'Deploy specialized agent',
      ],
    },
  ]);
  const [isResponding, setIsResponding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isResponding]);

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isResponding) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      mode,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsResponding(true);

    window.setTimeout(() => {
      let replyText = '';
      const lower = text.toLowerCase();

      if (lower === 'hi' || lower === 'hello' || lower === 'hey') {
        replyText =
          'Hello! Ready to ship. Choose [Plan] for architectural specs & audits, or [Build] to generate and modify code. You can also explore Repos and the Agent Lab below!';
      } else if (lower.includes('audit')) {
        replyText =
          'Initiating repository audit: Static analysis, OWASP security checks, and zero-mock verification queued. All critical paths passing.';
      } else if (lower.includes('sprint') || lower.includes('plan')) {
        replyText =
          'Sprint Planner synchronized: Next wave tasks loaded in TASK_PLANNER.md. Swarm roster is online across all 8 agent pods.';
      } else if (lower.includes('deploy') || lower.includes('agent')) {
        replyText =
          "To deploy an agent to a specific repository, tap the 'Agent Lab' tab below, choose your repository, and tap '+ Deploy Agent'.";
      } else {
        replyText = `Understood. Analyzing "${text}" in ${mode.toUpperCase()} mode (${effort} effort). Checking repository AST and dependencies... Ready to execute next step.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setIsResponding(false);
    }, 450);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)] pb-36">
      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#2B1A11] text-white border border-[#5C3016] rounded-br-none shadow-md'
                  : 'bg-[#16181D] text-[#F5F5F5] border border-[#282C35] rounded-bl-none shadow-md'
              }`}
            >
              {msg.mode && (
                <span className="inline-block mb-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#FF8C42]/20 text-[#FF8C42]">
                  {msg.mode}
                </span>
              )}
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-3 pt-2 border-t border-[#282C35] flex flex-wrap gap-1.5">
                  {msg.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSend(suggestion)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#0B0C0E] border border-[#282C35] text-[#A1A4AC] hover:text-[#FF8C42] hover:border-[#5C3016] transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-[#A1A4AC]/60 mt-1 px-1">{msg.timestamp}</span>
          </div>
        ))}
        {isResponding && (
          <div className="flex items-center gap-2 self-start bg-[#16181D] border border-[#282C35] px-3.5 py-2.5 rounded-2xl rounded-bl-none">
            <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce" />
            <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce [animation-delay:0.15s]" />
            <span className="size-1.5 rounded-full bg-[#FF8C42] animate-bounce [animation-delay:0.3s]" />
            <span className="text-[10px] text-[#A1A4AC] ml-1">Quanty is thinking…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Ultra-Compact Docked Command Bar (Positioned tightly above bottom tabs) */}
      <div className="fixed bottom-[68px] inset-x-3 max-w-xl mx-auto z-30">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-1.5 p-1.5 rounded-2xl border border-[#282C35] bg-[#16181D]/95 backdrop-blur-md shadow-xl"
        >
          {/* Mode Toggle: Plan vs Build */}
          <div className="flex items-center bg-[#0B0C0E] rounded-xl p-0.5 border border-[#282C35]/60 shrink-0">
            <button
              type="button"
              onClick={() => setMode('plan')}
              className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                mode === 'plan'
                  ? 'bg-[#1C1F26] text-[#FF8C42] shadow-sm'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
            >
              Plan
            </button>
            <button
              type="button"
              onClick={() => setMode('build')}
              className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${
                mode === 'build'
                  ? 'bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016] shadow-sm'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
            >
              Build
            </button>
          </div>

          {/* Effort Indicator */}
          <button
            type="button"
            onClick={() => setEffort((prev) => (prev === 'fast' ? 'deep' : 'fast'))}
            title={`Effort: ${effort}. Click to toggle.`}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-[#0B0C0E] border border-[#282C35] text-[#A1A4AC] shrink-0"
          >
            <span
              className={`size-1.5 rounded-full ${effort === 'deep' ? 'bg-amber-400' : 'bg-blue-400'}`}
            />
            <span>{effort === 'fast' ? 'Fast' : 'Deep'}</span>
          </button>

          {/* Single-line Text Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Tell Quanty what to ${mode}…`}
            className="flex-1 min-w-0 bg-transparent px-2.5 text-xs text-white placeholder-[#A1A4AC] outline-none"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!input.trim() || isResponding}
            aria-label="Send to Quanty"
            className="size-8 shrink-0 rounded-xl bg-[#FF8C42] text-black flex items-center justify-center font-bold hover:bg-[#ff9b5a] disabled:opacity-30 transition-all"
          >
            <Icon name="arrow" className="size-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function CloneDialog({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const [protocol, setProtocol] = useState<CloneProtocol>('https');
  const [copied, setCopied] = useState(false);
  const slug = repo.fullName || `quantrinitylab/${repo.name}`;
  const url =
    protocol === 'https'
      ? repo.cloneUrl || `https://github.com/${slug}.git`
      : repo.sshUrl || `git@github.com:${slug}.git`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#282C35] bg-[#16181D] p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#282C35]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF8C42]">
              Clone repository
            </p>
            <h3 className="text-sm font-semibold text-white truncate max-w-[280px]">{slug}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center text-[#A1A4AC] hover:bg-[#1C1F26] hover:text-white"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex rounded-xl bg-[#0B0C0E] p-1 border border-[#282C35]">
          {(['https', 'ssh'] as const).map((proto) => (
            <button
              key={proto}
              type="button"
              onClick={() => setProtocol(proto)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg uppercase transition-colors ${
                protocol === proto
                  ? 'bg-[#1C1F26] text-[#FF8C42]'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
            >
              {proto}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-[#0B0C0E] border border-[#282C35]">
          <code className="flex-1 min-w-0 text-[11px] font-mono text-[#F5F5F5] overflow-x-auto truncate">
            {url}
          </code>
          <button
            type="button"
            onClick={copy}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FF8C42] text-black hover:bg-[#ff9b5a] shrink-0 transition-colors flex items-center gap-1.5"
          >
            <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ReposList({
  repos,
  loading,
  error,
  retry,
  onSelectRepoForLab,
}: {
  repos: Repo[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  onSelectRepoForLab?: (repo: Repo) => void;
}) {
  const [query, setQuery] = useState('');
  const [cloneRepo, setCloneRepo] = useState<Repo | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? repos.filter((r) =>
          `${r.fullName || r.name} ${r.description || ''}`.toLowerCase().includes(q),
        )
      : repos;
  }, [repos, query]);

  return (
    <section className="max-w-3xl mx-auto px-4 pt-6 pb-36 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Repositories</h2>
          <p className="text-xs text-[#A1A4AC] mt-0.5">
            Git source control & autonomous code agents in one unified hub.
          </p>
        </div>
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#A1A4AC]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search repos…"
            className="w-full sm:w-64 pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[#16181D] border border-[#282C35] text-white placeholder-[#A1A4AC] outline-none focus:border-[#5C3016]"
          />
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 rounded-2xl bg-[#16181D] border border-[#282C35] animate-pulse"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-[#2B1A11] border border-[#5C3016] text-xs flex items-center justify-between">
          <span className="text-[#FF8C42]">Could not load repositories.</span>
          <button
            type="button"
            onClick={retry}
            className="font-bold underline text-[#FF8C42] hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="p-8 text-center rounded-2xl border border-dashed border-[#282C35] text-xs text-[#A1A4AC]">
          {query ? (
            <>No repositories found matching &ldquo;{query}&rdquo;.</>
          ) : (
            'No repositories found.'
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((repo) => (
          <div
            key={repo.id}
            className="p-4 rounded-2xl bg-[#16181D] border border-[#282C35] hover:border-[#3A404D] transition-all flex flex-col gap-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white truncate">
                    {repo.fullName || repo.name}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#282C35] text-[#A1A4AC] bg-[#0B0C0E]">
                    {repo.visibility || 'private'}
                  </span>
                </div>
                <p className="text-xs text-[#A1A4AC] mt-1 line-clamp-2">
                  {repo.description || 'Unified repository workspace inside Quant Ecosystem.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloneRepo(repo)}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-[#0B0C0E] border border-[#282C35] text-white hover:bg-[#1C1F26] shrink-0"
              >
                Clone
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#A1A4AC] pt-2 border-t border-[#282C35]/60">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-blue-400" />
                <span>{repo.language || 'TypeScript'}</span>
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Icon name="branch" className="size-3" />
                <span>{repo.defaultBranch || 'main'}</span>
              </span>
              {typeof repo.stars === 'number' && (
                <span className="flex items-center gap-1">
                  <Icon name="star" className="size-3" />
                  <span>{repo.stars}</span>
                </span>
              )}
              {onSelectRepoForLab && (
                <button
                  type="button"
                  onClick={() => onSelectRepoForLab(repo)}
                  className="ml-auto text-[11px] font-bold text-[#FF8C42] hover:underline flex items-center gap-1"
                >
                  <Icon name="lab" className="size-3" />
                  <span>Open Agent Lab →</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {cloneRepo && <CloneDialog repo={cloneRepo} onClose={() => setCloneRepo(null)} />}
    </section>
  );
}

function RepositoryFirstAgentLab({ repos }: { repos: Repo[] }) {
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [deployedAgentsByRepo, setDeployedAgentsByRepo] = useState<Record<string, DeployedAgent[]>>(
    {
      'Quant-Ecosystem': [
        {
          id: 'astra',
          name: 'Astra',
          role: 'Fleet Lead & Security Gatekeeper',
          pod: 'COMMAND',
          status: 'active',
          currentTask: 'Verifying staging migrations & CI pass',
          initial: 'A',
          color: '#FF8C42',
        },
        {
          id: 'sentinel',
          name: 'Sentinel',
          role: 'Audit & QA Sentinel',
          pod: 'SHIELD',
          status: 'analyzing',
          currentTask: 'Zero-mock Vitest regression suites',
          initial: 'S',
          color: '#34d399',
        },
      ],
    },
  );
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 2500);
  };

  const handleDeployAgent = (catalogAgent: (typeof AGENT_FLEET_CATALOG)[0]) => {
    if (!selectedRepo) return;
    const repoKey = selectedRepo.name;
    const current = deployedAgentsByRepo[repoKey] || [];

    if (current.some((a) => a.id === catalogAgent.id)) {
      showToast(`${catalogAgent.name} is already deployed on ${repoKey}!`);
      setIsDeployModalOpen(false);
      return;
    }

    const newAgent: DeployedAgent = {
      id: catalogAgent.id,
      name: catalogAgent.name,
      role: catalogAgent.role,
      pod: catalogAgent.pod,
      status: 'active',
      currentTask: 'Standing by for instructions',
      initial: catalogAgent.initial,
      color: '#FF8C42',
    };

    setDeployedAgentsByRepo((prev) => ({
      ...prev,
      [repoKey]: [...(prev[repoKey] || []), newAgent],
    }));

    setIsDeployModalOpen(false);
    showToast(`Deployed ${catalogAgent.name} to ${repoKey}`);
  };

  const deployed = selectedRepo
    ? deployedAgentsByRepo[selectedRepo.name] ||
      deployedAgentsByRepo[selectedRepo.fullName || ''] ||
      []
    : [];

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-36 w-full">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-16 inset-x-4 max-w-sm mx-auto z-50 p-3 rounded-xl bg-[#2B1A11] border border-[#5C3016] text-xs font-semibold text-[#FF8C42] shadow-xl text-center">
          {toastMessage}
        </div>
      )}

      {/* STEP 1: Repository Selection View */}
      {!selectedRepo ? (
        <div>
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF8C42]">
              Autonomous Operations
            </p>
            <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">Agent Lab</h2>
            <p className="text-xs text-[#A1A4AC] mt-1">
              Select a repository to inspect its deployed agents or launch new fleet specialists.
            </p>
          </div>

          <div className="space-y-3">
            {repos.map((repo) => {
              const count = (deployedAgentsByRepo[repo.name] || []).length;
              return (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => setSelectedRepo(repo)}
                  className="w-full text-left p-4 rounded-2xl bg-[#16181D] border border-[#282C35] hover:border-[#FF8C42]/50 transition-all flex items-center justify-between group"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-[#FF8C42] transition-colors truncate">
                        {repo.fullName || repo.name}
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#282C35] text-[#A1A4AC] bg-[#0B0C0E]">
                        {repo.visibility || 'private'}
                      </span>
                    </div>
                    <p className="text-xs text-[#A1A4AC] mt-1 truncate">
                      {repo.description || 'Select to view and manage repository agents.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                        count > 0
                          ? 'bg-[#2B1A11] text-[#FF8C42] border-[#5C3016]'
                          : 'bg-[#0B0C0E] text-[#A1A4AC] border-[#282C35]'
                      }`}
                    >
                      {count} {count === 1 ? 'Agent' : 'Agents'}
                    </span>
                    <span className="text-[#A1A4AC] group-hover:text-[#FF8C42] transition-colors">
                      →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* STEP 2: Repository Agents Station View */
        <div>
          {/* Breadcrumb Header */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <button
              type="button"
              onClick={() => setSelectedRepo(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#A1A4AC] hover:text-white transition-colors"
            >
              <Icon name="back" className="size-3.5" />
              <span>Repositories</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate max-w-[180px]">
                {selectedRepo.name}
              </span>
              <button
                type="button"
                onClick={() => setIsDeployModalOpen(true)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#FF8C42] text-black hover:bg-[#ff9b5a] transition-all flex items-center gap-1"
              >
                <Icon name="plus" className="size-3" />
                <span>Deploy Agent</span>
              </button>
            </div>
          </div>

          {/* Deployed Agents or Empty State */}
          {deployed.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-[#282C35] bg-[#16181D]/40 space-y-3">
              <div className="size-12 rounded-full bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42] flex items-center justify-center mx-auto">
                <Icon name="bot" className="size-6" />
              </div>
              <h3 className="text-base font-bold text-white">
                No agents deployed on {selectedRepo.name}
              </h3>
              <p className="text-xs text-[#A1A4AC] max-w-sm mx-auto">
                Deploy autonomous specialized agents to handle audits, testing, pull requests, and
                code modifications for this repository.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeployModalOpen(true)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[#FF8C42] text-black hover:bg-[#ff9b5a] transition-all inline-flex items-center gap-2 shadow-lg"
                >
                  <Icon name="plus" className="size-4" />
                  <span>Deploy First Agent</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A4AC]">
                  Active Fleet ({deployed.length})
                </h3>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Fleet Connected
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {deployed.map((agent) => (
                  <div
                    key={agent.id}
                    className="p-4 rounded-2xl bg-[#16181D] border border-[#282C35] hover:border-[#5C3016] transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-xl bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42] flex items-center justify-center font-bold text-base">
                            {agent.initial}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">{agent.name}</h4>
                            <p className="text-[10px] text-[#A1A4AC]">{agent.pod} POD</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-400 uppercase tracking-wider">
                          {agent.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#F5F5F5] font-medium mt-3">{agent.role}</p>
                      <div className="mt-2 p-2 rounded-lg bg-[#0B0C0E] border border-[#282C35]/60 text-[11px] text-[#A1A4AC]">
                        <span className="text-[#FF8C42] font-semibold">Active:</span>{' '}
                        {agent.currentTask}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#282C35] flex items-center justify-between text-[11px]">
                      <span className="text-[#A1A4AC]">24/7 Autonomous</span>
                      <button
                        type="button"
                        onClick={() => showToast(`Triggered audit on ${agent.name}`)}
                        className="font-bold text-[#FF8C42] hover:underline"
                      >
                        Run Task →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deploy Agent Sheet / Modal */}
      {isDeployModalOpen && selectedRepo && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsDeployModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#282C35] bg-[#16181D] p-5 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#282C35]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF8C42]">
                  Deploy to {selectedRepo.name}
                </p>
                <h3 className="text-base font-bold text-white">Select Agent from Swarm Fleet</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeployModalOpen(false)}
                className="size-8 rounded-lg flex items-center justify-center text-[#A1A4AC] hover:bg-[#1C1F26] hover:text-white"
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>

            <div className="mt-4 overflow-y-auto space-y-3 flex-1 pr-1">
              {AGENT_FLEET_CATALOG.map((spec) => (
                <div
                  key={spec.id}
                  className="p-3.5 rounded-xl bg-[#0B0C0E] border border-[#282C35] hover:border-[#5C3016] transition-all flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-lg bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42] flex items-center justify-center font-bold text-sm shrink-0">
                      {spec.initial}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{spec.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#1C1F26] text-[#A1A4AC] font-mono">
                          {spec.pod}
                        </span>
                      </h4>
                      <p className="text-[11px] text-[#FF8C42] font-medium mt-0.5">{spec.role}</p>
                      <p className="text-[10px] text-[#A1A4AC] mt-1">{spec.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeployAgent(spec)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#FF8C42] text-black hover:bg-[#ff9b5a] shrink-0 transition-colors"
                  >
                    Deploy
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_ECOSYSTEM_REPOS: Repo[] = [
  {
    id: 'quant-ecosystem',
    name: 'Quant-Ecosystem',
    fullName: 'quantrinitylab/Quant-Ecosystem',
    description: 'Next-gen enterprise sovereign workspace, autonomous AI swarm & Git hub.',
    visibility: 'public',
    language: 'TypeScript',
    stars: 128,
    forks: 24,
    defaultBranch: 'main',
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
    defaultBranch: 'main',
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
            ? (source.checksStatus as 'pending' | 'failing')
            : ('passing' as const),
      },
    ];
  });
  return parsed.length > 0 ? parsed : DEFAULT_ECOSYSTEM_REPOS;
}

export default function QuantGitPage() {
  const [tab, setTab] = useState<WorkspaceTab>('quanty');
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRepos();
  const repos = useMemo(() => normalizeRepos(data), [data]);

  return (
    <main
      id="main-content"
      className="min-h-dvh bg-[#0B0C0E] text-white selection:bg-[#FF8C42] selection:text-black [color-scheme:dark]"
    >
      {/* Top Header: Just QuantGit Logo + Name on left, Active status on right. No drawer/sidebar toggle. */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#282C35] bg-[#0B0C0E]/90 px-4 backdrop-blur-xl sm:px-6">
        <QuantGitLogo />
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          <span>Active</span>
        </div>
      </header>

      {/* Tab Content */}
      {tab === 'quanty' ? (
        <QuantyChatStream repoNames={repos.map((repo) => repo.fullName || repo.name)} />
      ) : tab === 'repos' ? (
        <ReposList
          repos={repos}
          loading={isLoading}
          error={Boolean(error)}
          retry={() => void refetch()}
          onSelectRepoForLab={(repo) => {
            setTab('lab');
          }}
        />
      ) : (
        <RepositoryFirstAgentLab repos={repos} />
      )}

      {/* 4 Bottom Tabs Deck */}
      <BottomDeck tab={tab} setTab={setTab} exit={() => router.push('/')} />
    </main>
  );
}
