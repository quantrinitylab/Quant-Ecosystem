// ============================================================================
// Quant Ecosystem - 10 Core Apps Catalog & Ecosystem Constants
// ============================================================================

import type { QuantAppDescriptor, CoreQuantAppId } from './types';

export const QUANT_ROOT_DOMAIN = 'quantrinity.in';
export const QUANT_MAIL_DOMAIN = 'quantmail.in';

export const CORE_QUANT_APPS: Record<CoreQuantAppId, QuantAppDescriptor> = {
  quantmail: {
    id: 'quantmail',
    name: 'QuantMail',
    tagline: 'Intelligent AI-First Email & Messaging Fabric',
    description: 'Autonomous email triage, AI drafting, zero-inbox sync, and encrypted threads.',
    category: 'social_communication',
    accentColor: '#3B82F6', // Blue
    icon: 'mail',
    defaultPort: 3000,
    subdomain: 'mail',
    productionUrl: 'https://quantmail.in',
    defaultRoute: '/inbox',
    status: 'active',
  },
  quantchat: {
    id: 'quantchat',
    name: 'QuantChat',
    tagline: 'Real-Time High-Concurrency Messaging & Audio Rooms',
    description:
      'Sub-millisecond messaging, E2EE channels, rich media canvas, and live voice notes.',
    category: 'social_communication',
    accentColor: '#10B981', // Emerald
    icon: 'message-square',
    defaultPort: 3001,
    subdomain: 'chat',
    productionUrl: 'https://quantchat.quantrinity.in',
    defaultRoute: '/dms',
    status: 'active',
  },
  quantgram: {
    id: 'quantgram',
    name: 'QuantGram',
    tagline: 'Visual Social Stream & Immersive Reels Studio',
    description: 'Creator visual feeds, vertical reels, AI filter effects, and viral remixing.',
    category: 'social_communication',
    accentColor: '#EC4899', // Pink
    icon: 'camera',
    defaultPort: 3002,
    subdomain: 'gram',
    productionUrl: 'https://quantgram.quantrinity.in',
    defaultRoute: '/feed',
    status: 'active',
  },
  quantai: {
    id: 'quantai',
    name: 'QuantAI',
    tagline: 'Autonomous Intelligence & Generative Work Canvas',
    description:
      'Multi-modal LLM reasoning, code synthesis, media generation, and autonomous agents.',
    category: 'creative_intelligence',
    accentColor: '#8B5CF6', // Purple
    icon: 'sparkles',
    defaultPort: 3003,
    subdomain: 'ai',
    productionUrl: 'https://quantai.quantrinity.in',
    defaultRoute: '/canvas',
    status: 'active',
  },
  quantube: {
    id: 'quantube',
    name: 'Quantube',
    tagline: 'Next-Gen Video Streaming, Shorts & Creator Hub',
    description:
      '4K adaptive streaming, AI timestamps, smart chapters, and interactive watch parties.',
    category: 'creative_intelligence',
    accentColor: '#EF4444', // Red
    icon: 'video',
    defaultPort: 3004,
    subdomain: 'tube',
    productionUrl: 'https://quantube.quantrinity.in',
    defaultRoute: '/watch',
    status: 'active',
  },
  quantwave: {
    id: 'quantwave',
    name: 'QuantWave',
    tagline: 'Spatial Audio, Podcasts & Live Broadcasting',
    description:
      'Ultra-low latency audio stages, AI podcast transcription, music curation, and voice drop-ins.',
    category: 'social_communication',
    accentColor: '#06B6D4', // Cyan
    icon: 'radio',
    defaultPort: 3005,
    subdomain: 'wave',
    productionUrl: 'https://quantwave.quantrinity.in',
    defaultRoute: '/explore',
    status: 'active',
  },
  quantmax: {
    id: 'quantmax',
    name: 'QuantMax',
    tagline: 'Enterprise Workspace, Hyper-Sheets & Mission Control',
    description:
      'Multi-dimensional relational databases, enterprise BI, project matrices, and Gantt tracking.',
    category: 'enterprise_productivity',
    accentColor: '#F59E0B', // Amber
    icon: 'table',
    defaultPort: 3006,
    subdomain: 'max',
    productionUrl: 'https://quantmax.quantrinity.in',
    defaultRoute: '/workspaces',
    status: 'active',
  },
  quantcooks: {
    id: 'quantcooks',
    name: 'QuantCooks',
    tagline: 'Smart Culinary Intelligence & Recipe Social Graph',
    description:
      'Pantry inventory tracking, AI recipe generation, macro nutrition, and culinary creator streams.',
    category: 'creative_intelligence',
    accentColor: '#F97316', // Orange
    icon: 'utensils',
    defaultPort: 3007,
    subdomain: 'cooks',
    productionUrl: 'https://quantcooks.quantrinity.in',
    defaultRoute: '/kitchen',
    status: 'active',
  },
  quantads: {
    id: 'quantads',
    name: 'QuantAds',
    tagline: 'Privacy-Preserving Ad Exchange & ROI Analytics',
    description:
      'Zero-knowledge targeting, real-time bidding, creator sponsorship monetization, and campaign attribution.',
    category: 'enterprise_productivity',
    accentColor: '#14B8A6', // Teal
    icon: 'bar-chart-3',
    defaultPort: 3008,
    subdomain: 'ads',
    productionUrl: 'https://quantads.quantrinity.in',
    defaultRoute: '/campaigns',
    status: 'active',
  },
  quanttrinity: {
    id: 'quanttrinity',
    name: 'QuantTrinity',
    tagline: 'Zero-Trust Security, Vault & Decentralized Identity',
    description:
      'Cryptographic DID management, quantum-safe credentials, audit immutability, and enterprise RBAC.',
    category: 'enterprise_productivity',
    accentColor: '#6366F1', // Indigo
    icon: 'shield-check',
    defaultPort: 3009,
    subdomain: 'trinity',
    productionUrl: 'https://quanttrinity.quantrinity.in',
    defaultRoute: '/vault',
    status: 'active',
  },
};

/**
 * Authorized Sibling Domains for Seamless SSO Propagation
 */
export const SIBLING_SSO_DOMAINS = [
  'https://quantchat.quantrinity.in',
  'https://quantube.quantrinity.in',
  'https://quantmax.quantrinity.in',
  'https://quantgram.quantrinity.in',
  'https://quantai.quantrinity.in',
  'https://quantwave.quantrinity.in',
  'https://quantcooks.quantrinity.in',
  'https://quantads.quantrinity.in',
  'https://quanttrinity.quantrinity.in',
] as const;

/**
 * Ecosystem Safe Domain Allowlist Patterns
 */
export const SAFE_DOMAIN_PATTERNS: RegExp[] = [
  // Production Quant domains and subdomains
  /^https:\/\/([a-z0-9-]+\.)?quantmail\.in(:\d+)?(\/.*)?$/i,
  /^https:\/\/([a-z0-9-]+\.)?quantt?rinity\.in(:\d+)?(\/.*)?$/i,
  /^https:\/\/([a-z0-9-]+\.)?quant\.network(:\d+)?(\/.*)?$/i,
  // Local development ports (3000 to 3015, Vite 5173/4173, etc.)
  /^http:\/\/localhost(:\d+)?(\/.*)?$/i,
  // 127.0.0.1 equivalents
  /^http:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/i,
];

export const CATEGORY_LABELS: Record<string, string> = {
  social_communication: 'Communication & Social',
  creative_intelligence: 'Creative & AI Studio',
  enterprise_productivity: 'Enterprise & Infrastructure',
};
