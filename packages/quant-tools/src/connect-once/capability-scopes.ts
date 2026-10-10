// ============================================================================
// Connect-once capability scopes (P1-2)
//
// Scope vocabulary for the Quant SSO consent screen and for per-call
// authorization in the MCP gateway.
//
// Shape: `<domain>.<access>` where access is `read` (observe data) or `write`
// (create / change / send / delete). Examples: `mail.read`, `calendar.write`.
//
// Derivation rule (`requiredScopesForTool`):
//   1. If the tool id is in TOOL_SCOPE_OVERRIDES, use the override.
//   2. Else if the tool's appId maps to a scope domain:
//        permissionTier >= 2 -> `<domain>.write`
//        permissionTier 0-1   -> `<domain>.read`
//   3. Else (unknown appId, no scope vocabulary): `[]` — the gateway then
//      falls back to the tier gate alone. This is honest: scopes only cover
//      what the vocabulary knows.
//
// The override table exists because tier and mutability do not always line
// up: several tier 0/1 tools mutate user data (e.g. `quantmail.send` is tier
// 1). Without an override, the default rule would grant them under a mere
// `.read` scope — an under-scoping bug. Overrides are seeded ONLY from tool
// ids that actually exist in `packages/quant-tools/src/tools/` (verified via
// grep); nothing is invented.
// ============================================================================

import type { ToolDefinition } from '../types.js';

export interface CapabilityScope {
  /** Canonical scope name, e.g. 'mail.read'. */
  name: string;
  /** Scope domain, e.g. 'mail'. */
  domain: string;
  access: 'read' | 'write';
  /** Short label shown on the consent screen. */
  displayName: string;
  /** One-line plain-language description for the consent screen. */
  description: string;
  /** Honest note about what the grantee can do. */
  riskNote: string;
  /** Write scopes are visually flagged on the consent screen. */
  flagged: boolean;
}

/** appId (as declared on ToolDefinition) -> scope domain. */
const APP_ID_TO_DOMAIN: Record<string, string> = {
  quantmail: 'mail',
  quantcalendar: 'calendar',
  quantdrive: 'drive',
  quantchat: 'chat',
  quantdocs: 'docs',
  quantmeet: 'meet',
  quantneon: 'neon',
  quantube: 'tube',
  quantmax: 'max',
  quantphotos: 'photos',
  quantmaps: 'maps',
  quantsync: 'sync',
  quantedits: 'edits',
  quantads: 'ads',
  'quant-studio': 'studio',
  'quant-payments': 'payments',
  'device-control': 'device',
};

interface DomainCopy {
  domain: string;
  appDisplayName: string;
  readDisplayName: string;
  readDescription: string;
  readRiskNote: string;
  writeDisplayName: string;
  writeDescription: string;
  writeRiskNote: string;
}

// Ordered for the consent screen: the flagship apps first.
const DOMAIN_COPY: DomainCopy[] = [
  {
    domain: 'mail',
    appDisplayName: 'Mail',
    readDisplayName: 'Read your mail',
    readDescription: 'Search and read your email messages.',
    readRiskNote: 'Read-only. Quanty cannot send, delete, or change anything with this scope.',
    writeDisplayName: 'Send and manage your mail',
    writeDescription: 'Send email and organize your mailbox (archive, label, draft).',
    writeRiskNote:
      'Write access. Quanty can send mail as you. Higher-risk actions still ask for your confirmation each time.',
  },
  {
    domain: 'calendar',
    appDisplayName: 'Calendar',
    readDisplayName: 'Read your calendar',
    readDescription: 'See your events and schedule.',
    readRiskNote: 'Read-only. Quanty cannot create or change events with this scope.',
    writeDisplayName: 'Manage your calendar',
    writeDescription: 'Create, reschedule, invite to, and cancel events.',
    writeRiskNote:
      'Write access. Quanty can change your schedule. Cancellations and other higher-risk actions still ask for your confirmation each time.',
  },
  {
    domain: 'drive',
    appDisplayName: 'Drive',
    readDisplayName: 'Read your files',
    readDescription: 'Search, list, and download your files.',
    readRiskNote: 'Read-only. Quanty cannot upload, share, or change files with this scope.',
    writeDisplayName: 'Manage your files',
    writeDescription: 'Upload, organize, and share files.',
    writeRiskNote:
      'Write access. Quanty can add and share your files. Sharing and other higher-risk actions still ask for your confirmation each time.',
  },
  {
    domain: 'chat',
    appDisplayName: 'Chat',
    readDisplayName: 'Read your chats',
    readDescription: 'Search and read your conversations.',
    readRiskNote: 'Read-only. Quanty cannot send messages with this scope.',
    writeDisplayName: 'Send chat messages',
    writeDescription: 'Send messages, react, and manage channels.',
    writeRiskNote:
      'Write access. Quanty can send messages as you. Higher-risk actions still ask for your confirmation each time.',
  },
  {
    domain: 'docs',
    appDisplayName: 'Docs',
    readDisplayName: 'Read your documents',
    readDescription: 'Search, open, and export your documents.',
    readRiskNote: 'Read-only. Quanty cannot create or edit documents with this scope.',
    writeDisplayName: 'Edit your documents',
    writeDescription: 'Create, edit, and share documents.',
    writeRiskNote:
      'Write access. Quanty can change your documents. Sharing and other higher-risk actions still ask for your confirmation each time.',
  },
  {
    domain: 'meet',
    appDisplayName: 'Meet',
    readDisplayName: 'View your meetings',
    readDescription: 'See and join your meetings.',
    readRiskNote: 'Read-only. Quanty cannot schedule or change meetings with this scope.',
    writeDisplayName: 'Manage your meetings',
    writeDescription: 'Schedule, record, and end meetings.',
    writeRiskNote:
      'Write access. Quanty can schedule and record meetings as you. Recording and other higher-risk actions still ask for your confirmation each time.',
  },
  {
    domain: 'neon',
    appDisplayName: 'Neon',
    readDisplayName: 'Read your social feed',
    readDescription: 'Search and read posts.',
    readRiskNote: 'Read-only. Quanty cannot post or interact with this scope.',
    writeDisplayName: 'Post and interact socially',
    writeDescription: 'Post, comment, like, and repost.',
    writeRiskNote:
      'Write access. Quanty can publish as you. Higher-risk actions still ask for your confirmation each time.',
  },
  {
    domain: 'tube',
    appDisplayName: 'Tube',
    readDisplayName: 'Read your channel data',
    readDescription: 'View your uploads and analytics.',
    readRiskNote: 'Read-only. Quanty cannot upload or publish with this scope.',
    writeDisplayName: 'Manage your channel',
    writeDescription: 'Upload, publish, schedule, and moderate videos.',
    writeRiskNote:
      'Write access. Quanty can publish to your channel. Publishing and moderation still ask for your confirmation each time.',
  },
  {
    domain: 'max',
    appDisplayName: 'Max',
    readDisplayName: 'Use AI sessions',
    readDescription: 'Start sessions and get AI explanations.',
    readRiskNote: 'Session access only. No access to your files or messages.',
    writeDisplayName: 'Generate with AI',
    writeDescription: 'Generate content with AI models.',
    writeRiskNote:
      'Lets Quanty generate content on your behalf. Generation costs may apply per your plan.',
  },
  {
    domain: 'photos',
    appDisplayName: 'Photos',
    readDisplayName: 'View your photos',
    readDescription: 'Search and view your photos.',
    readRiskNote: 'Read-only. Quanty cannot upload, edit, or share photos with this scope.',
    writeDisplayName: 'Manage your photos',
    writeDescription: 'Upload, edit, organize, and share photos.',
    writeRiskNote:
      'Write access. Quanty can change and share your photos. Sharing still asks for your confirmation each time.',
  },
  {
    domain: 'maps',
    appDisplayName: 'Maps',
    readDisplayName: 'Use maps',
    readDescription: 'Search places and get directions and distances.',
    readRiskNote: 'Read-only lookup. Your live location is never shared with this scope.',
    writeDisplayName: 'Save and share places',
    writeDescription: 'Save places and share your location.',
    writeRiskNote:
      'Write access. Quanty can share your location with people you choose. Sharing still asks for your confirmation each time.',
  },
  {
    domain: 'sync',
    appDisplayName: 'Sync',
    readDisplayName: 'View sync status',
    readDescription: 'Check what is synced and its status.',
    readRiskNote: 'Read-only. Quanty cannot change sync settings with this scope.',
    writeDisplayName: 'Manage sync',
    writeDescription: 'Sync contacts, files, settings, and resolve conflicts.',
    writeRiskNote:
      'Write access. Quanty can change what syncs across your devices. Conflict resolution still asks for your confirmation each time.',
  },
  {
    domain: 'edits',
    appDisplayName: 'Edits',
    readDisplayName: 'View edit projects',
    readDescription: 'Open your media edit projects.',
    readRiskNote: 'Read-only. Quanty cannot change projects with this scope.',
    writeDisplayName: 'Edit media projects',
    writeDescription: 'Create projects, add tracks, apply effects, render, and export.',
    writeRiskNote:
      'Write access. Quanty can change and render your media projects. Export still asks for your confirmation each time.',
  },
  {
    domain: 'ads',
    appDisplayName: 'Ads',
    readDisplayName: 'View ad analytics',
    readDescription: 'See campaign performance.',
    readRiskNote: 'Read-only. Quanty cannot change campaigns or spend with this scope.',
    writeDisplayName: 'Manage ad campaigns',
    writeDescription: 'Create campaigns, set budgets, target audiences, pause.',
    writeRiskNote:
      'Write access. Quanty can spend your ad budget. Budget changes and campaign launches still ask for your confirmation each time.',
  },
  {
    domain: 'studio',
    appDisplayName: 'Studio',
    readDisplayName: 'View your apps',
    readDescription: 'See your built apps and their status.',
    readRiskNote: 'Read-only. Quanty cannot build or deploy with this scope.',
    writeDisplayName: 'Build and deploy apps',
    writeDescription: 'Create, publish, and deploy apps.',
    writeRiskNote:
      'Write access. Quanty can publish and deploy your apps. Deploys still ask for your confirmation each time.',
  },
  {
    domain: 'payments',
    appDisplayName: 'Payments',
    readDisplayName: 'View your balance',
    readDescription: 'Check your Quant Credits balance.',
    readRiskNote: 'Read-only. Quanty cannot move money with this scope.',
    writeDisplayName: 'Move money',
    writeDescription: 'Send payments, request money, issue invoices and refunds.',
    writeRiskNote:
      'Write access. Quanty can move your money. Every payment still asks for your confirmation each time, plus step-up authentication.',
  },
  {
    domain: 'device',
    appDisplayName: 'Devices',
    readDisplayName: 'View device status',
    readDescription: 'Check the status of your connected devices.',
    readRiskNote: 'Read-only. Quanty cannot control devices with this scope.',
    writeDisplayName: 'Control your devices',
    writeDescription: 'Control, configure, and schedule actions on devices.',
    writeRiskNote:
      'Write access. Quanty can operate your devices, including emergency actions. Device control still asks for your confirmation each time.',
  },
];

/** Ordered scope list for the consent screen (read then write per domain). */
export const SCOPE_CATALOG: CapabilityScope[] = DOMAIN_COPY.flatMap((d) => [
  {
    name: `${d.domain}.read`,
    domain: d.domain,
    access: 'read' as const,
    displayName: `${d.appDisplayName} — ${d.readDisplayName}`,
    description: d.readDescription,
    riskNote: d.readRiskNote,
    flagged: false,
  },
  {
    name: `${d.domain}.write`,
    domain: d.domain,
    access: 'write' as const,
    displayName: `${d.appDisplayName} — ${d.writeDisplayName}`,
    description: d.writeDescription,
    riskNote: d.writeRiskNote,
    flagged: true,
  },
]);

const SCOPE_BY_NAME: Record<string, CapabilityScope> = Object.fromEntries(
  SCOPE_CATALOG.map((s) => [s.name, s]),
);

/** True when `name` is a known capability scope. */
export function isKnownScope(name: string): boolean {
  return name in SCOPE_BY_NAME;
}

/** Look up a scope's consent-screen metadata; undefined for unknown scopes. */
export function scopeInfo(name: string): CapabilityScope | undefined {
  return SCOPE_BY_NAME[name];
}

/** Scope domain for a tool appId; undefined when the vocabulary has no domain. */
export function scopeDomainForAppId(appId: string): string | undefined {
  return APP_ID_TO_DOMAIN[appId];
}

// ---------------------------------------------------------------------------
// Per-tool overrides: tier 0/1 tools that mutate user data must require the
// `.write` scope even though the default derivation rule would give them
// `.read`. Every id below exists in packages/quant-tools/src/tools/.
// ---------------------------------------------------------------------------

const TOOL_SCOPE_OVERRIDES: Record<string, string[]> = {
  // mail: send/archive/label/draft are tier 0-1 but mutate the mailbox
  'quantmail.send': ['mail.write'],
  'quantmail.archive': ['mail.write'],
  'quantmail.label': ['mail.write'],
  'quantmail.draft': ['mail.write'],
  // calendar: tier-1 mutations
  'quantcalendar.create-event': ['calendar.write'],
  'quantcalendar.reschedule': ['calendar.write'],
  'quantcalendar.invite': ['calendar.write'],
  // chat: tier 0/1 sends and channel management
  'quantchat.send': ['chat.write'],
  'quantchat.create-channel': ['chat.write'],
  'quantchat.react': ['chat.write'],
  'quantchat.pin': ['chat.write'],
  // docs: tier 0/1 creates, edits, shares
  'quantdocs.create': ['docs.write'],
  'quantdocs.edit': ['docs.write'],
  'quantdocs.share': ['docs.write'],
  // drive: tier-1 uploads, shares, organizing
  'quantdrive.upload': ['drive.write'],
  'quantdrive.share': ['drive.write'],
  'quantdrive.organize': ['drive.write'],
  // edits: tier 0/1 project mutations
  'quantedits.create-project': ['edits.write'],
  'quantedits.render': ['edits.write'],
  'quantedits.add-track': ['edits.write'],
  'quantedits.export': ['edits.write'],
  'quantedits.apply-effect': ['edits.write'],
  // maps: saving a place is a write
  'quantmaps.save-place': ['maps.write'],
  // meet: tier-1 scheduling
  'quantmeet.create': ['meet.write'],
  'quantmeet.schedule': ['meet.write'],
  // neon: tier 0/1 social writes
  'quantneon.post': ['neon.write'],
  'quantneon.like': ['neon.write'],
  'quantneon.comment': ['neon.write'],
  'quantneon.repost': ['neon.write'],
  // photos: tier 0/1 uploads, edits, organizing, shares
  'quantphotos.upload': ['photos.write'],
  'quantphotos.organize': ['photos.write'],
  'quantphotos.edit': ['photos.write'],
  'quantphotos.share': ['photos.write'],
  // studio: tier-1 app creation
  'quant-studio.create-app': ['studio.write'],
  // sync: tier 0/1 sync mutations
  'quantsync.sync-contacts': ['sync.write'],
  'quantsync.sync-files': ['sync.write'],
  'quantsync.sync-settings': ['sync.write'],
  // tube: tier-1 uploads, publishes, schedules
  'quantube.upload': ['tube.write'],
  'quantube.publish': ['tube.write'],
  'quantube.schedule': ['tube.write'],
};

/**
 * The capability scopes a tool call requires. Used by the MCP gateway after
 * the permission-tier check: when the caller's auth context carries scopes,
 * every required scope must be granted or the call is denied.
 *
 * Returns `[]` for tools whose appId has no scope domain — the gateway then
 * enforces the tier gate alone (documented fallback, not a silent grant).
 */
export function requiredScopesForTool(tool: ToolDefinition): string[] {
  const override = TOOL_SCOPE_OVERRIDES[tool.id];
  if (override) {
    return [...override];
  }
  const domain = APP_ID_TO_DOMAIN[tool.appId];
  if (!domain) {
    return [];
  }
  return [tool.permissionTier >= 2 ? `${domain}.write` : `${domain}.read`];
}

/** All scope names, in consent-screen order. */
export function allScopeNames(): string[] {
  return SCOPE_CATALOG.map((s) => s.name);
}
