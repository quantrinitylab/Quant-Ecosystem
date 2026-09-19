'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  apps,
  appLogos,
  quantSymbolLight,
  quantSymbolDark,
  quantWordmarkLight,
  quantWordmarkDark,
} from '@quant/brand';

const APP_METADATA: Record<string, { category: string; description: string; benchmark: string }> = {
  quantmail: {
    category: 'Super-Hub & Identity Root',
    description: 'Unified email, OAuth2/SSO root, Drive, Calendar, Docs, and CodeHub management.',
    benchmark: 'Gmail + Superhuman + Fastmail',
  },
  quantchat: {
    category: 'Ephemeral & Realtime Messaging',
    description:
      'E2EE messaging, voice notes, ephemeral view-once snaps, and QuantMeet video calls.',
    benchmark: 'WhatsApp + Telegram + Snapchat',
  },
  quantai: {
    category: 'Central Autonomous Control Plane',
    description:
      'Cross-app agent swarm orchestrator, CLI interactive terminal, and split-screen Canvas.',
    benchmark: 'Claude Code + ChatGPT + Codex',
  },
  quantcalendar: {
    category: 'Time & Scheduling Engine',
    description:
      'Conflict-free booking engine, RRULE recurrence series, and CalDAV native synchronization.',
    benchmark: 'Google Calendar + Calendly',
  },
  quantdocs: {
    category: 'Realtime Document Collaboration',
    description:
      'CRDT Yjs rich-text engine, hierarchical subpages, and Cloudflare R2 binary snapshots.',
    benchmark: 'Notion + Google Docs + Coda',
  },
  quantdrive: {
    category: 'Cloud Storage & File Vault',
    description:
      '5GB S3 multipart uploads, GIN trigram indexing, and 5 AI file intelligence tools.',
    benchmark: 'Google Drive + Dropbox',
  },
  quantmeet: {
    category: 'Video Conferencing Gateway',
    description: 'LiveKit SFU gateway, automated AI meeting transcriptions, and screen recordings.',
    benchmark: 'Zoom + Google Meet',
  },
  quantneon: {
    category: 'Visual Social & Playable Feed',
    description:
      'Reels, 24h stories, close-friends circles, interactive AR games, and direct messaging.',
    benchmark: 'Instagram + Threads',
  },
  quantsync: {
    category: 'Public Town Square & Discourse',
    description:
      'Real-time trending feeds, anonymous identity posting, verified spaces, and community polls.',
    benchmark: 'X (Twitter) + Reddit',
  },
  quantube: {
    category: 'Video Streaming & Sound Studio',
    description:
      'High-bitrate video/music streaming, creator chapters, AI segment skipping, and playlists.',
    benchmark: 'YouTube + Spotify',
  },
  quantmax: {
    category: 'Short Video & Social Discovery',
    description: 'Algorithmic short-form video feed, swipe matching, and randomized video chat.',
    benchmark: 'TikTok + Tinder + Omegle',
  },
  quantedits: {
    category: 'AI Video & Media Creation',
    description:
      'Generative AI media pipelines, automatic timeline editing, and multi-platform publishing.',
    benchmark: 'Higgsfield + CapCut Pro',
  },
  quantads: {
    category: 'Monetization & Auction Engine',
    description:
      'Second-price ad auction engine, creator credit payouts, and advertiser campaign analytics.',
    benchmark: 'Google Ads + Meta Ads',
  },
  marketing: {
    category: 'Ecosystem Portal & Showcase',
    description:
      'Public showcase, developer SDK documentation, and product suite marketing center.',
    benchmark: 'Apple.com + Stripe.com',
  },
  quantmaps: {
    category: 'Spatial Intelligence & Nav',
    description:
      'Vector tile map rendering, real-time presence sharing, and local business discovery.',
    benchmark: 'Google Maps + Apple Maps',
  },
  quantphotos: {
    category: 'Media Memory & Vault',
    description:
      'Encrypted photo album storage, facial recognition clusters, and timeline memories.',
    benchmark: 'Google Photos + iCloud',
  },
};

export default function BrandShowcasePage() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('dark');
  const [copiedApp, setCopiedApp] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isDark = themeMode === 'dark';

  const appsList = Object.entries(appLogos).map(([id, logo]) => {
    const appInfo = (
      apps as Record<string, { id: string; name: string; color: string; description: string }>
    )[id] ?? {
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      color: '#6366F1',
      description: '',
    };
    const meta = APP_METADATA[id] ?? {
      category: 'Ecosystem Subsystem',
      description: appInfo.description || 'Core ecosystem application',
      benchmark: 'Market Incumbent',
    };
    return { id, logo, appInfo, meta };
  });

  const filteredApps = appsList.filter(({ id, appInfo, meta }) => {
    const q = searchQuery.toLowerCase();
    return (
      id.toLowerCase().includes(q) ||
      appInfo.name.toLowerCase().includes(q) ||
      meta.category.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q)
    );
  });

  const handleCopySvg = (id: string, svg: string) => {
    navigator.clipboard.writeText(svg);
    setCopiedApp(id);
    setTimeout(() => setCopiedApp(null), 2000);
  };

  const handleDownloadSvg = (name: string, svg: string) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.toLowerCase()}-logo.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        isDark ? 'bg-[#0B0F19] text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Top Navigation Bar */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-md px-6 py-4 flex items-center justify-between transition-colors ${
          isDark ? 'bg-[#0B0F19]/80 border-slate-800' : 'bg-white/80 border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 transition-transform group-hover:scale-105"
              dangerouslySetInnerHTML={{
                __html: isDark ? quantSymbolDark : quantSymbolLight,
              }}
            />
            <div
              className="h-7 w-32 hidden sm:block"
              dangerouslySetInnerHTML={{
                __html: isDark ? quantWordmarkDark : quantWordmarkLight,
              }}
            />
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            Brand System 2.0
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search apps or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`text-sm rounded-lg px-3.5 py-1.5 w-48 sm:w-64 border outline-none transition-all ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                  : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
              }`}
            />
          </div>

          <button
            onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-xs'
            }`}
            title="Toggle Light / Dark Theme"
          >
            {isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </div>
      </header>

      {/* Hero Header */}
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-8">
        <div className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Quant Ecosystem Brand Identity & Logos
          </h1>
          <p
            className={`mt-3 text-base sm:text-lg leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
          >
            A comprehensive, mathematical brand system comprising 16 bespoke vector application
            identities. Engineered with precision geometric glyphs, radiant quantum gradients, and
            zero blur degradation.
          </p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
          <div
            className={`p-4 rounded-xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="text-2xl font-bold text-indigo-500">16</div>
            <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Ecosystem Applications
            </div>
          </div>
          <div
            className={`p-4 rounded-xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="text-2xl font-bold text-cyan-500">100%</div>
            <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Bespoke Vector SVGs
            </div>
          </div>
          <div
            className={`p-4 rounded-xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="text-2xl font-bold text-emerald-500">WCAG AAA</div>
            <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Contrast Verified
            </div>
          </div>
          <div
            className={`p-4 rounded-xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="text-2xl font-bold text-violet-500">Dual-Theme</div>
            <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Light & Dark Gradients
            </div>
          </div>
        </div>
      </section>

      {/* Grid of 16 App Cards */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            Applications & Micro-Services ({filteredApps.length})
          </h2>
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Click any logo to copy SVG markup
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredApps.map(({ id, logo, appInfo, meta }) => {
            const currentSvg = isDark ? logo.dark : logo.light;
            const isCopied = copiedApp === id;

            return (
              <div
                key={id}
                className={`flex flex-col justify-between rounded-2xl border p-5 transition-all hover:shadow-lg ${
                  isDark
                    ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div>
                  {/* Visual Logo Preview Area */}
                  <div
                    className={`relative rounded-xl p-6 flex items-center justify-center mb-4 transition-colors ${
                      isDark ? 'bg-slate-950/60' : 'bg-slate-50'
                    }`}
                  >
                    <div
                      className="w-48 h-12 transition-transform hover:scale-105 cursor-pointer flex items-center justify-center"
                      title="Click to copy SVG"
                      onClick={() => handleCopySvg(id, currentSvg)}
                      dangerouslySetInnerHTML={{ __html: currentSvg }}
                    />
                    <div
                      className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full border border-black/20"
                      style={{ backgroundColor: appInfo.color }}
                      title={`Primary: ${appInfo.color}`}
                    />
                  </div>

                  {/* Title and metadata */}
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-bold tracking-tight">{appInfo.name}</h3>
                    <span className="text-[11px] font-mono text-indigo-400">{appInfo.color}</span>
                  </div>

                  <div className="text-xs font-medium text-cyan-500 mt-0.5">{meta.category}</div>

                  <p
                    className={`text-xs mt-2 leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {meta.description}
                  </p>

                  <div className="mt-3 pt-3 border-t border-slate-800/40 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Target:
                    </span>
                    <span
                      className={`text-[11px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                    >
                      {meta.benchmark}
                    </span>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-5 pt-3 border-t border-slate-800/40 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleCopySvg(id, currentSvg)}
                    className={`flex-1 text-xs py-1.5 px-2.5 rounded-lg font-medium transition-colors ${
                      isCopied
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isDark
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    {isCopied ? '✓ Copied SVG!' : 'Copy SVG'}
                  </button>
                  <button
                    onClick={() => handleDownloadSvg(appInfo.name, currentSvg)}
                    className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${
                      isDark
                        ? 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                    title="Download SVG file"
                  >
                    ⬇
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Brand Design Tokens Section */}
      <section className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-800/50">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Ecosystem Design Foundations</h2>
        <p className={`text-sm mb-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          The color scales, typography metrics, and spatial design tokens shared across all 16
          applications.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Primary Indigo Palette */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <h4 className="text-sm font-semibold mb-3">Primary Quantum Scale</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#4F46E5] text-white font-medium">
                <span>Primary 600</span>
                <span className="font-mono">#4F46E5</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#6366F1] text-white font-medium">
                <span>Primary 500</span>
                <span className="font-mono">#6366F1</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#818CF8] text-slate-900 font-medium">
                <span>Primary 400</span>
                <span className="font-mono">#818CF8</span>
              </div>
            </div>
          </div>

          {/* Accent Cyan Palette */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <h4 className="text-sm font-semibold mb-3">Accent Radiant Scale</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#06B6D4] text-slate-900 font-medium">
                <span>Cyan 500</span>
                <span className="font-mono">#06B6D4</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#22D3EE] text-slate-900 font-medium">
                <span>Cyan 400</span>
                <span className="font-mono">#22D3EE</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#67E8F9] text-slate-900 font-medium">
                <span>Cyan 300</span>
                <span className="font-mono">#67E8F9</span>
              </div>
            </div>
          </div>

          {/* Semantic Status */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <h4 className="text-sm font-semibold mb-3">Semantic Tokens</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#10B981] text-white font-medium">
                <span>Success</span>
                <span className="font-mono">#10B981</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#F59E0B] text-slate-900 font-medium">
                <span>Warning</span>
                <span className="font-mono">#F59E0B</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#EF4444] text-white font-medium">
                <span>Danger</span>
                <span className="font-mono">#EF4444</span>
              </div>
            </div>
          </div>

          {/* Surface & Glass Tokens */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <h4 className="text-sm font-semibold mb-3">Geometric Glyphs</h4>
            <p
              className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
            >
              Every icon is mathematically centered on a 48×48 viewBox grid with a 4.5px stroke
              width and smooth continuous corner radiuses.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div
                className="w-8 h-8"
                dangerouslySetInnerHTML={{ __html: isDark ? quantSymbolDark : quantSymbolLight }}
              />
              <span className="text-xs font-mono text-indigo-400">Mobius Quantum Knot</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
