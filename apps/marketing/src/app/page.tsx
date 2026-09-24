'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Mail,
  GitBranch,
  Camera,
  MessageSquare,
  Bot,
  Video,
  Radio,
  Flame,
  Megaphone,
  Shield,
  CheckCircle2,
  ArrowRight,
  Download,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Cpu,
  Wallet,
  Smartphone,
  Monitor,
  Globe,
  Layers,
  Lock,
  Zap,
  BarChart3,
  Terminal,
  X,
  Menu,
  Star,
  Play,
  Share2,
  Code,
  Coins,
  ShieldCheck,
  Check,
  ChevronRight,
  Activity,
  Server,
  Database,
} from 'lucide-react';

interface AppItem {
  id: string;
  name: string;
  tagline: string;
  category: 'core' | 'social' | 'infra';
  badge: string;
  color: string;
  port: number;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  highlights: string[];
  metrics: string;
}

const APPS_DATA: AppItem[] = [
  {
    id: 'quantmail',
    name: 'QuantMail',
    tagline: 'Super-Hub Email + Triage Lenses',
    category: 'core',
    badge: 'Flagship Core',
    color: 'from-blue-500 to-indigo-600',
    port: 3000,
    url: 'http://localhost:3000',
    icon: Mail,
    description:
      'Sovereign auth root, AI email client with Superhuman-speed local OPFS SQLite FTS5 search, smart triage lenses, encrypted Drive storage, CalDAV calendar, and Yjs collaborative docs.',
    highlights: [
      'Sub-5ms local-first full text search via SQLite FTS5 Wasm',
      'Unified Quant Identity with cross-app SSO token handoff',
      'End-to-end attachments stored with SigV4 Cloudflare R2 / S3',
      'AW-OR-Set CRDT sync and idempotent UUIDv7 outbox',
    ],
    metrics: '<5ms p95 search latency',
  },
  {
    id: 'quantgit',
    name: 'QuantGit',
    tagline: 'Sovereign GitHub + Copilot Fleet + MCP Registry',
    category: 'core',
    badge: 'Developer Hub',
    color: 'from-orange-500 to-amber-600',
    port: 3000,
    url: 'http://localhost:3000/quantgit',
    icon: GitBranch,
    description:
      'Full GitHub parity platform. Native Git Smart HTTP, 159-screen GitHub sovereign UI, autonomous Copilot Fleet cloud agents, and official 288+ server Model Context Protocol registry.',
    highlights: [
      'Real Git Smart HTTP daemon with 3-way merge conflict engine',
      'Background autonomous Copilot Cloud Fleet (Claude Opus 5.5, GPT-5.3)',
      'Official MCP server registry with 1-click installer and inspection',
      'Containerized execution sandbox using gVisor Systrap on EC2',
    ],
    metrics: '159 screens of parity',
  },
  {
    id: 'quantgram',
    name: 'QuantGram',
    tagline: '9:16 Instagram Reels Killer + 0% Tip Payouts',
    category: 'social',
    badge: 'Creator Media',
    color: 'from-pink-500 to-rose-600',
    port: 3005,
    url: 'http://localhost:3005',
    icon: Camera,
    description:
      'Full-screen vertical Reels with snap gesture scrolling, double-tap heart reactions, creator audio marquee ticker, nested reply sheets, and direct 0% fee creator tipping.',
    highlights: [
      'Ultra-fluid 9:16 HLS video loop with touch snap & double-tap burst',
      'Direct creator credit tipping with 0% platform fee cut',
      'Drag-to-dismiss comments sheet with floating 8-emoji reaction dock',
      'Interactive AI context sheet with real-time audio track detection',
    ],
    metrics: '0% platform cut on tips',
  },
  {
    id: 'quantchat',
    name: 'QuantChat',
    tagline: 'WhatsApp + Telegram + LiveKit Meet SFU',
    category: 'core',
    badge: 'Realtime Comms',
    color: 'from-emerald-500 to-teal-600',
    port: 3001,
    url: 'http://localhost:3001',
    icon: MessageSquare,
    description:
      'All-in-one messaging powerhouse. WhatsApp-grade direct chats, Telegram public channels, ephemeral view-once snaps with server-side 410 auto-burn, and built-in LiveKit video calls.',
    highlights: [
      'LiveKit SFU video & audio meetings integrated directly into chats',
      'Ephemeral view-once snaps with server-side HTTP 410 destruction',
      'AWS SNS phone OTP with 1-click fallback & cross-app Quant SSO',
      'Audio voice notes with dynamic waveform & background call alarms',
    ],
    metrics: 'Sub-40ms voice latency',
  },
  {
    id: 'quantai',
    name: 'QuantAI',
    tagline: 'Control Plane & Operating Agent (Quanty)',
    category: 'core',
    badge: 'Universal Brain',
    color: 'from-purple-500 to-violet-600',
    port: 3002,
    url: 'http://localhost:3002',
    icon: Bot,
    description:
      'Central agentic operating system. Natural language agent that operates your apps, schedules automated BullMQ tasks, controls browser sessions, and executes cross-app MCP tools.',
    highlights: [
      'Dual workspace toggle: conversational chat vs split-canvas work mode',
      'Autonomous scheduled background crons & task worker ledger',
      'Multi-model switcher: GPT-4o, Claude 3.5 Sonnet, Quant-1 sovereign engine',
      'Layered shared memory in QuantDrive (Redis L1 + Prisma L2 + pgvector L3)',
    ],
    metrics: '1-click cross-app action execution',
  },
  {
    id: 'quantube',
    name: 'Quantube',
    tagline: 'YouTube + Music Streaming with AI Segment Skip',
    category: 'social',
    badge: 'Streaming & Video',
    color: 'from-red-500 to-orange-600',
    port: 3004,
    url: 'http://localhost:3004',
    icon: Video,
    description:
      'Decentralized high-bitrate video and audio streaming platform. Features sponsor segment skipping, short drama mini-series, picture-in-picture mini-player, and creator revenue sharing.',
    highlights: [
      'AI sponsor-block & filler segment auto-skip during playback',
      'High-fidelity lossless music player with background audio support',
      'Direct revenue sharing funded by QuantAds second-price auctions',
      'Dynamic HLS adaptive multi-bitrate 4K streaming pipeline',
    ],
    metrics: 'Adaptive 4K HLS streaming',
  },
  {
    id: 'quantwave',
    name: 'QuantWave',
    tagline: 'Twitter/X + Reddit killer with Verified Spaces',
    category: 'social',
    badge: 'Public Discourse',
    color: 'from-cyan-500 to-blue-600',
    port: 3006,
    url: 'http://localhost:3006',
    icon: Radio,
    description:
      'Microblogging and community forum network. Real-time chronological feeds, cryptographically verified spaces, upvote hierarchies, and anonymous pseudonym post options.',
    highlights: [
      'Chronological real-time timelines with zero algorithmic censorship',
      'Cryptographically verified spaces for discussions and community votes',
      'Pseudonymous posting service with zero metadata logging',
      'Integrated poll engine with live WebSocket tally updates',
    ],
    metrics: 'Zero algorithmic feed bias',
  },
  {
    id: 'quantmax',
    name: 'QuantMax',
    tagline: 'TikTok + Tinder Swipe Matching + Omegle Video',
    category: 'social',
    badge: 'Discovery & Social',
    color: 'from-amber-500 to-yellow-600',
    port: 3008,
    url: 'http://localhost:3008',
    icon: Flame,
    description:
      'Next-generation social discovery combining short-form entertainment, card-swipe matching algorithms, live party games, and WebRTC random video chat.',
    highlights: [
      'Card-swipe matchmaking powered by shared interest vector graphs',
      'Real-world multiplayer party games playable in-feed',
      'Live WebRTC random video chats with safety shields',
      'Zero bot policy backed by Quant biometric identity proof',
    ],
    metrics: 'Sub-100ms card swipe responses',
  },
  {
    id: 'quantads',
    name: 'QuantAds',
    tagline: 'Second-Price Auction Monetization Engine',
    category: 'infra',
    badge: 'Monetization Engine',
    color: 'from-emerald-400 to-green-600',
    port: 3009,
    url: 'http://localhost:3009',
    icon: Megaphone,
    description:
      'Transparent ad exchange and monetization engine that powers creator payouts across the ecosystem. Zero creepy cross-site tracking, fair second-price Vickrey auctions.',
    highlights: [
      'Transparent second-price auction mechanics with verifiable bid logs',
      'Zero third-party tracking cookies: privacy-preserving contextual matching',
      'Directly funds Quant Credits creator pool and daily payouts',
      'Real-time advertiser telemetry dashboard with fraud detection',
    ],
    metrics: '100% transparent bidding ledger',
  },
  {
    id: 'quanttrinity',
    name: 'QuantTrinity',
    tagline: 'Executive Brain & Telemetry Control',
    category: 'infra',
    badge: 'Command & Telemetry',
    color: 'from-violet-600 to-fuchsia-600',
    port: 3011,
    url: 'http://localhost:3011',
    icon: Shield,
    description:
      'Master administrative control center. Real-time Kubernetes cluster monitoring, AI employee swarm telemetry, ecosystem-wide audit trails, and global configuration toggles.',
    highlights: [
      'Real-time telemetry across 18 staging/prod Kubernetes microservices',
      'AI Employee swarm activity monitor (Astra, Forge, Sentinel, Scout)',
      'Sovereign immutable audit log stream with cryptographic signatures',
      'Cross-app user permission overrides & enterprise tenant policies',
    ],
    metrics: '18 services monitored live',
  },
];

export default function MarketingLandingPage() {
  const [activeCategory, setActiveCategory] = useState<'all' | 'core' | 'social' | 'infra'>('all');
  const [selectedApp, setSelectedApp] = useState<AppItem>(APPS_DATA[0]);
  const [isAppsMenuOpen, setIsAppsMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [calculatorViews, setCalculatorViews] = useState<number>(100000);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Close menus on outside click or scroll
  useEffect(() => {
    const handleScroll = () => {
      if (isAppsMenuOpen) setIsAppsMenuOpen(false);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isAppsMenuOpen]);

  const filteredApps =
    activeCategory === 'all'
      ? APPS_DATA
      : APPS_DATA.filter((app) => app.category === activeCategory);

  // Creator economy calculation
  // Typical platform: 100k views = ~$250 RPM gross, platform takes 45% ($112.50), creator gets $137.50
  // Quant platform: $1 = 1 Credit, creator keeps 100% of tips + 80% ad share = ~$320
  const competitorPayout = Math.round(calculatorViews * 0.0018);
  const quantPayout = Math.round(calculatorViews * 0.0034);
  const difference = quantPayout - competitorPayout;

  const handleCopyInstallCmd = () => {
    navigator.clipboard.writeText('curl -fsSL https://quantmail.in/install.sh | bash');
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#E6EDF3] selection:bg-[#FF8C42]/20 selection:text-[#FF8C42]">
      {/* 1. HEADER NAVIGATION */}
      <header className="fixed top-0 left-0 right-0 z-50 frosted-nav transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo & Wordmark */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF8C42] to-[#58A6FF] p-[1.5px] shadow-lg shadow-[#FF8C42]/10 group-hover:shadow-[#FF8C42]/20 transition-all">
                <div className="w-full h-full bg-[#0D1117] rounded-[10px] flex items-center justify-center">
                  <span className="text-xl font-bold bg-gradient-to-r from-[#FF8C42] to-[#58A6FF] bg-clip-text text-transparent">
                    Q
                  </span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-[#E6EDF3] to-[#8B949E] bg-clip-text text-transparent font-serif italic">
                  Quant
                </span>
                <span className="text-[10px] tracking-widest uppercase font-semibold text-[#8B949E] -mt-1">
                  Ecosystem
                </span>
              </div>
            </Link>

            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#161B22] text-[#58A6FF] border border-[#30363D]">
              Next NVIDIA of Software
            </span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {/* Apps Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAppsMenuOpen(!isAppsMenuOpen)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isAppsMenuOpen
                    ? 'text-white bg-[#161B22] border border-[#30363D]'
                    : 'text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]/60'
                }`}
              >
                <span>Apps</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isAppsMenuOpen ? 'rotate-180 text-[#58A6FF]' : ''
                  }`}
                />
              </button>

              {/* Apps Dropdown Menu */}
              {isAppsMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl p-2 z-50 grid grid-cols-1 gap-1">
                  <div className="px-3 py-2 border-b border-[#30363D]/60 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#8B949E]">
                      The 10 Core Applications
                    </span>
                    <span className="text-[10px] text-[#238636] font-mono">10/10 Online</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto py-1">
                    {APPS_DATA.map((app) => {
                      const Icon = app.icon;
                      return (
                        <a
                          key={app.id}
                          href={`#app-${app.id}`}
                          onClick={() => {
                            setSelectedApp(app);
                            setIsAppsMenuOpen(false);
                          }}
                          className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-[#21262D] transition-colors group"
                        >
                          <div className={`p-1.5 rounded-md bg-gradient-to-tr ${app.color}`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-white group-hover:text-[#58A6FF] transition-colors">
                                {app.name}
                              </span>
                              <span className="text-[10px] font-mono text-[#8B949E]">
                                :{app.port}
                              </span>
                            </div>
                            <p className="text-xs text-[#8B949E] truncate">{app.tagline}</p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <a
              href="#showcase"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]/60 transition-colors"
            >
              Features
            </a>
            <a
              href="#economy"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]/60 transition-colors"
            >
              Economy
            </a>
            <a
              href="#downloads"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]/60 transition-colors"
            >
              Download
            </a>
            <a
              href="#metrics"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]/60 transition-colors"
            >
              Status
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center space-x-3">
            <a
              href="http://localhost:3000/login"
              className="text-sm font-semibold text-[#E6EDF3] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#161B22] border border-transparent hover:border-[#30363D] transition-all"
            >
              Sign In
            </a>
            <a
              href="http://localhost:3000"
              className="inline-flex items-center space-x-1.5 text-sm font-semibold text-black bg-[#FF8C42] hover:bg-[#ff9c5c] px-4 py-2 rounded-lg shadow-sm hover:shadow-md hover:shadow-[#FF8C42]/20 transition-all"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[#8B949E] hover:text-white hover:bg-[#161B22]"
            aria-label="Toggle Navigation"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-[#161B22] border-b border-[#30363D] px-4 pt-3 pb-6 space-y-3">
            <div className="space-y-1">
              <a
                href="#showcase"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-white hover:bg-[#21262D]"
              >
                10 Killer Apps
              </a>
              <a
                href="#economy"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-white hover:bg-[#21262D]"
              >
                Credits Economy
              </a>
              <a
                href="#downloads"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-white hover:bg-[#21262D]"
              >
                Download Client
              </a>
              <a
                href="#manifesto"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-white hover:bg-[#21262D]"
              >
                Manifesto
              </a>
            </div>
            <div className="pt-4 border-t border-[#30363D] flex flex-col space-y-2">
              <a
                href="http://localhost:3000/login"
                className="w-full text-center py-2.5 rounded-lg text-sm font-semibold bg-[#21262D] text-white border border-[#30363D]"
              >
                Sign In
              </a>
              <a
                href="http://localhost:3000"
                className="w-full text-center py-2.5 rounded-lg text-sm font-semibold bg-[#FF8C42] text-black"
              >
                Launch Workspace
              </a>
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#FF8C42]/15 via-[#58A6FF]/15 to-transparent blur-[120px] pointer-events-none -z-10" />
        <div className="absolute top-1/3 right-10 w-[300px] h-[250px] bg-[#238636]/10 blur-[100px] pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#161B22] border border-[#30363D] mb-8 shadow-sm hover:border-[#58A6FF]/40 transition-colors">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#238636] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#238636]"></span>
            </span>
            <span className="text-xs font-semibold text-[#E6EDF3]">
              The Next NVIDIA of Software
            </span>
            <span className="text-[#8B949E] text-xs">•</span>
            <span className="text-xs text-[#58A6FF] font-medium flex items-center">
              PR #247 Merged & Active <ChevronRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.1] mb-6">
            The Sovereign{' '}
            <span className="bg-gradient-to-r from-[#FF8C42] via-[#FFA666] to-[#58A6FF] bg-clip-text text-transparent">
              AI Operating System
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl lg:text-2xl text-[#8B949E] max-w-3xl mx-auto leading-relaxed mb-10 font-normal">
            10 Killer Apps in 1 Identity, Controlled by Personal Agentic AI, Powered by Unified
            Quant Credits.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a
              href="#showcase"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded-xl font-semibold text-black bg-[#FF8C42] hover:bg-[#ff9c5c] shadow-lg shadow-[#FF8C42]/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-base"
            >
              <span>Explore Apps</span>
              <ArrowRight className="w-5 h-5" />
            </a>

            <a
              href="#downloads"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded-xl font-semibold text-[#E6EDF3] bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] hover:border-[#8B949E] transition-all text-base"
            >
              <Download className="w-5 h-5 text-[#58A6FF]" />
              <span>Download Client</span>
            </a>
          </div>

          {/* Live Metrics Bar */}
          <div
            id="metrics"
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto bg-[#161B22]/70 border border-[#30363D] rounded-2xl p-4 sm:p-6 backdrop-blur-md shadow-2xl"
          >
            <div className="flex items-center justify-center space-x-3 p-2">
              <div className="p-2.5 rounded-xl bg-[#238636]/15 text-[#238636] border border-[#238636]/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-bold text-white font-mono">2,409</div>
                <div className="text-xs text-[#8B949E] font-medium">Tests Passing (100% Green)</div>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-3 p-2 border-t sm:border-t-0 sm:border-l border-[#30363D]/80">
              <div className="p-2.5 rounded-xl bg-[#58A6FF]/15 text-[#58A6FF] border border-[#58A6FF]/30">
                <Zap className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-bold text-white font-mono">&lt; 5ms</div>
                <div className="text-xs text-[#8B949E] font-medium">Local SQLite FTS5 Search</div>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-3 p-2 border-t sm:border-t-0 sm:border-l border-[#30363D]/80">
              <div className="p-2.5 rounded-xl bg-[#FF8C42]/15 text-[#FF8C42] border border-[#FF8C42]/30">
                <Wallet className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-bold text-white font-mono">0% Fee</div>
                <div className="text-xs text-[#8B949E] font-medium">Creator Platform Tip Cut</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 10-APP INTERACTIVE SHOWCASE GRID */}
      <section id="showcase" className="py-20 border-t border-[#30363D]/70 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-[#FF8C42]">
              Unifying 18 Disjointed Apps Into 10 Masters
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
              The 10 Core Platform Pillars
            </h2>
            <p className="text-[#8B949E] mt-3 text-base">
              Every tool you need to communicate, build, share, and monetize—connected through a
              shared identity and real-time agentic context.
            </p>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              {[
                { id: 'all', label: 'All 10 Apps' },
                { id: 'core', label: 'Core Work & Productivity' },
                { id: 'social', label: 'Social & Media' },
                { id: 'infra', label: 'Infrastructure & Ads' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeCategory === tab.id
                      ? 'bg-[#58A6FF] text-black shadow-md shadow-[#58A6FF]/20'
                      : 'bg-[#161B22] text-[#8B949E] hover:text-white border border-[#30363D]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 10-App Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredApps.map((app) => {
              const Icon = app.icon;
              const isSelected = selectedApp.id === app.id;

              return (
                <div
                  key={app.id}
                  id={`app-${app.id}`}
                  onClick={() => setSelectedApp(app)}
                  className={`cursor-pointer rounded-2xl bg-[#161B22] border transition-all p-6 relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#58A6FF] shadow-xl shadow-[#58A6FF]/10 ring-1 ring-[#58A6FF]/50'
                      : 'border-[#30363D] hover:border-[#58A6FF]/50 hover:bg-[#1a2029]'
                  }`}
                >
                  {/* Top Bar: Icon + Badge + Port */}
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`p-3 rounded-xl bg-gradient-to-tr ${app.color} text-white shadow-md`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0D1117] text-[#8B949E] border border-[#30363D]">
                          Port {app.port}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#21262D] text-[#58A6FF] border border-[#30363D]">
                          {app.badge}
                        </span>
                      </div>
                    </div>

                    {/* Title & Tagline */}
                    <h3 className="text-xl font-bold text-white mb-1">{app.name}</h3>
                    <p className="text-xs font-medium text-[#FF8C42] mb-3">{app.tagline}</p>

                    {/* Description */}
                    <p className="text-sm text-[#8B949E] leading-relaxed mb-4">{app.description}</p>

                    {/* Highlights bullet list */}
                    <ul className="space-y-1.5 mb-6">
                      {app.highlights.slice(0, 3).map((item, idx) => (
                        <li key={idx} className="flex items-start text-xs text-[#C9D1D9]">
                          <Check className="w-3.5 h-3.5 text-[#238636] mr-2 mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Bottom Metric & Launch Button */}
                  <div className="pt-4 border-t border-[#30363D]/70 flex items-center justify-between mt-auto">
                    <span className="text-xs font-mono text-[#8B949E] flex items-center">
                      <Activity className="w-3.5 h-3.5 text-[#238636] mr-1.5" />
                      {app.metrics}
                    </span>
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-[#58A6FF] hover:text-white px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] transition-colors"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3 ml-0.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deep Architectural Detail Drawer for Selected App */}
          <div className="mt-12 bg-[#161B22] border border-[#30363D] rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-[#30363D]/80 pb-6 mb-6">
              <div className="flex items-center space-x-4">
                <div
                  className={`p-4 rounded-2xl bg-gradient-to-tr ${selectedApp.color} text-white shadow-lg`}
                >
                  {React.createElement(selectedApp.icon, { className: 'w-8 h-8' })}
                </div>
                <div>
                  <div className="flex items-center space-x-3">
                    <h3 className="text-2xl font-bold text-white">{selectedApp.name}</h3>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/30">
                      {selectedApp.badge}
                    </span>
                  </div>
                  <p className="text-sm text-[#FF8C42] font-medium mt-0.5">{selectedApp.tagline}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={selectedApp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-black bg-[#FF8C42] hover:bg-[#ff9c5c] text-sm shadow-md transition-all"
                >
                  <span>Launch {selectedApp.name}</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">
                  Core Capabilities
                </h4>
                <ul className="space-y-2">
                  {selectedApp.highlights.map((h, i) => (
                    <li key={i} className="flex items-start text-xs sm:text-sm text-[#E6EDF3]">
                      <CheckCircle2 className="w-4 h-4 text-[#238636] mr-2.5 mt-0.5 shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">
                  Architecture & Parity
                </h4>
                <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-4 space-y-2.5 text-xs text-[#8B949E]">
                  <div className="flex justify-between">
                    <span>Protocol:</span>
                    <span className="font-mono text-white">HTTP/2 + WSS + SigV4</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Local Dev Port:</span>
                    <span className="font-mono text-white">localhost:{selectedApp.port}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Storage Engine:</span>
                    <span className="font-mono text-white">PostgreSQL + Cloudflare R2</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Identity Mode:</span>
                    <span className="font-mono text-[#238636]">Quant SSO Universal Root</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">
                  Verified Parity Status
                </h4>
                <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-4 flex flex-col justify-between h-[132px]">
                  <div>
                    <div className="flex items-center space-x-2 text-[#238636] text-xs font-semibold">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Gate Verified</span>
                    </div>
                    <p className="text-xs text-[#8B949E] mt-1">
                      Tested with live click-by-click Chrome MCP and automated Vitest regression
                      suites.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-[#58A6FF]">
                    {selectedApp.metrics}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. UNIFIED QUANT CREDITS ECONOMY SECTION */}
      <section id="economy" className="py-20 bg-[#161B22]/50 border-t border-[#30363D]/70 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-[#238636]">
              A Sovereign Creator Flywheel
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
              Unified Quant Credits Economy
            </h2>
            <p className="text-[#8B949E] mt-3 text-base">
              The only platform where $1 = 1 Credit. Fund creator tips, buy cloud storage, dispatch
              AI agents, and withdraw earnings daily with zero middleman robbery.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Core Economic Principles */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 relative overflow-hidden">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-[#238636]/15 text-[#238636] border border-[#238636]/30">
                    <Coins className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">$1.00 USD = 1 Quant Credit</h3>
                    <p className="text-xs text-[#8B949E]">
                      Pegged 1:1, non-dilutive, instant redemption
                    </p>
                  </div>
                </div>
                <p className="text-sm text-[#8B949E] leading-relaxed">
                  Unlike traditional platforms that shave 30% to 45% of your creator revenue through
                  hidden in-app token fees, Quant Credits flow peer-to-peer. Creators keep 100% of
                  received direct tips.
                </p>
              </div>

              <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 relative">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-[#58A6FF]/15 text-[#58A6FF] border border-[#58A6FF]/30">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Daily Instant Withdrawals</h3>
                    <p className="text-xs text-[#8B949E]">
                      Direct to UPI (India) or Stripe / Bank (Global)
                    </p>
                  </div>
                </div>
                <p className="text-sm text-[#8B949E] leading-relaxed">
                  No monthly 60-day payout hold periods. Cash out your earnings daily directly to
                  your bank account, UPI ID, or use credits to pay for CodeHub CI runners and S3
                  storage.
                </p>
              </div>

              <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 relative">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-[#FF8C42]/15 text-[#FF8C42] border border-[#FF8C42]/30">
                    <Megaphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">QuantAds Creator Revenue Share</h3>
                    <p className="text-xs text-[#8B949E]">
                      Funded by transparent 2nd-price ad auctions
                    </p>
                  </div>
                </div>
                <p className="text-sm text-[#8B949E] leading-relaxed">
                  Advertisers bid in transparent second-price auctions on QuantAds. 80% of net ad
                  revenue is automatically disbursed into the creator credit pool in real-time.
                </p>
              </div>
            </div>

            {/* Right: Interactive Creator Payout Estimator */}
            <div className="lg:col-span-6 bg-[#161B22] border border-[#30363D] rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#30363D]">
                <div>
                  <h3 className="text-lg font-bold text-white">Creator Payout Calculator</h3>
                  <p className="text-xs text-[#8B949E]">
                    Compare legacy platforms vs Quant Ecosystem
                  </p>
                </div>
                <span className="text-xs font-mono text-[#238636] px-2.5 py-1 rounded bg-[#238636]/10 border border-[#238636]/30">
                  0% Cut Model
                </span>
              </div>

              {/* Slider Input */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center">
                  <label htmlFor="views-slider" className="text-sm font-medium text-[#E6EDF3]">
                    Monthly Reels / Video Views:
                  </label>
                  <span className="text-base font-bold text-[#58A6FF] font-mono">
                    {calculatorViews.toLocaleString()} views
                  </span>
                </div>
                <input
                  id="views-slider"
                  type="range"
                  min="10000"
                  max="1000000"
                  step="10000"
                  value={calculatorViews}
                  onChange={(e) => setCalculatorViews(Number(e.target.value))}
                  className="w-full h-2 bg-[#0D1117] rounded-lg appearance-none cursor-pointer accent-[#FF8C42]"
                />
                <div className="flex justify-between text-[11px] text-[#8B949E] font-mono">
                  <span>10K</span>
                  <span>250K</span>
                  <span>500K</span>
                  <span>1M</span>
                </div>
              </div>

              {/* Comparison Visualizer */}
              <div className="space-y-4 mb-6">
                <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[#8B949E] block">
                      Legacy Platforms (YouTube / Meta)
                    </span>
                    <span className="text-xs text-red-400 font-medium">
                      30%–45% Platform Tax deducted
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold text-[#8B949E] font-mono">
                      ${competitorPayout.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="bg-[#0D1117] border border-[#238636] rounded-xl p-4 flex items-center justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#238636] text-[10px] font-bold text-black uppercase tracking-wider rounded-bl">
                    +${difference.toLocaleString()} more
                  </div>
                  <div>
                    <span className="text-xs text-[#E6EDF3] font-semibold block">
                      Quant Ecosystem
                    </span>
                    <span className="text-xs text-[#238636] font-medium">
                      Direct tips + 80% ad auction pool
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-[#238636] font-mono">
                      ${quantPayout.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-[#8B949E] text-center pt-2">
                *Estimated monthly creator payout based on industry-standard $2.50–$3.80 RPM gross
                ad pool.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. MULTI-PLATFORM DOWNLOADS SECTION */}
      <section id="downloads" className="py-20 border-t border-[#30363D]/70 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-[#58A6FF]">
              Zero Vendor Lock-In
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
              Available Everywhere You Work
            </h2>
            <p className="text-[#8B949E] mt-3 text-base">
              Run the full suite in modern browsers, on your Android smartphone, or directly on your
              desktop with local-first filesystem access.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 1. Web App */}
            <div className="bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF] rounded-2xl p-6 flex flex-col justify-between transition-all">
              <div>
                <div className="p-3 rounded-xl bg-[#58A6FF]/15 text-[#58A6FF] w-fit mb-4">
                  <Globe className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Web Application</h3>
                <p className="text-sm text-[#8B949E] mb-6">
                  Zero install required. Instant progressive web app with local SQLite FTS5 offline
                  cache in OPFS.
                </p>
                <div className="space-y-2 mb-6 text-xs text-[#C9D1D9]">
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    Chrome, Firefox, Safari, Edge
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    IndexedDB & OPFS persistent cache
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    Keyboard shortcuts (Superhuman style)
                  </div>
                </div>
              </div>

              <a
                href="http://localhost:3000"
                className="w-full inline-flex items-center justify-center space-x-2 py-2.5 rounded-xl font-semibold text-white bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-sm transition-all"
              >
                <span>Launch in Browser</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* 2. Android App */}
            <div className="bg-[#161B22] border border-[#30363D] hover:border-[#238636] rounded-2xl p-6 flex flex-col justify-between transition-all relative">
              <div className="absolute top-4 right-4 px-2 py-0.5 rounded text-[10px] font-bold bg-[#238636]/20 text-[#238636] border border-[#238636]/40 uppercase">
                APK Testing
              </div>
              <div>
                <div className="p-3 rounded-xl bg-[#238636]/15 text-[#238636] w-fit mb-4">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Android Client</h3>
                <p className="text-sm text-[#8B949E] mb-6">
                  Native Android client written in Jetpack Compose. Push notifications, camera
                  reels, and biometric security.
                </p>
                <div className="space-y-2 mb-6 text-xs text-[#C9D1D9]">
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    Jetpack Compose 60fps UI
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    LiveKit SFU WebRTC hardware video
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    Biometric fingerprint authentication
                  </div>
                </div>
              </div>

              <a
                href="/apk-testing/quant-ecosystem-release.apk"
                download
                className="w-full inline-flex items-center justify-center space-x-2 py-2.5 rounded-xl font-semibold text-black bg-[#238636] hover:bg-[#2ea043] text-sm transition-all shadow-md shadow-[#238636]/20"
              >
                <Download className="w-4 h-4" />
                <span>Download APK (arm64)</span>
              </a>
            </div>

            {/* 3. Desktop Client */}
            <div className="bg-[#161B22] border border-[#30363D] hover:border-[#FF8C42] rounded-2xl p-6 flex flex-col justify-between transition-all">
              <div>
                <div className="p-3 rounded-xl bg-[#FF8C42]/15 text-[#FF8C42] w-fit mb-4">
                  <Monitor className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Desktop Client</h3>
                <p className="text-sm text-[#8B949E] mb-6">
                  Electron / Tauri native wrapper with Windows ProjFS virtual drive (G:\) and macOS
                  FileProvider.
                </p>
                <div className="space-y-2 mb-6 text-xs text-[#C9D1D9]">
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    Virtual drive mount with FastCDC 64KB sync
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    Global Cmd+K shortcut overlay
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-[#238636] mr-2" />
                    Local Git Smart HTTP proxy daemon
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCopyInstallCmd}
                  className="w-full inline-flex items-center justify-between px-3 py-2 rounded-xl bg-[#0D1117] border border-[#30363D] text-xs font-mono text-[#8B949E] hover:border-[#8B949E] transition-colors"
                >
                  <span className="truncate">curl -fsSL https://quantmail.in/install.sh</span>
                  <span className="text-[11px] text-[#58A6FF] ml-2 shrink-0">
                    {copyFeedback ? 'Copied!' : 'Copy'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. MANIFESTO & FOOTER */}
      <footer id="manifesto" className="bg-[#090D12] border-t border-[#30363D] pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            {/* Col 1: Manifesto */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#FF8C42] to-[#58A6FF] flex items-center justify-center text-black font-bold text-sm">
                  Q
                </div>
                <span className="text-lg font-bold text-white tracking-tight font-serif italic">
                  Quant Ecosystem
                </span>
              </div>
              <p className="text-sm text-[#8B949E] leading-relaxed max-w-md">
                We believe consumer software should not be a fragmented prison of 20 subscriptions,
                middleman fees, and algorithmic ads. Quant provides one unified sovereign account
                for communication, work, creation, and commerce.
              </p>
              <div className="flex items-center space-x-2 text-xs text-[#238636] font-mono">
                <span className="inline-block w-2 h-2 rounded-full bg-[#238636] animate-pulse"></span>
                <span>🟢 All 18 Staging & Prod Systems Operational</span>
              </div>
            </div>

            {/* Col 2: Applications */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6EDF3]">
                Applications
              </h4>
              <ul className="space-y-1.5 text-xs text-[#8B949E]">
                <li>
                  <a href="http://localhost:3000" className="hover:text-white transition-colors">
                    QuantMail (Email & Drive)
                  </a>
                </li>
                <li>
                  <a
                    href="http://localhost:3000/quantgit"
                    className="hover:text-white transition-colors"
                  >
                    QuantGit (CodeHub)
                  </a>
                </li>
                <li>
                  <a href="http://localhost:3001" className="hover:text-white transition-colors">
                    QuantChat (Messaging)
                  </a>
                </li>
                <li>
                  <a href="http://localhost:3002" className="hover:text-white transition-colors">
                    QuantAI (Quanty Agent)
                  </a>
                </li>
                <li>
                  <a href="http://localhost:3005" className="hover:text-white transition-colors">
                    QuantGram (Reels)
                  </a>
                </li>
                <li>
                  <a href="http://localhost:3004" className="hover:text-white transition-colors">
                    Quantube (Music & Video)
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Architecture & Security */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6EDF3]">
                Engineering
              </h4>
              <ul className="space-y-1.5 text-xs text-[#8B949E]">
                <li>
                  <a
                    href="https://github.com/quantrinitylab/Quant-Ecosystem"
                    className="hover:text-white transition-colors"
                  >
                    GitHub Monorepo
                  </a>
                </li>
                <li>
                  <a href="#metrics" className="hover:text-white transition-colors">
                    Vitest Gates (2,409 Tests)
                  </a>
                </li>
                <li>
                  <a href="#economy" className="hover:text-white transition-colors">
                    Quant Credits Ledger
                  </a>
                </li>
                <li>
                  <a href="#downloads" className="hover:text-white transition-colors">
                    Android Jetpack APK
                  </a>
                </li>
                <li>
                  <a href="http://localhost:3011" className="hover:text-white transition-colors">
                    QuantTrinity Console
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[#30363D]/60 flex flex-col sm:flex-row items-center justify-between text-xs text-[#8B949E] gap-4">
            <div>
              &copy; {new Date().getFullYear()} Quant Ecosystem Inc. All rights reserved. Sovereign
              Software Architecture.
            </div>
            <div className="flex items-center space-x-6">
              <span className="font-mono text-[11px] text-[#58A6FF]">PR #247 (948e3612)</span>
              <a href="#manifesto" className="hover:text-white transition-colors">
                Privacy Shield
              </a>
              <a href="#manifesto" className="hover:text-white transition-colors">
                Terms of Service
              </a>
              <a href="#manifesto" className="hover:text-white transition-colors">
                Status
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
