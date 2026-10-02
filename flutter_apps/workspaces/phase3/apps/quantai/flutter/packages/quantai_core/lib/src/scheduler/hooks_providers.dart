// ============================================================================
// quantai_core - hooks repository (local-only) + providers
// ============================================================================
//
// No backend hooks endpoint exists yet (see `hooks_models.dart`), so the
// repository is an honest in-memory store with an interface shaped for a
// future `HooksApi`. When the backend contract lands, this provider gets a
// real implementation and every caller keeps compiling.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'hooks_models.dart';

/// Storage contract for hook definitions and their run ledger.
abstract class HooksRepository {
  Future<List<Hook>> listHooks();
  Future<Hook?> getHook(String id);
  Future<Hook> saveHook(Hook hook);
  Future<void> deleteHook(String id);
  Future<List<HookRun>> listRuns(String hookId, {int limit});
  Future<void> recordRun(HookRun run);
  Stream<List<Hook>> watchHooks();
}

/// In-memory [HooksRepository]: honest local store, clearly NOT the backend.
///
/// Documented as such so nobody mistakes local hooks for server-synced
/// ones — a local hook dies with the app install, a backend cron does not.
class InMemoryHooksRepository implements HooksRepository {
  final Map<String, Hook> _hooks = {};
  final Map<String, List<HookRun>> _runs = {};
  final _controller = StreamController<List<Hook>>.broadcast();

  @override
  Future<List<Hook>> listHooks() async => _hooks.values.toList();

  @override
  Future<Hook?> getHook(String id) async => _hooks[id];

  @override
  Future<Hook> saveHook(Hook hook) async {
    _hooks[hook.id] = hook;
    _emit();
    return hook;
  }

  @override
  Future<void> deleteHook(String id) async {
    _hooks.remove(id);
    _emit();
  }

  @override
  Future<List<HookRun>> listRuns(String hookId, {int limit = 50}) async {
    final runs = _runs[hookId] ?? const <HookRun>[];
    return runs.take(limit).toList();
  }

  @override
  Future<void> recordRun(HookRun run) async {
    final runs = _runs.putIfAbsent(run.hookId, () => <HookRun>[]);
    runs.insert(0, run);
  }

  Stream<List<Hook>> _hooksStream() => _controller.stream;

  void _emit() {
    if (!_controller.isClosed) _controller.add(_hooks.values.toList());
  }

  @override
  Stream<List<Hook>> watchHooks() => _hooksStream();

  void dispose() => _controller.close();
}

final hooksRepositoryProvider = Provider<HooksRepository>(
  (ref) {
    final repo = InMemoryHooksRepository();
    ref.onDispose(repo.dispose);
    return repo;
  },
  name: 'hooksRepositoryProvider',
);

final hooksProvider = FutureProvider<List<Hook>>(
  (ref) => ref.watch(hooksRepositoryProvider).listHooks(),
  name: 'hooksProvider',
);

final hookRunsProvider = FutureProvider.family<List<HookRun>, String>(
  (ref, hookId) =>
      ref.watch(hooksRepositoryProvider).listRuns(hookId, limit: 50),
  name: 'hookRunsProvider',
);
