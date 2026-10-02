// ============================================================================
// quant_core - unit tests: RefreshCoordinator single-flight semantics (S2)
// ============================================================================
//
// The coordinator is the S1 race fix shared by both refresh entry points
// (the silent scheduler and the 401-reactive interceptor delegate): it
// DEDUPES concurrent refresh attempts onto one in-flight future, because
// the backend rotates refresh tokens compare-and-set and a second concurrent
// `POST /oauth/token` would present the revoked token and kill the whole
// token family (forced sign-out).
//
// Run: `flutter test test/refresh_coordinator_test.dart` from the package root.

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  group('RefreshCoordinator.runSingleFlight', () {
    test('concurrent callers share one in-flight future', () async {
      final coordinator = RefreshCoordinator();
      var taskRuns = 0;
      final gate = Completer<void>();

      final first = coordinator.runSingleFlight(() async {
        taskRuns++;
        await gate.future;
      });
      final second = coordinator.runSingleFlight(() async {
        taskRuns++;
        await gate.future;
      });

      // Both callers receive the SAME future object.
      expect(identical(first, second), isTrue);

      await Future<void>.delayed(Duration.zero);
      expect(taskRuns, 1, reason: 'the task ran exactly once');

      gate.complete();
      await Future.wait([first, second]);
      expect(taskRuns, 1);
    });

    test('sequential calls after completion run the task again', () async {
      final coordinator = RefreshCoordinator();
      var taskRuns = 0;

      await coordinator.runSingleFlight(() async {
        taskRuns++;
      });
      expect(coordinator.isRefreshInFlight, isFalse);

      await coordinator.runSingleFlight(() async {
        taskRuns++;
      });
      expect(taskRuns, 2);
    });

    test('a throwing task propagates to all waiters and clears the slot',
        () async {
      // NOTE (S2 finding for W1): this exercises the error path. The
      // coordinator's `future.whenComplete(...)` creates a DERIVED future
      // that nobody listens to; when the refresh fails that derived future
      // completes with the same error and Dart reports it as an UNHANDLED
      // async error, failing the test run even though both waiters below
      // observe the error correctly. Fix (W1): swallow the derived
      // future's error, e.g.
      //   future.whenComplete(() { ... }).then<void>((_) {}, onError: (_) {});
      final coordinator = RefreshCoordinator();
      var taskRuns = 0;

      Future<void> failingTask() async {
        taskRuns++;
        throw StateError('refresh transport down');
      }

      final first = coordinator.runSingleFlight(failingTask);
      final second = coordinator.runSingleFlight(failingTask);

      await expectLater(first, throwsStateError);
      await expectLater(second, throwsStateError);
      expect(taskRuns, 1, reason: 'the task ran exactly once');

      // The slot is cleared on error: the next refresh starts fresh.
      await Future<void>.delayed(Duration.zero);
      expect(coordinator.isRefreshInFlight, isFalse);
      await coordinator.runSingleFlight(() async {
        taskRuns++;
      });
      expect(taskRuns, 2);
    });

    test('isRefreshInFlight tracks the in-flight window', () async {
      final coordinator = RefreshCoordinator();
      expect(coordinator.isRefreshInFlight, isFalse);

      final gate = Completer<void>();
      final pending = coordinator.runSingleFlight(() => gate.future);
      expect(coordinator.isRefreshInFlight, isTrue);

      gate.complete();
      await pending;
      // The slot clears in a whenComplete callback — one event-loop turn.
      await Future<void>.delayed(Duration.zero);
      expect(coordinator.isRefreshInFlight, isFalse);
    });

    test('a late caller arriving after completion starts a new attempt',
        () async {
      final coordinator = RefreshCoordinator();
      var taskRuns = 0;

      await coordinator.runSingleFlight(() async {
        taskRuns++;
      });
      // Arriving after the slot cleared: NOT deduped, runs again.
      final late = coordinator.runSingleFlight(() async {
        taskRuns++;
      });
      await late;
      expect(taskRuns, 2);
    });
  });

  group('refreshCoordinatorProvider', () {
    test('provides a shared coordinator instance', () async {
      // The provider is a plain (non-autoDispose) app-lifetime provider so
      // both refresh entry points share one gate. Smoke-check the shape.
      expect(refreshCoordinatorProvider.name, 'refreshCoordinatorProvider');
      expect(RefreshCoordinator().isRefreshInFlight, isFalse);
    });
  });
}
