// ============================================================================
// quantube_core - offline download manager contract + in-memory stub
// ============================================================================
//
// [DownloadManager] is the app-facing contract for offline downloads: one
// stream of [DownloadTask] snapshots plus the pause/resume/cancel/delete
// verbs. UI and future workers depend on this contract only — never on the
// concrete implementation.
//
// [InMemoryDownloadManager] is the HONEST stub: it keeps tasks in memory,
// emits snapshots, and SIMULATES byte progress with a timer. It performs NO
// real networking, NO disk writes, and forgets everything on restart.
// The production implementation (background_downloader + Drift, spec-gated)
// replaces it behind the same contract + [downloadManagerProvider].
//
// TODO(UNVERIFIED): real implementation pending — app-foundations/quantube
// spec must define the download endpoints/metadata first; then swap the
// provider override with a background_downloader + Drift manager that
// persists across restarts and survives process death.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'download_task.dart';

/// App-facing contract for offline downloads.
///
/// Implementations own a stream of [DownloadTask] snapshots: every state or
/// byte-count change must produce a fresh emission so `watch`ing widgets
/// rebuild. Verbs are idempotent where sensible (pause on a paused task is a
/// no-op); misdirected calls (e.g. `deleteDownloaded` on a non-complete
/// task) are safe no-ops.
abstract class DownloadManager {
  /// Broadcast stream of the current download list, newest-first.
  ///
  /// Emits the full current snapshot to each new subscriber, then every
  /// change afterwards.
  Stream<List<DownloadTask>> watchDownloads();

  /// Queue a video for offline download. No-op if an active (non-terminal)
  /// task for [videoId] already exists.
  Future<void> enqueue(String videoId);

  /// Pause an in-flight download. No-op unless it is downloading/queued.
  Future<void> pause(String id);

  /// Resume a paused (or failed — restarts) download. No-op if already
  /// downloading or complete.
  Future<void> resume(String id);

  /// Drop a download entirely (stops transfer, forgets the record).
  Future<void> cancel(String id);

  /// Remove a COMPLETED download (record + bytes). No-op for anything else.
  Future<void> deleteDownloaded(String videoId);
}

/// In-memory stub behind the [DownloadManager] contract.
///
/// Honest about what it is: tasks live in a map, byte progress is faked by
/// a 250 ms timer, and nothing survives a restart. Enough to build and demo
/// the library UI shell; NOT a download implementation.
class InMemoryDownloadManager implements DownloadManager {
  InMemoryDownloadManager() {
    _controller.onListen = _emit;
  }

  // -- Simulated transfer constants (NOT real network) -----------------------
  // TODO(UNVERIFIED): replace with Content-Length + background_downloader
  // byte stream once the spec exists.

  /// Fake total size handed to every stub task (48 MiB).
  static const int simulatedTotalBytes = 48 * 1024 * 1024;

  /// Fake bytes "transferred" per 250 ms tick (~2 MiB/s).
  static const int simulatedBytesPerTick = 512 * 1024;

  static const Duration _tickInterval = Duration(milliseconds: 250);

  final Map<String, DownloadTask> _tasks = <String, DownloadTask>{};
  final Map<String, Timer> _tickers = <String, Timer>{};
  final StreamController<List<DownloadTask>> _controller =
      StreamController<List<DownloadTask>>.broadcast();

  bool _disposed = false;

  @override
  Stream<List<DownloadTask>> watchDownloads() => _controller.stream;

  @override
  Future<void> enqueue(String videoId) async {
    final DownloadTask? existing = _tasks[videoId];
    if (existing != null && !existing.isTerminal) return; // idempotent
    _upsert(
      DownloadTask(
        videoId: videoId,
        // TODO(UNVERIFIED): fabricated for the UI shell — no metadata
        // endpoint exists yet. Re-source from the spec's video metadata.
        title: 'Video $videoId',
        totalBytes: simulatedTotalBytes,
        state: DownloadState.downloading,
      ),
    );
    _startTicker(videoId);
  }

  @override
  Future<void> pause(String id) async {
    final DownloadTask? task = _tasks[id];
    if (task == null) return;
    if (task.state != DownloadState.downloading &&
        task.state != DownloadState.queued) {
      return;
    }
    _stopTicker(id);
    _upsert(task.copyWith(state: DownloadState.paused));
  }

  @override
  Future<void> resume(String id) async {
    final DownloadTask? task = _tasks[id];
    if (task == null) return;
    switch (task.state) {
      case DownloadState.paused:
      case DownloadState.queued:
        _upsert(task.copyWith(state: DownloadState.downloading));
        _startTicker(id);
      case DownloadState.failed:
        // Retry from scratch: the partial file may be corrupt, and the stub
        // has no checksum to trust.
        _upsert(
          task.copyWith(
            state: DownloadState.downloading,
            downloadedBytes: 0,
            failureReason: null,
          ),
        );
        _startTicker(id);
      case DownloadState.downloading:
      case DownloadState.complete:
        break; // nothing to do
    }
  }

  @override
  Future<void> cancel(String id) async {
    _stopTicker(id);
    if (_tasks.remove(id) != null) _emit();
  }

  @override
  Future<void> deleteDownloaded(String videoId) async {
    final DownloadTask? task = _tasks[videoId];
    // Only completed downloads have bytes worth "deleting"; the real impl
    // removes the file from disk here.
    if (task != null && task.state == DownloadState.complete) {
      _tasks.remove(videoId);
      _emit();
    }
  }

  /// Releases timers + the stream. Call from `ref.onDispose` (see provider).
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    for (final Timer timer in _tickers.values) {
      timer.cancel();
    }
    _tickers.clear();
    unawaited(_controller.close());
  }

  void _startTicker(String videoId) {
    _stopTicker(videoId);
    _tickers[videoId] = Timer.periodic(_tickInterval, (_) {
      final DownloadTask? task = _tasks[videoId];
      if (task == null || task.state != DownloadState.downloading) {
        _stopTicker(videoId);
        return;
      }
      final int total = task.totalBytes ?? simulatedTotalBytes;
      final int next = task.downloadedBytes + simulatedBytesPerTick;
      if (next >= total) {
        _stopTicker(videoId);
        _upsert(
          task.copyWith(
            downloadedBytes: total,
            state: DownloadState.complete,
          ),
        );
      } else {
        _upsert(task.copyWith(downloadedBytes: next));
      }
    });
  }

  void _stopTicker(String videoId) {
    _tickers.remove(videoId)?.cancel();
  }

  void _upsert(DownloadTask task) {
    _tasks[task.videoId] = task;
    _emit();
  }

  void _emit() {
    if (_disposed || _controller.isClosed) return;
    // Newest activity first: active transfers above finished ones.
    final List<DownloadTask> snapshot = _tasks.values.toList()
      ..sort((DownloadTask a, DownloadTask b) {
        int rank(DownloadTask t) => switch (t.state) {
              DownloadState.downloading => 0,
              DownloadState.queued => 1,
              DownloadState.paused => 2,
              DownloadState.failed => 3,
              DownloadState.complete => 4,
            };
        return rank(a).compareTo(rank(b));
      });
    _controller.add(List<DownloadTask>.unmodifiable(snapshot));
  }
}

/// App-wide download manager, override-friendly for tests.
///
/// Defaults to [InMemoryDownloadManager] (stub — see class docs). The
/// production manager (background_downloader + Drift) will be provided here
/// via `overrideWithValue` / a real constructor once the spec lands.
final downloadManagerProvider = Provider<DownloadManager>(
  (ref) {
    final InMemoryDownloadManager manager = InMemoryDownloadManager();
    ref.onDispose(manager.dispose);
    return manager;
  },
  name: 'downloadManagerProvider',
);
