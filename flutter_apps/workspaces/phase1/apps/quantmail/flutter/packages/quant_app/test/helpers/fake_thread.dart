// ============================================================================
// quant_app - fake thread notifier for widget tests (Phase 1, M5)
// ============================================================================
//
// Test double for [ThreadDetailNotifier]: serves a fixed [ThreadDetail]
// without touching the network, so widget tests never depend on backend
// availability. `refresh` is a no-op recorder and `markReadOptimistic`
// records its call and reports success — the screen's post-frame
// single-fire and the pull-to-refresh path can't escape the test.

import 'dart:async';

import 'package:quant_core/quant_core.dart';

enum _Mode { data, loading, error }

/// Deterministic [ThreadDetailNotifier] for tests.
class FakeThreadNotifier extends ThreadDetailNotifier {
  /// Serves [detail] as the provider's data.
  FakeThreadNotifier.data(this._detail) : _mode = _Mode.data;

  /// Never completes [build]: the provider stays in the first-load spinner.
  FakeThreadNotifier.loading()
      : _mode = _Mode.loading,
        _detail = null;

  /// [build] throws [ThreadDetailException]: the provider surfaces the error
  /// state (matches W1's "build never lets raw exceptions escape" contract).
  FakeThreadNotifier.error()
      : _mode = _Mode.error,
        _detail = null;

  final _Mode _mode;
  final ThreadDetail? _detail;

  /// True once [refresh] was called (pull-to-refresh / retry).
  bool refreshCalled = false;

  /// True once [markReadOptimistic] was called (screen open).
  bool markReadCalled = false;

  @override
  Future<ThreadDetail> build(String threadId) {
    switch (_mode) {
      case _Mode.data:
        return Future<ThreadDetail>.value(_detail!);
      case _Mode.loading:
        return Completer<ThreadDetail>().future;
      case _Mode.error:
        throw const ThreadDetailException('Thread failed to load.');
    }
  }

  @override
  Future<void> refresh() async {
    refreshCalled = true;
  }

  @override
  Future<bool> markReadOptimistic() async {
    markReadCalled = true;
    return true;
  }
}

/// Canned thread detail for tests: two messages, the first unread.
ThreadDetail fakeThreadDetail({List<Email>? messages}) {
  final DateTime now = DateTime.now();
  return ThreadDetail(
    summary: const ThreadSummary(
      id: 't-1',
      subject: 'Quarterly planning',
      messageCount: 2,
      isRead: false,
      participantNames: <String>['Asha', 'Ravi'],
    ),
    messages: messages ??
        <Email>[
          Email(
            id: 'm-1',
            threadId: 't-1',
            subject: 'Quarterly planning',
            snippet: 'Agenda attached for Thursday',
            from: const EmailAddress(
              email: 'asha@example.com',
              name: 'Asha',
            ),
            date: now.subtract(const Duration(hours: 2)),
            isRead: false,
          ),
          Email(
            id: 'm-2',
            threadId: 't-1',
            subject: 'Re: Quarterly planning',
            snippet: 'Looks good to me',
            from: const EmailAddress(
              email: 'ravi@example.com',
              name: 'Ravi',
            ),
            date: now.subtract(const Duration(minutes: 30)),
            isRead: true,
          ),
        ],
  );
}
