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
  installs: number;
  icon: string;
  isInstalled?: boolean;
  category: 'devtools' | 'data' | 'automation' | 'creative' | 'integration';
}

const OFFICIAL_MCP_CATALOG: MCPServerEntry[] = [
  {
    id: 'markitdown',
    name: 'Markitdown',
    author: 'microsoft',
    description: 'Convert various file formats (PDF, Word, Excel, images, audio) to Markdown.',
    installs: 186715,
    icon: '📄',
    category: 'data',
  },
  {
    id: 'chrome-devtools',
    name: 'Chrome DevTools MCP',
    author: 'ChromeDevTools',
    description:
      'MCP server for Chrome DevTools: live DOM snapshots, accessibility tree inspection, clicks, navigation.',
    installs: 52551,
    icon: '🌐',
    isInstalled: true,
    category: 'devtools',
  },
  {
    id: 'playwright',
    name: 'Playwright',
    author: 'microsoft',
    description:
      'Automate web browsers using accessibility trees for testing and robust data extraction.',
    installs: 37530,
    icon: '🎭',
    category: 'automation',
  },
  {
    id: 'github',
    name: 'GitHub',
    author: 'github',
    description:
      'Connect AI assistants to GitHub — manage repos, issues, PRs, and workflows through natural language.',
    installs: 33166,
    icon: '🐙',
    isInstalled: true,
    category: 'integration',
  },
  {
    id: 'serena',
    name: 'Serena',
    author: 'oraios',
    description: 'Semantic code retrieval & AST-level editing tools for coding agents.',
    installs: 29763,
    icon: '🔮',
    category: 'devtools',
  },
  {
    id: 'upstash',
    name: 'Upstash',
    author: 'upstash',
    description:
      'Sub-millisecond Serverless Redis and Vector database operations for agent memory and caching.',
    installs: 62381,
    icon: '⚡',
    category: 'data',
  },
  {
    id: 'unity',
    name: 'Unity',
    author: 'Unity',
    description: 'Control the Unity Editor from MCP clients via a Unity Editor IPC bridge.',
    installs: 14200,
    icon: '🎮',
    category: 'creative',
  },
];

export interface MCPRegistryTabProps {
  repoOwner?: string;
  repoName?: string;
  onInstallServer?: (server: MCPServerEntry) => void;
}

export const MCPRegistryTab: React.FC<MCPRegistryTabProps> = ({
  repoOwner,
  repoName,
  onInstallServer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [installedServers, setInstalledServers] = useState<Record<string, boolean>>({
    'chrome-devtools': true,
    github: true,
  });

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

  const handleInstallToggle = (server: MCPServerEntry) => {
    const isNowInstalled = !installedServers[server.id];
    setInstalledServers((prev) => ({ ...prev, [server.id]: isNowInstalled }));
    onInstallServer?.(server);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 text-[#E6EDF3] py-4">
      {/* Hero Banner (Screens 59–60) */}
      <div className="rounded-2xl bg-gradient-to-b from-[#1E293B] to-[#0D1117] border border-[#30363D] p-8 text-center space-y-3 relative overflow-hidden">
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
            className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] rounded-xl py-2.5 pl-11 pr-4 text-sm text-[#E6EDF3] placeholder-[#8D96A0] outline-none shadow-inner transition-all"
          />
        </div>
      </div>

      {/* Category Pills & Total Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#30363D] pb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[#E6EDF3]">All MCP servers</span>
          <span className="px-2 py-0.5 rounded-full bg-[#21262D] text-xs font-mono text-[#8D96A0]">
            288
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
          const isInstalled = !!installedServers[server.id];
          return (
            <div
              key={server.id}
              className="rounded-xl bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF]/60 p-5 flex flex-col justify-between gap-4 transition-all group"
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

                  {/* Install Button with Dropdown (Screens 59–60) */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleInstallToggle(server)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        isInstalled
                          ? 'bg-[#238636] text-white'
                          : 'bg-[#21262D] hover:bg-[#30363D] text-[#E6EDF3] border border-[#30363D]'
                      }`}
                    >
                      {isInstalled ? (
                        <>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span>Installed</span>
                        </>
                      ) : (
                        <span>Install</span>
                      )}
                    </button>
                    <button className="p-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3] border border-[#30363D] text-xs">
                      ▼
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#8D96A0] leading-relaxed line-clamp-2">
                  {server.description}
                </p>
              </div>

              {/* Footer info: install count & stars */}
              <div className="flex items-center justify-between pt-2 border-t border-[#21262D] text-[11px] text-[#8D96A0]">
                <div className="flex items-center gap-1.5">
                  <span>⭐</span>
                  <span>{server.installs.toLocaleString()} installs</span>
                </div>
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
