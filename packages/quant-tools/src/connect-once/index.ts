// Connect-once OAuth + capability token (P1-2) — public surface.

export {
  SCOPE_CATALOG,
  allScopeNames,
  isKnownScope,
  requiredScopesForTool,
  scopeDomainForAppId,
  scopeInfo,
  type CapabilityScope,
} from './capability-scopes.js';

export {
  CAPABILITY_TOKEN_ISSUER,
  CAPABILITY_TOKEN_SECRET_ENV,
  CapabilityTokenError,
  isCapabilityTokenRevoked,
  issueCapabilityToken,
  resolveCapabilitySecret,
  revokeCapabilityToken,
  verifyCapabilityToken,
  type CapabilityClaims,
  type CapabilityTokenErrorCode,
  type IssueCapabilityTokenOptions,
} from './capability-token.js';

export {
  createConnectOnceHandler,
  type ConnectOnceOptions,
  type ConsentUser,
} from './consent-server.js';

export { JwtCapabilityTokenResolver } from './gateway-resolver.js';
