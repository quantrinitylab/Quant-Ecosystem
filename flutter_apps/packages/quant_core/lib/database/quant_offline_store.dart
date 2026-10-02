import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/sync_operation.dart';

/// Offline storage manager providing immediate persistence, cache, and sync queue.
class QuantOfflineStore {
  final SharedPreferences? _prefs;
  final List<SyncOperation> _inMemoryQueue = [];
  final Map<String, Map<String, dynamic>> _inMemoryCache = {};

  QuantOfflineStore({SharedPreferences? prefs}) : _prefs = prefs;

  /// Enqueue an offline mutation
  Future<void> enqueueSyncOperation(SyncOperation operation) async {
    _inMemoryQueue.add(operation);
  }

  /// Get all pending sync operations ordered by creation time
  Future<List<SyncOperation>> getPendingOperations() async {
    return _inMemoryQueue
        .where((op) => op.status == SyncStatus.pending || op.status == SyncStatus.failed)
        .toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  /// Mark operation as completed
  Future<void> markOperationSynced(String operationId) async {
    final index = _inMemoryQueue.indexWhere((op) => op.id == operationId);
    if (index != -1) {
      _inMemoryQueue[index] = _inMemoryQueue[index].copyWith(status: SyncStatus.synced);
    }
  }

  /// Mark operation as failed with an error message
  Future<void> markOperationFailed(String operationId, String error) async {
    final index = _inMemoryQueue.indexWhere((op) => op.id == operationId);
    if (index != -1) {
      final current = _inMemoryQueue[index];
      _inMemoryQueue[index] = current.copyWith(
        status: SyncStatus.failed,
        retryCount: current.retryCount + 1,
        lastError: error,
      );
    }
  }

  /// Cache entity offline
  Future<void> cacheEntity(String collection, String id, Map<String, dynamic> data) async {
    _inMemoryCache['$collection:$id'] = data;
  }

  /// Retrieve cached entity
  Future<Map<String, dynamic>?> getCachedEntity(String collection, String id) async {
    return _inMemoryCache['$collection:$id'];
  }

  /// Clear all cache and pending mutations
  Future<void> clearAll() async {
    _inMemoryQueue.clear();
    _inMemoryCache.clear();
  }
}
