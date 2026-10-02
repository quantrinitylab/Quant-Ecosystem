// ============================================================================
// quantai_core - studio: publish flow (chunk 1)
//
// The ONLY path from preview → published. Pipeline:
//
//   1. load artifact            → missing = failed
//   2. must be in preview       → else failed ("call toPreview() first")
//   3. build static snapshot    → error = failed
//   4. SnapshotPolicy gate      → violation = failed
//   5. FRESH approval request   → denied = denied (NO state change)
//   6. approved                 → save(published) = published
//
// No step is skippable, approvals are never cached, and a denial leaves the
// artifact untouched in preview. Default gateway denies everything until
// quantai-sentinel lands the real approval UX (fail-closed).
// ============================================================================

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'approval_gateway.dart';
import 'artifact_models.dart';
import 'snapshot_policy.dart';
import 'studio_providers.dart';
import 'studio_repository.dart';

/// Publish attempt outcome.
enum PublishResult {
  /// Approval granted; artifact is now published.
  published,

  /// Approval denied; artifact unchanged (still preview).
  denied,

  /// Pipeline failed before approval (not found / wrong state /
  /// snapshot error / policy violation).
  failed,
}

class PublishOutcome {
  final PublishResult result;
  final String? message;

  /// Positional constructor (QA F1 lesson).
  const PublishOutcome(this.result, [this.message]);
}

/// The single publish pipeline. Construct via [publishFlowProvider] (or
/// manually in tests with fakes).
class PublishFlow {
  final StudioRepository repository;
  final PublishApprovalGateway approvals;
  final SnapshotBuilder snapshots;

  const PublishFlow({
    required this.repository,
    required this.approvals,
    required this.snapshots,
  });

  /// Run the full publish pipeline for [artifactId].
  ///
  /// [snapshotPath] is where the caller (document/page builder, chunk 3)
  /// wrote the static snapshot file; recorded on the artifact for the
  /// Library tab. Null leaves any existing path untouched.
  Future<PublishOutcome> publish(String artifactId, {String? snapshotPath}) async {
    final artifact = await repository.getById(artifactId);
    if (artifact == null) {
      return const PublishOutcome(
        PublishResult.failed,
        'artifact not found',
      );
    }
    if (artifact.lifecycle != ArtifactLifecycle.preview) {
      return const PublishOutcome(
        PublishResult.failed,
        'publish requires preview state — call toPreview() first',
      );
    }

    late final ArtifactSnapshot snapshot;
    try {
      snapshot = await snapshots.build(artifact);
    } catch (e) {
      return PublishOutcome(
        PublishResult.failed,
        'snapshot build failed: $e',
      );
    }

    try {
      SnapshotPolicy.assertNoSecrets({
        'artifactId': artifact.id,
        'type': artifact.type.wireValue,
        'title': artifact.title,
      });
    } on SnapshotPolicyViolation catch (e) {
      return PublishOutcome(PublishResult.failed, 'privacy policy: ${e.message}');
    }

    // FRESH approval on every attempt — never cached, never skipped.
    final approval = await approvals.requestApproval(
      PublishRequest(
        artifactId: artifact.id,
        snapshotHash: snapshot.sha256Hex,
        snapshotBytes: snapshot.bytes.length,
        requestedAt: DateTime.now(),
      ),
    );
    if (!approval.approved) {
      return PublishOutcome(
        PublishResult.denied,
        approval.note ?? 'publish denied',
      );
    }

    await repository.save(
      artifact.withLifecycle(
        ArtifactLifecycle.published,
        snapshotPath: snapshotPath,
      ),
    );
    return const PublishOutcome(PublishResult.published);
  }
}

/// Approval UX binding. quantai-sentinel overrides this with the real
/// user-confirmation / policy-engine implementation; until then publishing
/// is fail-closed via [DenyByDefaultApprovalGateway].
final publishApprovalGatewayProvider = Provider<PublishApprovalGateway>(
  (ref) => const DenyByDefaultApprovalGateway(),
);

/// Snapshot rendering binding. Override in tests with fakes.
final snapshotBuilderProvider = Provider<SnapshotBuilder>(
  (ref) => StaticSnapshotBuilder(),
);

/// The publish pipeline, wired from the other Studio providers.
final publishFlowProvider = Provider<PublishFlow>(
  (ref) => PublishFlow(
    repository: ref.watch(studioRepositoryProvider),
    approvals: ref.watch(publishApprovalGatewayProvider),
    snapshots: ref.watch(snapshotBuilderProvider),
  ),
);
