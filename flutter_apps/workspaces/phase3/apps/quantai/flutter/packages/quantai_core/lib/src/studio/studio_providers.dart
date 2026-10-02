// ============================================================================
// quantai_core - studio: Riverpod providers (chunk 1)
//
// Provider names are EXACT and stable — flutter-quantai (Library tab shell)
// and later Studio chunks import these. Do not rename without a board note.
//
//   studioRepositoryProvider  – StudioRepository (override in tests)
//   studioArtifactsProvider   – live artifact list (newest first)
//   studioArtifactProvider    – family lookup by id
//   studioDraftsProvider      – Library "Drafts" section
//   studioPublishedProvider   – Library "Published" section
// ============================================================================

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'artifact_models.dart';
import 'studio_repository.dart';

/// Repository binding. Override with a fake in widget/unit tests.
final studioRepositoryProvider = Provider<StudioRepository>(
  (ref) => InMemoryStudioRepository(),
);

/// Live artifact list, newest-first by updatedAt.
final studioArtifactsProvider = StreamProvider<List<StudioArtifact>>(
  (ref) => ref.watch(studioRepositoryProvider).watchArtifacts(),
);

/// Single-artifact lookup for detail / preview screens.
final studioArtifactProvider =
    Provider.family<StudioArtifact?, String>((ref, id) {
  final artifacts = ref.watch(studioArtifactsProvider).valueOrNull;
  if (artifacts == null) return null;
  for (final artifact in artifacts) {
    if (artifact.id == id) return artifact;
  }
  return null;
});

/// Library tab "Drafts" section.
final studioDraftsProvider = Provider<List<StudioArtifact>>(
  (ref) =>
      ref
          .watch(studioArtifactsProvider)
          .valueOrNull
          ?.where((a) => a.lifecycle == ArtifactLifecycle.draft)
          .toList() ??
      const [],
);

/// Library tab "Published" section.
final studioPublishedProvider = Provider<List<StudioArtifact>>(
  (ref) =>
      ref
          .watch(studioArtifactsProvider)
          .valueOrNull
          ?.where((a) => a.lifecycle == ArtifactLifecycle.published)
          .toList() ??
      const [],
);
