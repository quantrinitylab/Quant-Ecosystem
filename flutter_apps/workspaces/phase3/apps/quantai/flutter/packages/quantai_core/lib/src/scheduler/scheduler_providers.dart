// ============================================================================
// quantai_core - scheduler Riverpod providers
// ============================================================================
//
// Provider graph for the scheduler engine:
//
//   apiClientProvider ──▶ schedulerApiProvider ──▶ scheduledTasksProvider
//        (family: ScheduledTaskStatus?)            scheduledTaskProvider
//                                                 (family: String)
//                                                 taskRunsProvider
//                                                 (family: String)

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import 'scheduler_api.dart';
import 'scheduler_models.dart';

/// Typed scheduled-tasks API over the shared [QuantAiApiClient].
final schedulerApiProvider = Provider<SchedulerApi>(
  (ref) => SchedulerApi(
    transport: QuantAiSchedulerTransport(ref.watch(apiClientProvider)),
  ),
  name: 'schedulerApiProvider',
);

/// The caller's scheduled tasks, optionally filtered by [status].
///
/// A `null` status lists everything (no `status` query param is sent).
final scheduledTasksProvider =
    FutureProvider.family<List<ScheduledTask>, ScheduledTaskStatus?>(
  (ref, status) =>
      ref.watch(schedulerApiProvider).listTasks(status: status),
  name: 'scheduledTasksProvider',
);

/// One scheduled task by id.
final scheduledTaskProvider =
    FutureProvider.family<ScheduledTask, String>(
  (ref, id) => ref.watch(schedulerApiProvider).getTask(id),
  name: 'scheduledTaskProvider',
);

/// Execution-ledger history of one task (latest 50 runs).
final taskRunsProvider = FutureProvider.family<List<TaskRun>, String>(
  (ref, taskId) =>
      ref.watch(schedulerApiProvider).listRuns(taskId, limit: 50),
  name: 'taskRunsProvider',
);
