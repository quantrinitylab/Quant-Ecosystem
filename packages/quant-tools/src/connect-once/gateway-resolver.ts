// ============================================================================
// JwtCapabilityTokenResolver — the one-line wiring between the connect-once
// OAuth layer and the MCP gateway's CapabilityTokenResolver seam.
//
//   new QuantyMcpServer(registry, executor, {
//     tokenResolver: new JwtCapabilityTokenResolver(secret),
//   })
//
// A bearer that verifies as a capability JWT (signature + expiry + not on
// the in-memory revocation denylist) resolves to the userId/scopes encoded
// in it. Anything else resolves to null and the gateway falls back to its
// legacy registerToken map.
// ============================================================================

import type { PermissionTier } from '../types.js';
import type {
  CapabilityTokenResolver,
  ResolvedCapabilities,
} from '../mcp/mcp-gateway-server.js';
import {
  isCapabilityTokenRevoked,
  verifyCapabilityToken,
} from './capability-token.js';

export class JwtCapabilityTokenResolver implements CapabilityTokenResolver {
  /**
   * @param secret HS256 secret — must be the same secret the consent server
   *   used to issue tokens (see resolveCapabilitySecret()).
   * @param defaultTier tier stamped on resolved auth contexts when the token
   *   carries no tier of its own. Capability tokens express authority through
   *   scopes (checked per call), so the tier gate stays permissive; tier>=2
   *   per-call confirmations still fire based on the tool's own tier.
   */
  constructor(
    private readonly secret: string,
    private readonly defaultTier: PermissionTier = 3,
  ) {}

  async resolve(bearer: string): Promise<ResolvedCapabilities | null> {
    let claims;
    try {
      claims = verifyCapabilityToken(bearer, this.secret);
    } catch {
      return null;
    }
    if (isCapabilityTokenRevoked(claims.jti)) {
      return null;
    }
    return {
      userId: claims.sub,
      scopes: claims.scopes,
      expiresAtMs: claims.exp * 1000,
      tier: this.defaultTier,
    };
  }
}
