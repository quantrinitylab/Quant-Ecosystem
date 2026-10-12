// ============================================================================
// QuantAI — Ecosystem Plugins & MCP Connectors Directory Service
//
// Manages the ecosystem and third-party connector directory: QuantMail,
// QuantDrive, QuantGit, GitHub, Google Workspace, Slack, Supabase, Stripe,
// Spotify, Figma, PostgreSQL, Linear.
// Handles configuration validation, credential masking, per-user installations,
// and connection checks.
//
// Honesty contract (F-183): this service NEVER fabricates health data. A
// connection result is only marked verified when an actual network probe ran
// (measured latency, observed facts only). Connectors without a configured
// probe report an explicit not-verified state — never a hardcoded success.
// `supportedTools` lists only tools with real executors wired in this lane;
// anything else is `plannedTools` (roadmap preview, clearly marked).
// ============================================================================

import { createAppError } from '@quant/server-core';

export type McpConnectorCategory =
  | 'Productivity'
  | 'Developer Tools'
  | 'Databases'
  | 'Design'
  | 'Media';

export type McpRequiredAuth = 'API_KEY' | 'OAUTH2' | 'SESSION_COOKIE';

export type McpAuthor = 'Official' | 'Community';

export type McpAuthStatus = 'CONFIGURED' | 'PENDING' | 'NOT_INSTALLED';

/**
 * Whether a connector's tools can actually execute in this build.
 * - 'live': at least one advertised tool has a real executor wired in the lane.
 * - 'planned': roadmap preview — no tool executors are wired yet.
 */
export type McpConnectorAvailability = 'live' | 'planned';

export interface McpConnectorConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  description?: string;
  defaultValue?: string;
}

export interface McpConnectorCatalogItem {
  id: string;
  name: string;
  category: McpConnectorCategory;
  icon: string;
  description: string;
  toolCount: number;
  requiredAuth: McpRequiredAuth;
  author: McpAuthor;
  availability: McpConnectorAvailability;
  version: string;
  verified: boolean;
  homepage?: string;
  /**
   * Tools with real executors wired in this lane (dot-namespaced, e.g.
   * 'quantmail.search'). The directory must never advertise a tool here that
   * cannot run — see F-183.
   */
  supportedTools: string[];
  /**
   * Aspirational tool names for 'planned' connectors. Roadmap preview only —
   * never presented as runnable.
   */
  plannedTools?: string[];
  configFields: McpConnectorConfigField[];
}

export interface McpConnector extends McpConnectorCatalogItem {
  isInstalled: boolean;
  installedAt: string | null;
  updatedAt: string | null;
  authStatus: McpAuthStatus;
  maskedConfig: Record<string, string>;
  lastTestedAt: string | null;
  lastTestStatus: 'SUCCESS' | 'FAILED' | null;
}

export interface McpUserInstallation {
  userId: string;
  connectorId: string;
  config: Record<string, unknown>;
  installedAt: string;
  updatedAt: string;
  authStatus: McpAuthStatus;
  lastTestedAt: string | null;
  lastTestStatus: 'SUCCESS' | 'FAILED' | null;
}

export interface McpTestResult {
  success: boolean;
  /**
   * True only when an actual network probe ran. False means the result rests
   * on local config-format checks alone (or on no check at all) — the
   * connection state is unknown, never assume it works. F-183.
   */
  verified: boolean;
  /**
   * Machine-readable outcome for HTTP mapping and UI branching:
   * - 'ok': verified working
   * - 'failed': a live check ran and the connector failed it
   * - 'invalid': the request/config itself was invalid (client error)
   * - 'unknown': valid config, but no live verification was possible
   */
  outcome: 'ok' | 'failed' | 'invalid' | 'unknown';
  /** Measured round-trip / validation time in ms. 0 when nothing was measured. */
  latencyMs: number;
  message: string;
  /** Observed facts only (HTTP status, host). Never invented metadata. */
  serverInfo?: Record<string, unknown>;
}

/** What a live probe actually establishes. */
export type McpProbeKind = 'reachability' | 'auth';

export interface McpHttpProbe {
  /** Absolute URL to probe. */
  url: string;
  method: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  /** Abort the probe after this many ms; a timeout is reported honestly. */
  timeoutMs: number;
  kind: McpProbeKind;
}

/**
 * SSRF guard for connector probe URLs (CodeQL js/request-forgery).
 *
 * Probe URLs come from connector config (`endpointUrl`), which is
 * administrator-supplied but still remote input reaching a server-side
 * `fetch()`. This validator is the security boundary: a probe only runs
 * against a URL that is unambiguously a public http(s) endpoint.
 *
 * Blocked: non-http(s) schemes, loopback/private/link-local/reserved IP
 * literals (IPv4 + IPv6), cloud metadata hosts, unparseable ports.
 * Public hostnames (including unresolved test domains) are allowed — DNS
 * rebinding is out of scope for a reachability probe with an 8s timeout.
 */
export function isProbeUrlAllowed(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host === 'metadata.google' ||
    host === 'instance-data' ||
    host.endsWith('.metadata.google.internal')
  ) {
    return false;
  }
  if (isBlockedProbeIpLiteral(host)) {
    return false;
  }
  if (parsed.port !== '' && !/^\d+$/.test(parsed.port)) {
    return false;
  }
  return true;
}

/** True when the hostname is an IP literal in a non-public range. */
function isBlockedProbeIpLiteral(host: string): boolean {
  const h =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const low = h.toLowerCase();
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1): judge the trailing quad.
  const v4 = low.includes('.') ? low.slice(low.lastIndexOf(':') + 1) : null;
  const quad = v4 ?? (/^\d{1,3}(\.\d{1,3}){3}$/.test(low) ? low : null);
  if (quad) {
    const octets = quad.split('.').map(Number);
    if (octets.some((n) => !Number.isInteger(n) || n > 255)) {
      return false; // Not a real literal; treat as hostname.
    }
    const [a, b] = octets;
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10/8
      a === 127 || // 127/8 loopback
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      (a === 169 && b === 254) // 169.254/16 link-local + metadata
    );
  }
  if (low.includes(':')) {
    if (low === '::1') return true; // IPv6 loopback
    // IPv4-mapped IPv6 (::ffff:a.b.c.d): Node normalizes the tail to hex,
    // so reconstruct the embedded IPv4 and judge it by the IPv4 ranges.
    if (low.startsWith('::ffff:')) {
      const tail = low.slice('::ffff:'.length).split(':');
      const last32 = tail.slice(-2);
      if (last32.length === 2 && last32.every((p) => /^[0-9a-f]{1,4}$/.test(p))) {
        const n =
          (parseInt(last32[0], 16) << 16) | parseInt(last32[1], 16);
        const a = (n >>> 24) & 0xff;
        const b = (n >>> 16) & 0xff;
        return (
          a === 0 ||
          a === 10 ||
          a === 127 ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) ||
          (a === 169 && b === 254)
        );
      }
      return false;
    }
    const first = low.split(':')[0];
    if (/^fe[89ab][0-9a-f]$/.test(first)) return true; // fe80::/10 link-local
    if (/^f[cd][0-9a-f]{2}$/.test(first)) return true; // fc00::/7 unique-local
  }
  return false;
}

export type CustomProberFn = (
  connectorId: string,
  config: Record<string, unknown>,
  // Probers only need to report success/message; verified/outcome/latencyMs
  // are normalized by testConnection when omitted.
) => Promise<
  Pick<McpTestResult, 'success' | 'message'> & Partial<Omit<McpTestResult, 'success' | 'message'>>
>;

export const MCP_CONNECTOR_CATALOG: McpConnectorCatalogItem[] = [

  {
    id: 'quantmail',
    name: 'QuantMail',
    category: 'Productivity',
    icon: 'mail',
    description:
      'Unified enterprise email: search threads, list unread, fetch messages, send mail, manage drafts, and archive — wired to the lane\'s real QuantMail tool executors. Labeling is planned (backend endpoint exists; tool schema needs name→id resolution + a wired executor first).',
    toolCount: 6,
    requiredAuth: 'SESSION_COOKIE',
    author: 'Official',
    availability: 'live',
    version: '2.4.0',
    verified: true,
    homepage: 'https://mail.quantrinity.in',
    supportedTools: [
      'quantmail.search',
      'quantmail.listUnread',
      'quantmail.getMessage',
      'quantmail.archive',
      'quantmail.draft',
      'quantmail.send',
    ],
    // F-190: 'quantmail.label' has a real tool definition but no executor is
    // registered for it yet — the QuantMail backend's POST /labels/apply
    // exists (emailId + labelId) but the tool schema takes a label NAME, so
    // it needs name->id resolution + a real handler before it can be a live
    // skill. Roadmap preview until then.
    plannedTools: ['quantmail.label'],
    configFields: [
      {
        key: 'sessionCookie',
        label: 'Session Token / Cookie',
        type: 'password',
        required: true,
        placeholder: 'quant_sess_...',
        description: 'Quant Ecosystem SSO active session authentication token',
      },
      {
        key: 'endpointUrl',
        label: 'QuantMail Endpoint URL',
        type: 'url',
        required: false,
        defaultValue: 'https://mail.quantrinity.in',
        placeholder: 'https://mail.quantrinity.in',
        description: 'Custom self-hosted or staging QuantMail backend endpoint',
      },
    ],
  },
  {
    id: 'quantdrive',
    name: 'QuantDrive',
    category: 'Productivity',
    icon: 'folder',
    description:
      'Sovereign cloud storage: upload files — wired to a real gateway handler (backend deploy pending; live probe reports reachability honestly). Download, share, organize, and search are planned (no executors yet).',
    toolCount: 1,
    requiredAuth: 'SESSION_COOKIE',
    author: 'Official',
    availability: 'live',
    version: '2.4.0',
    verified: true,
    homepage: 'https://drive.quantrinity.in',
    supportedTools: [
      'quantdrive.upload',
    ],
    // F-190: download/share/organize/search have real tool definitions but no
    // executors and no deployed backend — roadmap preview, not live skills.
    plannedTools: [
      'quantdrive.download',
      'quantdrive.share',
      'quantdrive.organize',
      'quantdrive.search',
    ],
    configFields: [
      {
        key: 'sessionCookie',
        label: 'Session Token / Cookie',
        type: 'password',
        required: true,
        placeholder: 'quant_sess_...',
        description: 'Quant Ecosystem SSO active session authentication token',
      },
      {
        key: 'endpointUrl',
        label: 'QuantDrive Endpoint URL',
        type: 'url',
        required: false,
        defaultValue: 'https://drive.quantrinity.in',
        placeholder: 'https://drive.quantrinity.in',
        description: 'Custom self-hosted or staging QuantDrive backend endpoint',
      },
    ],
  },
  {
    id: 'quantgit',
    name: 'QuantGit',
    category: 'Developer Tools',
    icon: 'git-branch',
    description:
      'Sovereign GitHub alternative: smart HTTP git tree exploration, 3-way PR merge conflict resolution, CI actions streamer, and issue tracker. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '2.4.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://git.quantrinity.in',
    supportedTools: [],
    plannedTools: [
      'quantgit_list_repos',
      'quantgit_get_repo',
      'quantgit_get_tree',
      'quantgit_get_file_contents',
      'quantgit_create_branch',
      'quantgit_create_commit',
      'quantgit_create_pr',
      'quantgit_get_pr_diff',
      'quantgit_merge_pr',
      'quantgit_list_issues',
      'quantgit_create_issue',
      'quantgit_list_workflows',
      'quantgit_trigger_workflow',
      'quantgit_get_actions_logs',
      'quantgit_list_tags',
      'quantgit_create_tag',
      'quantgit_fork_repo',
      'quantgit_star_repo',
      'quantgit_list_collaborators',
      'quantgit_add_collaborator',
      'quantgit_get_commit_history',
      'quantgit_search_code',
    ],
    configFields: [
      {
        key: 'apiKey',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        placeholder: 'qgt_live_...',
        description: 'QuantGit Personal Access Token with repo and workflow scopes',
      },
      {
        key: 'endpointUrl',
        label: 'QuantGit Server URL',
        type: 'url',
        required: false,
        defaultValue: 'https://git.quantrinity.in',
        placeholder: 'https://git.quantrinity.in',
        description: 'Custom on-premise or sovereign Git daemon endpoint',
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'Developer Tools',
    icon: 'github',
    description:
      'Connect GitHub repositories to manage issues, pull requests, commit trees, release packages, and trigger GitHub Actions workflows. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '3.1.2',
    verified: true,
    availability: 'planned',
    homepage: 'https://github.com',
    supportedTools: [],
    plannedTools: [
      'github_search_repos',
      'github_get_repo',
      'github_list_issues',
      'github_create_issue',
      'github_update_issue',
      'github_list_pull_requests',
      'github_get_pull_request',
      'github_create_pull_request',
      'github_merge_pull_request',
      'github_get_file_contents',
      'github_create_or_update_file',
      'github_list_commits',
      'github_get_commit',
      'github_list_branches',
      'github_create_branch',
      'github_dispatch_workflow',
      'github_list_workflow_runs',
      'github_get_workflow_logs',
      'github_list_releases',
      'github_create_release',
      'github_list_notifications',
      'github_get_user_profile',
      'github_list_org_repos',
      'github_add_issue_comment',
      'github_add_review_comment',
      'github_check_run_status',
      'github_search_code',
      'github_get_rate_limit',
    ],
    configFields: [
      {
        key: 'personalAccessToken',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        placeholder: 'ghp_... or github_pat_...',
        description: 'Classic token with repo, workflow scopes or fine-grained PAT',
      },
      {
        key: 'organization',
        label: 'Default Organization / Owner',
        type: 'text',
        required: false,
        placeholder: 'octocat',
        description: 'Default GitHub user or organization namespace for unqualified queries',
      },
    ],
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    category: 'Productivity',
    icon: 'google',
    description:
      'Automate Google Drive files, Gmail messages, Google Docs collaborative editing, and Google Calendar event schedules. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'OAUTH2',
    author: 'Official',
    version: '2.0.5',
    verified: true,
    availability: 'planned',
    homepage: 'https://workspace.google.com',
    supportedTools: [],
    plannedTools: [
      'gmail_search_messages',
      'gmail_get_message',
      'gmail_send_message',
      'gmail_create_draft',
      'gdrive_search_files',
      'gdrive_get_metadata',
      'gdrive_upload_file',
      'gdrive_download_file',
      'gdocs_get_document',
      'gdocs_insert_text',
      'gdocs_batch_update',
      'gcal_list_events',
      'gcal_get_event',
      'gcal_create_event',
      'gcal_quick_add',
      'gcal_delete_event',
      'gsheets_get_values',
      'gsheets_update_values',
      'gsheets_append_row',
      'gcontact_search',
      'gcontact_create',
      'gtasks_list_tasks',
      'gtasks_create_task',
      'gtasks_complete_task',
    ],
    configFields: [
      {
        key: 'clientId',
        label: 'Google OAuth Client ID',
        type: 'text',
        required: true,
        placeholder: 'apps.googleusercontent.com',
        description: 'GCP Project OAuth 2.0 Web Application Client ID',
      },
      {
        key: 'clientSecret',
        label: 'Google OAuth Client Secret',
        type: 'password',
        required: true,
        placeholder: 'GOCSPX-...',
        description: 'Client secret corresponding to the OAuth client ID',
      },
      {
        key: 'refreshToken',
        label: 'Refresh Token',
        type: 'password',
        required: false,
        placeholder: '1//...',
        description: 'Offline access refresh token for autonomous agent scheduling',
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Productivity',
    icon: 'slack',
    description:
      'Interact with team channels, send formatted Block Kit messages, react with emojis, upload agent canvas summaries, and read thread discussions. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '1.8.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://slack.com',
    supportedTools: [],
    plannedTools: [
      'slack_post_message',
      'slack_post_ephemeral',
      'slack_read_channel_history',
      'slack_list_channels',
      'slack_add_reaction',
      'slack_upload_file',
      'slack_get_user_info',
      'slack_get_user_presence',
      'slack_search_messages',
      'slack_create_channel',
      'slack_invite_to_channel',
      'slack_set_channel_topic',
      'slack_reply_in_thread',
      'slack_get_thread_replies',
      'slack_update_message',
      'slack_delete_message',
    ],
    configFields: [
      {
        key: 'botToken',
        label: 'Bot User OAuth Token',
        type: 'password',
        required: true,
        placeholder: 'xoxb-...',
        description:
          'Slack App Bot Token beginning with xoxb- with chat:write and channels:read scopes',
      },
      {
        key: 'appToken',
        label: 'App-Level Token (Optional for Socket Mode)',
        type: 'password',
        required: false,
        placeholder: 'xapp-...',
        description: 'Socket Mode connections for realtime event streaming without public webhooks',
      },
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'Databases',
    icon: 'database',
    description:
      'Direct integration with Supabase hosted Postgres: query tables, invoke Database Functions (RPC), inspect schema migrations, and sync realtime subscriptions. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '2.1.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://supabase.com',
    supportedTools: [],
    plannedTools: [
      'supabase_query_table',
      'supabase_insert_row',
      'supabase_update_row',
      'supabase_delete_row',
      'supabase_call_rpc',
      'supabase_list_tables',
      'supabase_get_schema',
      'supabase_upload_storage',
      'supabase_download_storage',
      'supabase_list_buckets',
      'supabase_get_user_profile',
      'supabase_execute_sql',
    ],
    configFields: [
      {
        key: 'projectUrl',
        label: 'Supabase Project URL',
        type: 'url',
        required: true,
        placeholder: 'https://xxxxxxxxxxxx.supabase.co',
        description: 'Project API endpoint found in Supabase Settings > API',
      },
      {
        key: 'serviceRoleKey',
        label: 'Service Role / Anon Key',
        type: 'password',
        required: true,
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'Supabase secret service role key (or public anon key for scoped access)',
      },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Developer Tools',
    icon: 'credit-card',
    description:
      'Manage payments, subscriptions, customer balances, invoices, payment intents, refund workflows, and simulate billing webhook events. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '2.5.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://stripe.com',
    supportedTools: [],
    plannedTools: [
      'stripe_list_customers',
      'stripe_get_customer',
      'stripe_create_customer',
      'stripe_list_charges',
      'stripe_get_charge',
      'stripe_create_payment_intent',
      'stripe_confirm_payment_intent',
      'stripe_list_invoices',
      'stripe_retrieve_invoice',
      'stripe_list_subscriptions',
      'stripe_cancel_subscription',
      'stripe_list_payment_methods',
      'stripe_list_refunds',
      'stripe_create_refund',
      'stripe_get_balance',
    ],
    configFields: [
      {
        key: 'secretKey',
        label: 'Stripe Secret Key',
        type: 'password',
        required: true,
        placeholder: 'sk_test_... or sk_live_...',
        description: 'Stripe API secret key with appropriate permissions',
      },
      {
        key: 'publishableKey',
        label: 'Publishable Key',
        type: 'text',
        required: false,
        placeholder: 'pk_test_... or pk_live_...',
        description: 'Client-side publishable key for checkout UI rendering',
      },
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'Media',
    icon: 'music',
    description:
      'Search music tracks, artist albums, curated playlists, control active playback queue, and retrieve acoustic audio features. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'OAUTH2',
    author: 'Official',
    version: '1.4.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://spotify.com',
    supportedTools: [],
    plannedTools: [
      'spotify_search_tracks',
      'spotify_get_track_details',
      'spotify_get_album',
      'spotify_get_playlist',
      'spotify_get_user_playlists',
      'spotify_get_current_playback',
      'spotify_play_pause',
      'spotify_skip_next',
      'spotify_add_to_queue',
      'spotify_get_audio_features',
    ],
    configFields: [
      {
        key: 'clientId',
        label: 'Spotify Client ID',
        type: 'text',
        required: true,
        placeholder: 'spotify_client_id',
        description: 'Spotify Developer Dashboard App Client ID',
      },
      {
        key: 'clientSecret',
        label: 'Spotify Client Secret',
        type: 'password',
        required: true,
        placeholder: 'spotify_client_secret',
        description: 'Spotify Developer Dashboard App Client Secret',
      },
      {
        key: 'refreshToken',
        label: 'User Refresh Token',
        type: 'password',
        required: false,
        placeholder: 'AQ...',
        description: 'User-scoped refresh token for user-modify-playback-state scopes',
      },
    ],
  },
  {
    id: 'figma',
    name: 'Figma',
    category: 'Design',
    icon: 'figma',
    description:
      'Inspect design files, extract component frames, read style tokens, download high-res vector SVG and PNG assets, and post design review comments. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '1.6.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://figma.com',
    supportedTools: [],
    plannedTools: [
      'figma_get_file',
      'figma_get_file_nodes',
      'figma_get_image_exports',
      'figma_get_image_fills',
      'figma_get_comments',
      'figma_post_comment',
      'figma_get_team_projects',
      'figma_get_project_files',
      'figma_get_component_styles',
      'figma_get_component_sets',
      'figma_export_svg',
    ],
    configFields: [
      {
        key: 'personalAccessToken',
        label: 'Figma Access Token',
        type: 'password',
        required: true,
        placeholder: 'figd_...',
        description: 'Figma Personal Access Token generated under Account Settings',
      },
    ],
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    category: 'Databases',
    icon: 'database',
    description:
      'Direct connection to relational Postgres databases: inspect schemas, examine table columns, run parameterized read-only queries, and explain plans. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '1.9.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://postgresql.org',
    supportedTools: [],
    plannedTools: [
      'pg_execute_query',
      'pg_explain_query',
      'pg_list_tables',
      'pg_describe_table',
      'pg_get_table_schema',
      'pg_list_indexes',
      'pg_check_connection',
      'pg_list_active_queries',
    ],
    configFields: [
      {
        key: 'connectionString',
        label: 'PostgreSQL Connection URI',
        type: 'password',
        required: true,
        placeholder: 'postgresql://postgres:password@localhost:5432/dbname',
        description:
          'Standard PostgreSQL connection string with host, port, dbname and credentials',
      },
      {
        key: 'ssl',
        label: 'SSL Mode',
        type: 'text',
        required: false,
        defaultValue: 'require',
        placeholder: 'require / disable / verify-full',
        description: 'SSL certificate verification mode',
      },
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    category: 'Productivity',
    icon: 'check-square',
    description:
      'Manage product issues, sprint cycles, roadmap milestones, project documents, and sync git branch references via Linear GraphQL API. Note: tool execution is not wired yet — this entry is a roadmap preview, not a working integration.',
    toolCount: 0,
    requiredAuth: 'API_KEY',
    author: 'Official',
    version: '2.0.0',
    verified: true,
    availability: 'planned',
    homepage: 'https://linear.app',
    supportedTools: [],
    plannedTools: [
      'linear_list_issues',
      'linear_get_issue',
      'linear_create_issue',
      'linear_update_issue',
      'linear_delete_issue',
      'linear_search_issues',
      'linear_list_projects',
      'linear_get_project',
      'linear_list_teams',
      'linear_list_cycles',
      'linear_get_active_cycle',
      'linear_create_comment',
      'linear_list_workflow_states',
      'linear_get_viewer',
    ],
    configFields: [
      {
        key: 'apiKey',
        label: 'Linear Personal API Key',
        type: 'password',
        required: true,
        placeholder: 'lin_api_...',
        description: 'Personal API key generated under Linear Settings > API',
      },
    ],
  },
];

/**
 * Masks sensitive credential values for secure API responses.
 * Preserves known prefixes (sk_live_, ghp_, xoxb-) and last 4 characters.
 */
export function maskCredential(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }

  // Check for common prefixes like sk_test_, sk_live_, ghp_, github_pat_, xoxb-, lin_api_, figd_
  const prefixMatch = trimmed.match(/^([a-z0-9_]+_|[a-z0-9]+-)/i);
  if (prefixMatch && prefixMatch[0].length < trimmed.length - 4) {
    const prefix = prefixMatch[0];
    const suffix = trimmed.slice(-4);
    return `${prefix}••••••${suffix}`;
  }

  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••${suffix}`;
}

export function maskConfig(
  config: Record<string, unknown>,
  configFields: McpConnectorConfigField[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of configFields) {
    const rawVal = config[field.key];
    if (rawVal === undefined || rawVal === null) continue;
    const strVal = String(rawVal);
    if (
      field.type === 'password' ||
      field.key.toLowerCase().includes('secret') ||
      field.key.toLowerCase().includes('key') ||
      field.key.toLowerCase().includes('token') ||
      field.key.toLowerCase().includes('cookie')
    ) {
      result[field.key] = maskCredential(strVal);
    } else {
      result[field.key] = strVal;
    }
  }
  return result;
}

export interface McpConnectorsServiceOptions {
  customProber?: CustomProberFn;
}

export interface McpListOptions {
  /** When set, only connectors with this availability are returned. */
  availability?: McpConnectorAvailability;
}

export class McpConnectorsService {
  private readonly catalog = new Map<string, McpConnectorCatalogItem>();
  // Store installations keyed by `${userId}:${connectorId}`
  private readonly installations = new Map<string, McpUserInstallation>();
  private readonly customProber?: CustomProberFn;

  constructor(options: McpConnectorsServiceOptions = {}) {
    this.customProber = options.customProber;
    for (const item of MCP_CONNECTOR_CATALOG) {
      this.catalog.set(item.id, item);
    }
  }

  /**
   * Return all catalog connectors enriched with the user's installation state.
   * Pass `{ availability: 'live' }` to list only connectors whose tools can
   * actually execute.
   */
  listConnectors(userId: string, options: McpListOptions = {}): McpConnector[] {
    // P0 fix: userId is required — no default identity. Callers must pass a
    // verified authenticated user id; the route layer now fails closed (401).
    const items = Array.from(this.catalog.values()).filter(
      (item) => !options.availability || item.availability === options.availability,
    );
    return items.map((item) => {
      const key = `${userId}:${item.id}`;
      const install = this.installations.get(key);
      if (install) {
        return {
          ...item,
          isInstalled: true,
          installedAt: install.installedAt,
          updatedAt: install.updatedAt,
          authStatus: install.authStatus,
          maskedConfig: maskConfig(install.config, item.configFields),
          lastTestedAt: install.lastTestedAt,
          lastTestStatus: install.lastTestStatus,
        };
      }
      return {
        ...item,
        isInstalled: false,
        installedAt: null,
        updatedAt: null,
        authStatus: 'NOT_INSTALLED',
        maskedConfig: {},
        lastTestedAt: null,
        lastTestStatus: null,
      };
    });
  }

  /**
   * Return a single connector by ID enriched with installation state.
   */
  getConnector(connectorId: string, userId: string): McpConnector {
    // P0 fix: userId is required — no default identity (see above).
    const item = this.catalog.get(connectorId);
    if (!item) {
      throw createAppError(`Connector '${connectorId}' not found`, 404, 'CONNECTOR_NOT_FOUND');
    }
    const key = `${userId}:${item.id}`;
    const install = this.installations.get(key);
    if (install) {
      return {
        ...item,
        isInstalled: true,
        installedAt: install.installedAt,
        updatedAt: install.updatedAt,
        authStatus: install.authStatus,
        maskedConfig: maskConfig(install.config, item.configFields),
        lastTestedAt: install.lastTestedAt,
        lastTestStatus: install.lastTestStatus,
      };
    }
    return {
      ...item,
      isInstalled: false,
      installedAt: null,
      updatedAt: null,
      authStatus: 'NOT_INSTALLED',
      maskedConfig: {},
      lastTestedAt: null,
      lastTestStatus: null,
    };
  }

  /**
   * Return raw installation record (for internal execution and testing).
   */
  getInstallation(userId: string, connectorId: string): McpUserInstallation | undefined {
    return this.installations.get(`${userId}:${connectorId}`);
  }

  /**
   * Return all connectors installed for a given user.
   *
   * P0 fix (F-183 recovery): no default identity — a caller must pass the
   * verified authenticated user id. A fabricated 'user-default' identity would
   * silently mix or leak per-user installation state.
   */
  getInstalledConnectors(userId: string): McpConnector[] {
    if (!userId) {
      throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    }
    return this.listConnectors(userId).filter((c) => c.isInstalled);
  }

  /**
   * Validate configuration and install a connector for the user.
   */
  installConnector(
    userId: string,
    connectorId: string,
    config: Record<string, unknown>,
  ): McpConnector {
    if (!userId) {
      throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    }
    const item = this.catalog.get(connectorId);
    if (!item) {
      throw createAppError(
        `Connector '${connectorId}' not found in catalog`,
        404,
        'CONNECTOR_NOT_FOUND',
      );
    }

    // Validate required fields
    this.validateConfig(item, config);

    const now = new Date().toISOString();
    const key = `${userId}:${connectorId}`;
    const existing = this.installations.get(key);

    const installation: McpUserInstallation = {
      userId,
      connectorId,
      config: { ...config },
      installedAt: existing ? existing.installedAt : now,
      updatedAt: now,
      authStatus: 'CONFIGURED',
      // F-183: installing only stores configuration — no connection has been
      // tested at this point. Claiming SUCCESS here was fabricated health data.
      lastTestedAt: null,
      lastTestStatus: null,
    };

    this.installations.set(key, installation);

    return {
      ...item,
      isInstalled: true,
      installedAt: installation.installedAt,
      updatedAt: installation.updatedAt,
      authStatus: installation.authStatus,
      maskedConfig: maskConfig(installation.config, item.configFields),
      lastTestedAt: installation.lastTestedAt,
      lastTestStatus: installation.lastTestStatus,
    };
  }

  /**
   * Uninstall a connector and purge user credentials.
   */
  uninstallConnector(
    userId: string,
    connectorId: string,
  ): { success: boolean; connectorId: string; wasInstalled: boolean } {
    if (!userId) {
      throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    }
    const item = this.catalog.get(connectorId);
    if (!item) {
      throw createAppError(`Connector '${connectorId}' not found`, 404, 'CONNECTOR_NOT_FOUND');
    }

    const key = `${userId}:${connectorId}`;
    const wasInstalled = this.installations.has(key);
    this.installations.delete(key);

    return {
      success: true,
      connectorId,
      wasInstalled,
    };
  }

  /**
   * Validate configuration and, where a real probe is defined, verify the
   * connector against its live endpoint with measured latency.
   *
   * Honesty contract (F-183): this method NEVER fabricates latency, versions,
   * quotas, rate limits, or server metadata. Credential format checks are real
   * local checks. A result is only marked `verified: true` when an actual
   * network call was made; `serverInfo` then carries observed facts only
   * (HTTP status, host). Connectors without a configured probe return an
   * explicit not-verified result — never a hardcoded success.
   */
  async testConnection(
    connectorId: string,
    config: Record<string, unknown>,
  ): Promise<McpTestResult> {
    const item = this.catalog.get(connectorId);
    if (!item) {
      return {
        success: false,
        verified: false,
        outcome: 'invalid',
        latencyMs: 0,
        message: `Connector '${connectorId}' does not exist in catalog`,
      };
    }

    if (this.customProber) {
      const probed = await this.customProber(connectorId, config);
      // A custom prober is, by definition, a real probe implementation, unless
      // it explicitly reports otherwise.
      return {
        verified: true,
        outcome: probed.success ? 'ok' : 'failed',
        latencyMs: 0,
        ...probed,
      };
    }

    const startTime = Date.now();
    const elapsed = () => Math.max(0, Date.now() - startTime);

    // 1) Real local checks: required fields must be present.
    for (const field of item.configFields) {
      if (field.required) {
        const val = config[field.key];
        if (val === undefined || val === null || String(val).trim() === '') {
          return {
            success: false,
            verified: false,
            outcome: 'invalid',
            latencyMs: elapsed(),
            message: `Missing required configuration field: '${field.label}'`,
          };
        }
      }
    }

    // 2) Real local checks: connector-specific credential FORMAT validation.
    //    Format validity is NOT a connection guarantee.
    const formatError = McpConnectorsService.validateCredentialFormat(connectorId, config);
    if (formatError) {
      return {
        success: false,
        verified: false,
        outcome: 'invalid',
        latencyMs: elapsed(),
        message: formatError,
      };
    }

    // 3) Live probe where one is defined; otherwise fail closed with an
    //    honest not-verified state (never a fabricated success).
    const probe = McpConnectorsService.resolveProbe(item, config);
    if (!probe) {
      return {
        success: false,
        verified: false,
        outcome: 'unknown',
        latencyMs: elapsed(),
        message:
          `Configuration format is valid for ${item.name}, but no live health probe ` +
          `is configured — connection state is unknown, not verified.`,
      };
    }

    return this.runHttpProbe(item.name, probe, startTime);
  }

  /**
   * Pure credential-format validation (no network). Returns an error message
   * when the supplied config is malformed, or null when the format is valid.
   */
  private static validateCredentialFormat(
    connectorId: string,
    config: Record<string, unknown>,
  ): string | null {
    const str = (key: string): string => String(config[key] ?? '');
    const isValidUrl = (key: string): boolean => {
      try {
        const parsed = new URL(str(key));
        return parsed.protocol.startsWith('http');
      } catch {
        return false;
      }
    };

    switch (connectorId) {
      case 'quantmail':
      case 'quantdrive': {
        if (str('sessionCookie').length < 10) {
          return 'Invalid session token: must be at least 10 characters';
        }
        if (config['endpointUrl'] && !isValidUrl('endpointUrl')) {
          return 'Invalid endpoint URL format';
        }
        return null;
      }
      case 'quantgit':
        return str('apiKey').length < 10
          ? 'Invalid QuantGit token: must be at least 10 characters'
          : null;
      case 'github': {
        const pat = str('personalAccessToken');
        return !pat.startsWith('ghp_') && !pat.startsWith('github_pat_')
          ? 'Invalid GitHub token format: must start with ghp_ or github_pat_'
          : null;
      }
      case 'google-workspace':
        return str('clientId').length < 8 || str('clientSecret').length < 8
          ? 'Invalid Google OAuth credentials: client ID and secret must be valid'
          : null;
      case 'slack':
        return !str('botToken').startsWith('xoxb-')
          ? 'Invalid Slack Bot Token: must begin with xoxb-'
          : null;
      case 'supabase':
        if (!isValidUrl('projectUrl')) {
          return 'Invalid Supabase Project URL: must be a valid HTTP/HTTPS URL';
        }
        return str('serviceRoleKey').length < 16
          ? 'Invalid Supabase API key: must be at least 16 characters'
          : null;
      case 'stripe': {
        const secretKey = str('secretKey');
        return !secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')
          ? 'Invalid Stripe Secret Key: must begin with sk_test_ or sk_live_'
          : null;
      }
      case 'spotify':
        return str('clientId').length < 8 || str('clientSecret').length < 8
          ? 'Invalid Spotify credentials: Client ID and Secret required'
          : null;
      case 'figma':
        return !str('personalAccessToken').startsWith('figd_')
          ? 'Invalid Figma Access Token: must start with figd_'
          : null;
      case 'postgresql': {
        const connStr = str('connectionString');
        return !connStr.startsWith('postgresql://') && !connStr.startsWith('postgres://')
          ? 'Invalid PostgreSQL connection URI: must begin with postgresql:// or postgres://'
          : null;
      }
      case 'linear':
        return !str('apiKey').startsWith('lin_api_')
          ? 'Invalid Linear API Key: must begin with lin_api_'
          : null;
      default:
        return null;
    }
  }

  /**
   * Return the real network probe for a connector, or null when none is
   * configured (the caller then reports an honest not-verified state).
   */
  private static resolveProbe(
    item: McpConnectorCatalogItem,
    config: Record<string, unknown>,
  ): McpHttpProbe | null {
    switch (item.id) {
      case 'quantmail':
      case 'quantdrive':
      case 'quantgit': {
        const raw = String(
          config['endpointUrl'] ??
            item.configFields.find((f) => f.key === 'endpointUrl')?.defaultValue ??
            '',
        ).trim();
        if (!raw) return null;
        return { url: raw, method: 'HEAD', timeoutMs: 8000, kind: 'reachability' };
      }
      case 'github': {
        const token = String(config['personalAccessToken'] ?? '').trim();
        if (!token) return null;
        return {
          url: 'https://api.github.com/rate_limit',
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'QuantAI-Connector-Probe',
          },
          timeoutMs: 8000,
          kind: 'auth',
        };
      }
      default:
        return null;
    }
  }

  /**
   * Perform the actual HTTP probe with measured latency. Only observed facts
   * (HTTP status, host, measured round-trip) are reported — nothing is
   * inferred about versions, quotas, or account state.
   */
  private async runHttpProbe(
    connectorName: string,
    probe: McpHttpProbe,
    startTime: number,
  ): Promise<McpTestResult> {
    const elapsed = () => Math.max(0, Date.now() - startTime);

    let host = probe.url;
    try {
      host = new URL(probe.url).host;
    } catch {
      return {
        success: false,
        verified: false,
        outcome: 'invalid',
        latencyMs: elapsed(),
        message: `Cannot probe ${connectorName}: misconfigured probe URL.`,
      };
    }

    // SSRF boundary (CodeQL js/request-forgery): probe URLs come from
    // connector config. Never fetch a non-public target — fail closed and
    // say so honestly instead of attempting the request.
    if (!isProbeUrlAllowed(probe.url)) {
      return {
        success: false,
        verified: true,
        outcome: 'failed',
        latencyMs: elapsed(),
        message:
          `Cannot probe ${connectorName}: the configured probe URL is not ` +
          `allowed (only public http/https endpoints may be probed).`,
      };
    }

    if (typeof fetch !== 'function') {
      return {
        success: false,
        verified: false,
        outcome: 'unknown',
        latencyMs: elapsed(),
        message:
          `Configuration format is valid for ${connectorName}, but this runtime ` +
          `cannot make outbound HTTP calls — connection state is unknown, not verified.`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), probe.timeoutMs);
    try {
      const res = await fetch(probe.url, {
        method: probe.method,
        headers: probe.headers,
        signal: controller.signal,
      });
      const latencyMs = elapsed();
      // Defensive: a stubbed or non-standard fetch may resolve garbage.
      const status =
        res && typeof (res as { status?: unknown }).status === 'number'
          ? (res as { status: number }).status
          : NaN;
      const serverInfo: Record<string, unknown> = {
        httpStatus: Number.isNaN(status) ? 'unknown' : status,
        host,
      };
      if (Number.isNaN(status)) {
        return {
          success: false,
          verified: true,
          outcome: 'failed',
          latencyMs,
          message: `${connectorName} probe returned an unreadable response — connection state is unknown.`,
          serverInfo,
        };
      }
      if (probe.kind === 'auth') {
        if (status === 401 || status === 403) {
          return {
            success: false,
            verified: true,
            outcome: 'failed',
            latencyMs,
            message: `${connectorName} rejected the supplied credentials (HTTP ${status}).`,
            serverInfo,
          };
        }
        if (status >= 200 && status < 300) {
          return {
            success: true,
            verified: true,
            outcome: 'ok',
            latencyMs,
            message: `${connectorName} credentials verified against the live API (HTTP ${status}) in ${latencyMs} ms.`,
            serverInfo,
          };
        }
        return {
          success: false,
          verified: true,
          outcome: 'failed',
          latencyMs,
          message: `${connectorName} probe returned HTTP ${status} — credentials could not be verified.`,
          serverInfo,
        };
      }
      return {
        success: true,
        verified: true,
        outcome: 'ok',
        latencyMs,
        message:
          `${connectorName} endpoint reachable (HTTP ${status}) in ${latencyMs} ms. ` +
          `Reachability only — credentials were not verified by this probe.`,
        serverInfo,
      };
    } catch (err) {
      const latencyMs = elapsed();
      const reason =
        err && (err as { name?: string }).name === 'AbortError'
          ? `timed out after ${probe.timeoutMs} ms`
          : `unreachable (${err instanceof Error ? err.message : 'network error'})`;
      return {
        success: false,
        verified: true,
        outcome: 'failed',
        latencyMs,
        message: `${connectorName} endpoint ${reason}.`,
        serverInfo: { host },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Internal helper to validate required fields for a catalog item.
   */
  private validateConfig(item: McpConnectorCatalogItem, config: Record<string, unknown>): void {
    const missing: string[] = [];
    for (const field of item.configFields) {
      if (field.required) {
        const val = config[field.key];
        if (val === undefined || val === null || String(val).trim() === '') {
          missing.push(field.label);
        }
      }
    }

    if (missing.length > 0) {
      throw createAppError(
        `Missing required fields for ${item.name}: ${missing.join(', ')}`,
        400,
        'INVALID_CONNECTOR_CONFIG',
      );
    }
  }
}
