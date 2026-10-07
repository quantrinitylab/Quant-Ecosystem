/**
 * EC-01 — Capability versioning (§10).
 *
 * Capabilities are independently versioned: `mail.send.execute.v1`,
 * `mail.send.execute.v2`. Additive compatible changes may stay compatible;
 * semantic changes require a new version. Deprecated versions require a
 * documented sunset date. Unsupported versions fail with a typed error.
 */
import type { Capability } from './capability-types';
import { CapabilityError } from './capability-errors';

export interface VersionResolution {
  capability: Capability;
  /** True when the resolved version is deprecated — callers should migrate. */
  deprecated: boolean;
  /** Sunset date when the version is deprecated, if documented. */
  sunsetDate?: string;
}

/**
 * Resolve a capability version, fail-closed.
 *
 * - No requested version → latest non-deprecated active version.
 * - Explicit version → that version (deprecated versions still resolve but
 *   are flagged; disabled versions never resolve).
 * - Unknown version → CAPABILITY_VERSION_UNSUPPORTED.
 */
export function resolveVersion(
  versions: readonly Capability[],
  requestedVersion?: number,
): VersionResolution {
  if (versions.length === 0) {
    throw new CapabilityError('CAPABILITY_NOT_FOUND', 'no versions registered');
  }
  const usable = versions.filter((c) => c.status !== 'disabled');
  if (usable.length === 0) {
    throw new CapabilityError('CAPABILITY_DISABLED', 'all versions disabled');
  }

  if (requestedVersion !== undefined) {
    const match = usable.find((c) => c.version === requestedVersion);
    if (!match) {
      const known = usable.map((c) => c.version).join(', ');
      throw new CapabilityError(
        'CAPABILITY_VERSION_UNSUPPORTED',
        `version ${requestedVersion} unknown; known: ${known}`,
      );
    }
    return {
      capability: match,
      deprecated: match.status === 'deprecated',
    };
  }

  const sorted = [...usable].sort((a, b) => b.version - a.version);
  const latest = sorted.find((c) => c.status !== 'deprecated') ?? sorted[0];
  if (!latest) {
    throw new CapabilityError('CAPABILITY_NOT_FOUND', 'no versions registered');
  }
  return { capability: latest, deprecated: latest.status === 'deprecated' };
}
