'use client';

// ============================================================================
// QuantGit — Official GitHub MCP Registry /mcp (Screens 59–60)
// ============================================================================

import React, { useState, useMemo } from 'react';

export interface MCPServerEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  icon: string;
  category: 'devtools' | 'data' | 'automation' | 'creative' | 'integration';
}

export const OFFICIAL_MCP_CATALOG: MCPServerEntry[] = [
  {
    id: 'markitdown',
    name: 'Markitdown',
    author: 'microsoft',
    description: 'Convert various file formats (PDF, Word, Excel, images, audio) to Markdown.',
    icon: '📄',
    category: 'data',
  },
  {
    id: 'chrome-devtools',
    name: 'Chrome DevTools MCP',
    author: 'ChromeDevTools',
    description:
      'MCP server for Chrome DevTools: live DOM snapshots, accessibility tree inspection, clicks, navigation.',
    icon: '🌐',
    category: 'devtools',
  },
  {
    id: 'playwright',
    name: 'Playwright',
    author: 'microsoft',
    description:
      'Automate web browsers using accessibility trees for testing and robust data extraction.',
    icon: '🎭',
    category: 'automation',
  },
  {
    id: 'github',
    name: 'GitHub',
    author: 'github',
    description:
      'Connect AI assistants to GitHub — manage repos, issues, PRs, and workflows through natural language.',
    icon: '🐙',
    category: 'integration',
  },
  {
    id: 'serena',
    name: 'Serena',
    author: 'oraios',
    description: 'Semantic code retrieval & AST-level editing tools for coding agents.',
    icon: '🔮',
    category: 'devtools',
  },
  {
    id: 'upstash',
    name: 'Upstash',
    author: 'upstash',
    description:
      'Sub-millisecond Serverless Redis and Vector database operations for agent memory and caching.',
    icon: '⚡',
    category: 'data',
  },
  {
    id: 'unity',
    name: 'Unity',
    author: 'Unity',
    description: 'Control the Unity Editor from MCP clients via a Unity Editor IPC bridge.',
    icon: '🎮',
    category: 'creative',
  },
];

export interface MCPRegistryTabProps {
  repoOwner?: string;
  repoName?: string;
}

export const MCPRegistryTab: React.FC<MCPRegistryTabProps> = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredServers = useMemo(() => {
    return OFFICIAL_MCP_CATALOG.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.author.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = activeCategory === 'all' || s.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [searchQuery, activeCategory]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 text-[#E6EDF3] py-4">
      {/* Hero Banner (Screens 59–60) */}
      <div className="rounded-2xl bg-gradient-to-b from-[var(--quant-surface-elevated)] to-[#0D1117] border border-[#30363D] p-8 text-center space-y-3 relative overflow-hidden">
        <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/40 mx-auto flex items-center justify-center text-3xl shadow-lg">
          🔌
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#E6EDF3]">
          Connect models to the real world
        </h2>
        <p className="text-sm text-[#8D96A0] max-w-xl mx-auto">
          Servers and tools from the community that connect models to files, APIs, databases, and
          more.
        </p>

        {/* Search Bar */}
        <div className="pt-2 max-w-lg mx-auto relative flex items-center">
          <svg
            className="absolute left-4 w-4 h-4 text-[#8D96A0]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search MCPs..."
            className="w-full bg-[var(--quant-surface-elevated)] border border-[#30363D] focus:border-[#58A6FF] rounded-xl py-2.5 pl-11 pr-4 text-sm text-[#E6EDF3] placeholder-[#8D96A0] outline-none shadow-inner transition-all"
          />
        </div>
      </div>

      {/* Category Pills & Total Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#30363D] pb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[#E6EDF3]">All MCP servers</span>
          <span className="px-2 py-0.5 rounded-full bg-[#21262D] text-xs font-mono text-[#8D96A0]">
            {OFFICIAL_MCP_CATALOG.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'devtools', 'data', 'automation', 'integration', 'creative'].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs capitalize font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-[#58A6FF] text-white shadow-sm'
                  : 'bg-[#21262D] text-[#8D96A0] hover:text-[#E6EDF3] hover:bg-[#30363D]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Server Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredServers.map((server) => {
          return (
            <div
              key={server.id}
              className="rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] hover:border-[#58A6FF]/60 p-5 flex flex-col justify-between gap-4 transition-all group"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#21262D] border border-[#30363D] flex items-center justify-center text-xl shrink-0">
                      {server.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-[#E6EDF3] group-hover:text-[#58A6FF] transition-colors">
                        {server.name}
                      </h4>
                      <p className="text-xs text-[#8D96A0]">By {server.author}</p>
                    </div>
                  </div>

                  {/* No install API exists yet, so there is no working install
                      action to offer — show an honest disabled state instead of
                      a button that only flips local state. */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      title="MCP server installation is not available in QuantGit yet"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-[#21262D] text-[#8D96A0] border border-[#30363D] opacity-60 cursor-not-allowed"
                    >
                      <span>Install unavailable</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#8D96A0] leading-relaxed line-clamp-2">
                  {server.description}
                </p>
              </div>

              {/* Footer info: category only — no fabricated install counts */}
              <div className="flex items-center justify-end pt-2 border-t border-[#21262D] text-[11px] text-[#8D96A0]">
                <span className="capitalize px-2 py-0.5 rounded-md bg-[#21262D] text-[10px]">
                  {server.category}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
