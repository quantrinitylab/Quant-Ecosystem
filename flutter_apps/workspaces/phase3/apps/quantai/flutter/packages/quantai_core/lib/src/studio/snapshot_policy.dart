// ============================================================================
// quantai_core - studio: static snapshot + privacy policy (chunk 1)
//
// Privacy law (blueprint §3.7, MISSION.md): "App data kabhi publish payload
// me nahi — publish = static snapshot."
//
// [StaticSnapshotBuilder] renders each artifact into STATIC bytes (markdown /
// HTML / manifest JSON / media file bytes). [SnapshotPolicy] is the last
// automated gate before approval: it rejects metadata that smells like
// secrets. Neither replaces the human approval — they run BEFORE it.
// ============================================================================

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'artifact_models.dart';

/// Thrown when publish metadata looks like it carries secrets / live data.
class SnapshotPolicyViolation implements Exception {
  final String message;

  /// Positional constructor (QA F1 lesson: exceptions stay positional).
  const SnapshotPolicyViolation(this.message);

  @override
  String toString() => 'SnapshotPolicyViolation: $message';
}

/// The static bytes that actually get published. No live object graphs, no
/// tokens, no sessions — just rendered content.
class ArtifactSnapshot {
  final String artifactId;
  final ArtifactType type;
  final Uint8List bytes;
  final String mimeType;

  /// Hex digest of [bytes]. Currently FNV-1a 64-bit (pure Dart, no new deps).
  ///
  // TODO(UNVERIFIED): switch to real SHA-256 when the `crypto` package is
  // added to quantai_core; FNV-1a is NOT collision-resistant.
  final String sha256Hex;

  const ArtifactSnapshot({
    required this.artifactId,
    required this.type,
    required this.bytes,
    required this.mimeType,
    required this.sha256Hex,
  });
}

/// Builds the static publish snapshot for an artifact.
abstract class SnapshotBuilder {
  /// Render [artifact] to static bytes. Must never include live tokens,
  /// sessions, or app data — only rendered content.
  Future<ArtifactSnapshot> build(StudioArtifact artifact);
}

/// Pure-Dart snapshot builder (no backend calls).
class StaticSnapshotBuilder implements SnapshotBuilder {
  @override
  Future<ArtifactSnapshot> build(StudioArtifact artifact) async {
    switch (artifact) {
      case DocumentArtifact self:
        final bytes = Uint8List.fromList(utf8.encode(self.markdown));
        return _snapshot(artifact, bytes, 'text/markdown');
      case PageArtifact self:
        final bytes = Uint8List.fromList(utf8.encode(self.htmlSnapshot));
        return _snapshot(artifact, bytes, 'text/html');
      case AppArtifact self:
        final bytes = Uint8List.fromList(utf8.encode(self.manifestJson));
        return _snapshot(artifact, bytes, 'application/json');
      case MediaArtifact self:
        final path = self.mediaPath;
        if (path == null || path.isEmpty) {
          throw StateError(
            'Cannot snapshot media artifact ${artifact.id}: '
            'no media file generated yet (mediaPath is null).',
          );
        }
        final bytes = await File(path).readAsBytes();
        // TODO(UNVERIFIED): real mime sniffing from file header; octet-stream
        // is the honest placeholder until the media pipeline (chunk 5) lands.
        return _snapshot(artifact, bytes, 'application/octet-stream');
    }
  }

  ArtifactSnapshot _snapshot(
    StudioArtifact artifact,
    Uint8List bytes,
    String mimeType,
  ) {
    return ArtifactSnapshot(
      artifactId: artifact.id,
      type: artifact.type,
      bytes: bytes,
      mimeType: mimeType,
      sha256Hex: _fnv1a64Hex(bytes),
    );
  }
}

/// FNV-1a 64-bit hex digest (placeholder for SHA-256 — see [ArtifactSnapshot]).
String _fnv1a64Hex(Uint8List bytes) {
  var hash = 0xcbf29ce484222325;
  for (final byte in bytes) {
    hash ^= byte;
    hash = (hash * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF;
  }
  return hash.toRadixString(16).padLeft(16, '0');
}

/// Automated privacy gate: rejects publish metadata containing
/// secret-shaped keys. Runs before the approval request.
class SnapshotPolicy {
  static const List<String> blockedKeySubstrings = [
    'token',
    'secret',
    'password',
    'apikey',
    'api_key',
    'authorization',
    'bearer',
    'sessionid',
    'refresh',
    'privatekey',
  ];

  /// Throws [SnapshotPolicyViolation] if any metadata key contains a blocked
  /// substring (case-insensitive). Values are never logged.
  static void assertNoSecrets(Map<String, String> metadata) {
    for (final key in metadata.keys) {
      final normalized = key.toLowerCase();
      for (final blocked in blockedKeySubstrings) {
        if (normalized.contains(blocked)) {
          throw SnapshotPolicyViolation(
            'metadata key "$key" looks like a secret '
            '(matches "$blocked") — refusing to publish.',
          );
        }
      }
    }
  }
}
