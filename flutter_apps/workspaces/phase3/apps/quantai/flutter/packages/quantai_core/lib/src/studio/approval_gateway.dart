// ============================================================================
// quantai_core - studio: publish approval gateway (chunk 1)
//
// Sentinel contract, client side. Blueprint §3.7: "Publish = har baar fresh
// approval. Koi auto-publish nahi."
//
// This file is a CONTRACT OFFER to the quantai-sentinel program: they own the
// real approval UX (user confirmation / policy engine). Until their
// implementation lands, [DenyByDefaultApprovalGateway] keeps publishing
// fail-closed (privacy law). Sentinel's implementation overrides
// [publishApprovalGatewayProvider] — no Studio code changes needed.
//
// Rules enforced by contract (see publish_flow.dart):
//   1. Every publish calls requestApproval FRESH — caching an approval is
//      forbidden, even within one session.
//   2. A denial changes nothing (artifact stays in preview).
// ============================================================================

/// What gets sent to the approval UX for one publish attempt.
class PublishRequest {
  final String artifactId;

  /// Hex digest of the exact static snapshot bytes being published.
  final String snapshotHash;
  final int snapshotBytes;
  final DateTime requestedAt;

  const PublishRequest({
    required this.artifactId,
    required this.snapshotHash,
    required this.snapshotBytes,
    required this.requestedAt,
  });

  Map<String, dynamic> toJson() => {
        'artifactId': artifactId,
        'snapshotHash': snapshotHash,
        'snapshotBytes': snapshotBytes,
        'requestedAt': requestedAt.toIso8601String(),
      };
}

/// The sentinel/user decision for one [PublishRequest].
class PublishApproval {
  final bool approved;
  final DateTime decidedAt;
  final String? note;

  /// Who decided: `'user'` (explicit tap) or `'sentinel-policy'`
  /// (policy engine auto-decision).
  ///
  // TODO(UNVERIFIED): decision-source vocabulary — confirm with
  // quantai-sentinel when they land the real UX.
  final String decidedBy;

  const PublishApproval({
    required this.approved,
    required this.decidedAt,
    this.note,
    this.decidedBy = 'user',
  });
}

/// Approval UX boundary. Implementations must ask the user (or the sentinel
/// policy engine) on EVERY call — never auto-approve, never cache.
abstract class PublishApprovalGateway {
  /// Request a FRESH approval for [request]. Called once per publish attempt.
  Future<PublishApproval> requestApproval(PublishRequest request);
}

/// Fail-closed default: denies everything until the sentinel approval UX is
/// wired. Publishing stays impossible rather than unguarded.
class DenyByDefaultApprovalGateway implements PublishApprovalGateway {
  const DenyByDefaultApprovalGateway();

  @override
  Future<PublishApproval> requestApproval(PublishRequest request) async {
    return PublishApproval(
      approved: false,
      decidedAt: DateTime.now(),
      decidedBy: 'sentinel-policy',
      note: 'Sentinel approval UX not wired yet — '
          'publish blocked by default (privacy law).',
    );
  }
}
