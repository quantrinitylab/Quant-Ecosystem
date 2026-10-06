// ============================================================================
// Quanty agent — Gmail MCP connector (public surface)
// ============================================================================

export {
  GmailMcpClient,
  GmailRestTransport,
  StdioMcpTransport,
  GmailApiError,
  GMAIL_MCP_TOOL_DEFINITIONS,
  type McpTransport,
  type McpToolDefinition,
  type McpToolResult,
  type GmailMessage,
  type GmailMessagePart,
  type GmailListResponse,
} from './gmail-mcp-client';

export {
  GmailOAuth,
  EnvKeyTokenCipher,
  InMemoryGmailGrantStore,
  gmailOAuthConfigFromEnv,
  GMAIL_SCOPES,
  type GmailOAuthConfig,
  type GmailOAuthDeps,
  type GmailGrantStore,
  type StoredGmailGrant,
  type TokenCipher,
} from './gmail-oauth';

export {
  buildQuantyGmailTools,
  buildRawEmail,
  type QuantyGmailTool,
  type QuantyGmailToolsDeps,
  type GmailToolAuditEntry,
} from './gmail-tools';

export {
  buildGmailToolRegistry,
  registerGmailTools,
} from './gmail-registry';
