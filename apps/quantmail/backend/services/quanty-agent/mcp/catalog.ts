// ============================================================================
// Quanty agent — MCP provider catalog (curated, consumer-facing)
// ============================================================================
//
// PURPOSE
//   The curated list of connectors the consumer Connectors screen (Q3) shows.
//   This is NOT the developer MCP directory — entries here are providers
//   Quanty has a production OAuth + tool path for, or honest "coming soon"
//   placeholders for device-source connectors.
//
// RULES
//   * `available: true`  → full OAuth connect flow exists (Q2: gmail only).
//   * `available: false` → shown with an honest "coming soon" label; the UI
//     must never render these as connectable.

export interface McpProviderCatalogEntry {
  id: string;
  name: string;
  /** Short consumer description. */
  description: string;
  category: 'productivity' | 'developer' | 'device' | 'communication';
  /** OAuth provider or device-source. */
  authType: 'oauth' | 'device';
  /** True when the connect flow is production-ready. */
  available: boolean;
  /** OAuth scopes requested (oauth providers only). */
  scopes?: string[];
  /** Tools the agent gains when connected. */
  tools?: string[];
  /** Device-source connectors (no OAuth): Calendar, Contacts, Call Log. */
  deviceSource?: boolean;
}

export const MCP_PROVIDER_CATALOG: McpProviderCatalogEntry[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search, read, archive and send email from your Gmail account.',
    category: 'productivity',
    authType: 'oauth',
    available: true,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    tools: ['mcp.gmail.search', 'mcp.gmail.read', 'mcp.gmail.archive', 'mcp.gmail.send'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repos, pull requests and issues through your GitHub account.',
    category: 'developer',
    authType: 'oauth',
    available: false,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Read and manage events on your Google Calendar.',
    category: 'productivity',
    authType: 'oauth',
    available: false,
  },
  {
    id: 'device-calendar',
    name: 'Calendar',
    description: 'Use the calendar on this device.',
    category: 'device',
    authType: 'device',
    available: false,
    deviceSource: true,
  },
  {
    id: 'device-contacts',
    name: 'Contacts',
    description: 'Use the contacts on this device.',
    category: 'device',
    authType: 'device',
    available: false,
    deviceSource: true,
  },
  {
    id: 'device-call-log',
    name: 'Call Log',
    description: 'Use the call history on this device.',
    category: 'device',
    authType: 'device',
    available: false,
    deviceSource: true,
  },
];

/** Providers with a production OAuth flow (connectable today). */
export function availableProviders(): McpProviderCatalogEntry[] {
  return MCP_PROVIDER_CATALOG.filter((p) => p.available);
}

/** Look up a catalog entry by provider id. */
export function getProvider(id: string): McpProviderCatalogEntry | undefined {
  return MCP_PROVIDER_CATALOG.find((p) => p.id === id);
}
