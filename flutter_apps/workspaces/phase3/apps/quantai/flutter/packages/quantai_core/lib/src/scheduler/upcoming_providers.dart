// ============================================================================
// quantai_core - upcoming scheduled work (blueprint §2.4 "Upcoming")
// ============================================================================
//
// One sorted list of what's coming: backend crons + local hooks. The honesty
// contract matters most here: the backend does NOT tell us a cron's next
// fire time (no `nextFireAt` in the ScheduledTasks contract), and hooks are
// event-driven (no schedule at all). So [UpcomingItem.nextAt] is nullable,
// and [honestLabel] ALWAYS says what we know and what we don't — the UI
// must render the label, never invent a time.
//
// Contract request (for backend-prep/app-foundations): a `nextFireAt` field
// on the task payload would make this list real instead of descriptive.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'hooks_models.dart';
import 'hooks_providers.dart';
import 'scheduler_models.dart';
import 'scheduler_providers.dart';

/// What kind of upcoming work an item is.
enum UpcomingKind { cron, hook }

/// One upcoming work item, honestly labeled.
class UpcomingItem {
  final String id;
  final String title;
  final UpcomingKind kind;

  /// When it will next run, when known. `null` = unknown (backend-owned
  /// schedule, or event-driven) — render [honestLabel], not a guess.
  final DateTime? nextAt;
  final String honestLabel;

  const UpcomingItem({
    required this.id,
    required this.title,
    required this.kind,
    this.nextAt,
    required this.honestLabel,
  });

  @override
  String toString() =>
      'UpcomingItem($kind, $title, nextAt: $nextAt)';
}

/// Source of upcoming items — lets tests feed fakes and the real provider
/// merge backend crons with local hooks.
abstract class UpcomingSource {
  Future<List<UpcomingItem>> upcomingItems();
}

/// Merges several item lists into one, sorted honestly: known times first
/// (ascending), unknown times last (stable order preserved).
List<UpcomingItem> mergeUpcoming(List<List<UpcomingItem>> sources) {
  final all = sources.expand((s) => s).toList();
  final known = all.where((i) => i.nextAt != null).toList()
    ..sort((a, b) => a.nextAt!.compareTo(b.nextAt!));
  final unknown = all.where((i) => i.nextAt == null).toList();
  return [...known, ...unknown];
}

UpcomingItem _cronItem(ScheduledTask task) {
  final cron = task.cronExpression;
  return UpcomingItem(
    id: 'cron:${task.id}',
    title: task.name,
    kind: UpcomingKind.cron,
    nextAt: null,
    honestLabel: cron == null || cron.isEmpty
        ? 'Server schedule par chalta hai — agla run backend batayega'
        : 'Server schedule par chalta hai ($cron) — agla run backend batayega',
  );
}

UpcomingItem _hookItem(Hook hook) {
  return UpcomingItem(
    id: 'hook:${hook.id}',
    title: hook.name,
    kind: UpcomingKind.hook,
    nextAt: null,
    honestLabel: hook.dryRun
        ? 'Event `${hook.trigger.event}` par propose karega (dry-run)'
        : 'Event `${hook.trigger.event}` par chalega',
  );
}

/// Upcoming scheduled work: active backend crons + local hooks, merged.
final upcomingWorkProvider = FutureProvider<List<UpcomingItem>>(
  (ref) async {
    final tasks =
        await ref.watch(scheduledTasksProvider(ScheduledTaskStatus.active).future);
    final hooks = await ref.watch(hooksProvider.future);
    return mergeUpcoming([
      tasks.map(_cronItem).toList(),
      hooks.map(_hookItem).toList(),
    ]);
  },
  name: 'upcomingWorkProvider',
);
