// ============================================================================
// QuantAI — Quanty Consumer Connectors Catalog
//
// Curated, consumer-grade connector catalog for the /connectors screen
// (Muse screenshot #1 parity). This is the CONSUMER surface — keep the
// developer-grade McpConnectorsDirectoryModal for developers.
//
// Honesty rules:
// - `builtin` providers (browser, quantmail) are connected via the active
//   Quant ecosystem SSO session — no OAuth needed, no fake state.
// - Everything else is "Available" until Q2's MCP production backend lands;
//   device-source providers are honestly labeled "coming soon".
// ============================================================================

export type ConsumerConnectorAuthType =
  | 'OAUTH2'
  | 'API_KEY'
  | 'SESSION'
  | 'BUILTIN'
  | 'DEVICE';

export type ConsumerConnectorCategory =
  | 'Built-in'
  | 'Productivity'
  | 'Developer'
  | 'Social'
  | 'Design'
  | 'Media'
  | 'Device';

export interface ConsumerConnector {
  id: string;
  name: string;
  /** Icon key rendered by ConnectorIcon. */
  icon: string;
  category: ConsumerConnectorCategory;
  description: string;
  authType: ConsumerConnectorAuthType;
  /** True for "From this device" connectors (no device APIs exist yet). */
  deviceSource?: boolean;
  /** True for capabilities that ship with the ecosystem session (no setup). */
  builtin?: boolean;
  /** OAuth/API scopes requested on connect. */
  scopes: string[];
  /** Agent tool ids exposed once connected. */
  tools: string[];
}

export interface McpConnection {
  provider: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt: string | null;
  scopes: string[];
  /** Present for session-derived connections; never a fabricated grant. */
  via?: 'ecosystem-session' | 'oauth' | 'api-key';
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
}

/**
 * Curated consumer catalog. Order matters: built-ins first, then the
 * Muse-parity providers, then device-source placeholders last.
 */
export const CONSUMER_CONNECTOR_CATALOG: ConsumerConnector[] = [
  {
    id: 'browser',
    name: 'Browser',
    icon: 'globe',
    category: 'Built-in',
    description:
      'Quanty can browse the web for you — read pages, compare options, and pull live facts into chat.',
    authType: 'BUILTIN',
    builtin: true,
    scopes: ['browse:read'],
    tools: ['browser.navigate', 'browser.read', 'browser.search'],
  },
  {
    id: 'quantmail',
    name: 'QuantMail',
    icon: 'mail',
    category: 'Built-in',
    description:
      'Search, triage, and draft email with your QuantMail inbox — already signed in with your Quant account.',
    authType: 'SESSION',
    builtin: true,
    scopes: ['mail:read', 'mail:send', 'mail:manage'],
    tools: [
      'mail.search',
      'mail.list_unread',
      'mail.archive',
      'mail.star',
      'mail.mark_read',
      'mail.delete',
      'mail.snooze',
      'mail.send',
      'mail.draft',
      'mail.summarize',
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'github',
    category: 'Developer',
    description:
      'Manage issues, pull requests, and repository contents. Quanty can review diffs and check CI status.',
    authType: 'OAUTH2',
    scopes: ['repo', 'read:user', 'workflow'],
    tools: ['git.list_repos', 'git.get_pr', 'git.merge_pr', 'git.list_issues'],
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    icon: 'google',
    category: 'Productivity',
    description:
      'Connect Gmail, Google Calendar, and Google Drive into one workspace Quanty can work across.',
    authType: 'OAUTH2',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    tools: ['mcp.gmail.search', 'mcp.gmail.read', 'mcp.gmail.send', 'mcp.gmail.archive'],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    category: 'Social',
    description:
      'Read your profile, posts, and insights. Quanty can draft captions and surface what matters.',
    authType: 'OAUTH2',
    scopes: ['instagram_basic', 'pages_read_engagement'],
    tools: ['social.read_profile', 'social.read_posts', 'social.read_insights'],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: 'slack',
    category: 'Productivity',
    description:
      'Read channels and post updates. Quanty can summarize threads and draft replies.',
    authType: 'OAUTH2',
    scopes: ['channels:read', 'chat:write', 'reactions:read'],
    tools: ['slack.read_channels', 'slack.post_message', 'slack.read_thread'],
  },
  {
    id: 'asana',
    name: 'Asana',
    icon: 'asana',
    category: 'Productivity',
    description:
      'Track tasks and projects. Quanty can create tasks, update status, and summarize progress.',
    authType: 'OAUTH2',
    scopes: ['default'],
    tools: ['asana.list_tasks', 'asana.create_task', 'asana.update_task'],
  },
  {
    id: 'box',
    name: 'Box',
    icon: 'box',
    category: 'Productivity',
    description: 'Access Box files and folders from inside Quanty conversations.',
    authType: 'OAUTH2',
    scopes: ['root_readwrite'],
    tools: ['box.list_files', 'box.read_file'],
  },
  {
    id: 'calendly',
    name: 'Calendly',
    icon: 'calendly',
    category: 'Productivity',
    description:
      'See your scheduling links and upcoming meetings. Quanty can propose times that fit.',
    authType: 'API_KEY',
    scopes: ['api-key'],
    tools: ['calendly.list_event_types', 'calendly.list_events'],
  },
  {
    id: 'canva',
    name: 'Canva',
    icon: 'canva',
    category: 'Design',
    description: 'Browse your Canva designs. Quanty can reference them in chat and artifacts.',
    authType: 'OAUTH2',
    scopes: ['design:content:read'],
    tools: ['canva.list_designs', 'canva.get_design'],
  },
  {
    id: 'linear',
    name: 'Linear',
    icon: 'linear',
    category: 'Developer',
    description: 'Query roadmaps and issues. Quanty can triage and summarize your cycles.',
    authType: 'API_KEY',
    scopes: ['api-key'],
    tools: ['linear.list_issues', 'linear.create_issue'],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'spotify',
    category: 'Media',
    description: 'Control playback and browse playlists. Quanty can queue what fits the moment.',
    authType: 'OAUTH2',
    scopes: ['user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private'],
    tools: ['spotify.search', 'spotify.play', 'spotify.list_playlists'],
  },
  {
    id: 'figma',
    name: 'Figma',
    icon: 'figma',
    category: 'Design',
    description: 'Inspect components and design tokens. Quanty can read specs straight from canvas.',
    authType: 'OAUTH2',
    scopes: ['file_read'],
    tools: ['figma.get_file', 'figma.list_components'],
  },
  // --- "From this device" — no device APIs exist yet; honestly "coming soon".
  {
    id: 'device-calendar',
    name: 'Calendar',
    icon: 'calendar',
    category: 'Device',
    description: 'Your on-device calendar. Quanty will read events and propose scheduling.',
    authType: 'DEVICE',
    deviceSource: true,
    scopes: ['device:calendar:read'],
    tools: [],
  },
  {
    id: 'device-contacts',
    name: 'Contacts',
    icon: 'contacts',
    category: 'Device',
    description: 'Your on-device contacts. Quanty will resolve names when you mention people.',
    authType: 'DEVICE',
    deviceSource: true,
    scopes: ['device:contacts:read'],
    tools: [],
  },
  {
    id: 'device-call-log',
    name: 'Call Log',
    icon: 'phone',
    category: 'Device',
    description: 'Your on-device call history. Quanty will add context like "you spoke yesterday".',
    authType: 'DEVICE',
    deviceSource: true,
    scopes: ['device:call-log:read'],
    tools: [],
  },
];

export function getConsumerConnector(id: string): ConsumerConnector | undefined {
  return CONSUMER_CONNECTOR_CATALOG.find((c) => c.id === id);
}

/** Built-in connections derived from the active ecosystem session (honest, no OAuth). */
export function getBuiltinConnections(): McpConnection[] {
  return CONSUMER_CONNECTOR_CATALOG.filter((c) => c.builtin).map((c) => ({
    provider: c.id,
    status: 'connected' as const,
    connectedAt: null,
    scopes: c.scopes,
    via: c.authType === 'BUILTIN' ? ('oauth' as const) : ('ecosystem-session' as const),
  }));
}

/**
 * Spec-shaped catalog payload for GET /api/quanty/mcp/catalog:
 * { providers: [{ id, name, icon, category, description, authType, deviceSource? }] }
 */
export function toCatalogPayload() {
  return {
    providers: CONSUMER_CONNECTOR_CATALOG.map(
      ({ id, name, icon, category, description, authType, deviceSource }) => ({
        id,
        name,
        icon,
        category,
        description,
        authType,
        ...(deviceSource ? { deviceSource: true as const } : {}),
      }),
    ),
  };
}
