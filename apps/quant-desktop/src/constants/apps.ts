import type { QuantAppDefinition } from '../types';

export const QUANT_SOVEREIGN_APPS: QuantAppDefinition[] = [
  {
    id: 'quantmail',
    name: 'QuantMail',
    tagline: 'Ultra-fast Sovereign Webmail',
    defaultPort: 3000,
    route: '/mail',
    icon: '✉️',
    accentColor: '#3b82f6', // Sapphire blue
    badge: 'FTS5 Sub-5ms',
    description: 'Sub-5ms FTS5 search, RFC 5322 MIME engine, zero-suppression sovereign email.',
    features: ['Split Inboxes', 'Sub-5ms FTS5 Search', 'Offline Index', 'Cryptographic Undo Send'],
  },
  {
    id: 'codehub',
    name: 'CodeHub',
    tagline: 'Sovereign Git SCM & CI Platform',
    defaultPort: 3006,
    route: '/code',
    icon: '🐙',
    accentColor: '#10b981', // Emerald green
    badge: 'Smart HTTP',
    description: 'Smart HTTP streaming, real git tree inspector, and native 3-way PR merge engine.',
    features: ['Smart HTTP Protocol', 'Native Git Trees', 'Live Diff View', 'Actions CI Pipeline'],
  },
  {
    id: 'quantdrive',
    name: 'QuantDrive',
    tagline: 'FastCDC 64KB CAS Cloud Storage',
    defaultPort: 3004,
    route: '/drive',
    icon: '📁',
    accentColor: '#f59e0b', // Amber gold
    badge: 'ProjFS G:\\ Active',
    description:
      'Zero-byte offline placeholders, FastCDC 64KB Gear CAS deduplication, and ProjFS mounting.',
    features: [
      'ProjFS Windows G:\\',
      'FastCDC 64KB Chunking',
      'Content Addressable Storage',
      'L1/L2 LRU Caching',
    ],
  },
  {
    id: 'quantchat',
    name: 'QuantChat',
    tagline: 'Realtime E2EE Secure Messaging',
    defaultPort: 3002,
    route: '/chat',
    icon: '💬',
    accentColor: '#8b5cf6', // Violet
    badge: 'Double Ratchet',
    description:
      'Real-time WebSockets, Double-Ratchet E2EE crypto, and sovereign channel federation.',
    features: ['End-to-End Encryption', 'Disappearing Snaps', 'Voice Notes', 'Read Receipts'],
  },
  {
    id: 'quantube',
    name: 'QuanTube',
    tagline: 'Sovereign Media & Streaming',
    defaultPort: 3005,
    route: '/tube',
    icon: '▶️',
    accentColor: '#ef4444', // Crimson red
    badge: '4K HLS',
    description:
      'High-performance segmented video delivery, 9:16 reels, and unauthenticated public feed.',
    features: [
      'Adaptive HLS Streaming',
      '9:16 Shorts Engine',
      'Zero Tracking Feeds',
      'Audio Background Play',
    ],
  },
  {
    id: 'quantai',
    name: 'QuantAI',
    tagline: 'Autonomous Swarm & Local ONNX OS',
    defaultPort: 3001,
    route: '/ai',
    icon: '🧠',
    accentColor: '#06b6d4', // Cyan
    badge: '15-Agent Swarm',
    description:
      'Tripartite autonomous agent orchestration, local ONNX runtime, and deep episodic memory.',
    features: [
      'Tripartite Swarm Orchestrator',
      'Local ONNX Inference',
      'Episodic Memory Graph',
      'Real-time Tool Dispatch',
    ],
  },
];
