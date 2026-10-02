// ============================================================================
// quantai_core - studio: artifact repository (chunk 1)
//
// Persistence boundary for Studio artifacts. The interface is storage-
// agnostic; the shipped implementation is an honest in-memory store.
// Drift/SQLite persistence (offline-first, D3) is a later chunk.
//
// Consumers: studio_providers.dart (Riverpod), publish_flow.dart.
// ============================================================================

import 'dart:async';

import 'artifact_models.dart';

/// Storage contract for [StudioArtifact]s.
abstract class StudioRepository {
  /// Live list of all artifacts, newest-first by [StudioArtifact.updatedAt].
  Stream<List<StudioArtifact>> watchArtifacts();

  Future<StudioArtifact?> getById(String id);

  /// Insert or replace by [StudioArtifact.id].
  Future<void> save(StudioArtifact artifact);

  Future<void> delete(String id);
}

/// Honest in-memory implementation: no disk, no network.
///
/// Emits the current snapshot immediately on subscribe, then updates.
/// Process restart loses data — this is a documented stub, not a fake
/// database.
///
/// TODO(UNVERIFIED): replace with Drift/SQLite persistence (offline-first D3)
/// once the Studio schema is finalized; keep the interface unchanged.
class InMemoryStudioRepository implements StudioRepository {
  final Map<String, StudioArtifact> _store = {};
  final StreamController<List<StudioArtifact>> _controller =
      StreamController<List<StudioArtifact>>.broadcast();

  List<StudioArtifact> _sorted() {
    final list = _store.values.toList()
      ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return List<StudioArtifact>.unmodifiable(list);
  }

  void _emit() {
    if (!_controller.isClosed) _controller.add(_sorted());
  }

  @override
  Stream<List<StudioArtifact>> watchArtifacts() async* {
    yield _sorted();
    yield* _controller.stream;
  }

  @override
  Future<StudioArtifact?> getById(String id) async => _store[id];

  @override
  Future<void> save(StudioArtifact artifact) async {
    _store[artifact.id] = artifact;
    _emit();
  }

  @override
  Future<void> delete(String id) async {
    _store.remove(id);
    _emit();
  }
}
