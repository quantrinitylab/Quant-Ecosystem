// ============================================================================
// quantai_core - scheduler engine: cron/hook Dart models
// ============================================================================
//
// Models for QuantAI's proactive scheduler. Backend contract: the
// ScheduledTasks endpoints in `app-foundations/quantai/openapi.yaml`
// (L3597-L3747). Hooks (event-driven, dry-run gated) have NO backend
// endpoint yet — see `hooks_models.dart`; they are local-only for now.
//
// Parsing is defensive: the backend sometimes returns camelCase and
// sometimes snake_case field names (see the doubled-prefix mess in the
// foundation notes), so `fromJson` checks both and prefers camelCase.

/// Wire status of a scheduled task.
///
/// spec: app-foundations/quantai/openapi.yaml L3617
/// (`status` query enum: ACTIVE, PAUSED, CANCELLED, COMPLETED).
enum ScheduledTaskStatus {
  active('ACTIVE'),
  paused('PAUSED'),
  cancelled('CANCELLED'),
  completed('COMPLETED');

  final String wireValue;

  const ScheduledTaskStatus(this.wireValue);

  static ScheduledTaskStatus fromWire(String? wire) {
    switch (wire?.toUpperCase()) {
      case 'ACTIVE':
        return ScheduledTaskStatus.active;
      case 'PAUSED':
        return ScheduledTaskStatus.paused;
      case 'CANCELLED':
        return ScheduledTaskStatus.cancelled;
      case 'COMPLETED':
        return ScheduledTaskStatus.completed;
      default:
        return ScheduledTaskStatus.active;
    }
  }
}

/// A recurring (or one-shot) agent task managed by the QuantAI backend.
///
/// spec: app-foundations/quantai/openapi.yaml L3617-L3710.
class ScheduledTask {
  final String id;
  final String name;
  final String? description;
  final String? cronExpression;
  final String? nlPrompt;
  final String? agentId;
  final String? actionPrompt;
  final String? targetApp;
  final List<String> targetApps;
  final ScheduledTaskStatus status;
  final Map<String, dynamic> config;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const ScheduledTask({
    required this.id,
    required this.name,
    this.description,
    this.cronExpression,
    this.nlPrompt,
    this.agentId,
    this.actionPrompt,
    this.targetApp,
    this.targetApps = const [],
    this.status = ScheduledTaskStatus.active,
    this.config = const {},
    this.createdAt,
    this.updatedAt,
  });

  factory ScheduledTask.fromJson(Map<String, dynamic> json) {
    final apps = json['targetApps'] ?? json['target_apps'];
    return ScheduledTask(
      id: _str(json, 'id') ?? '',
      name: _str(json, 'name') ?? '',
      description: _str(json, 'description'),
      cronExpression:
          _str(json, 'cronExpression') ?? _str(json, 'cron_expression'),
      nlPrompt: _str(json, 'nlPrompt') ?? _str(json, 'nl_prompt'),
      agentId: _str(json, 'agentId') ?? _str(json, 'agent_id'),
      actionPrompt:
          _str(json, 'actionPrompt') ?? _str(json, 'action_prompt'),
      targetApp: _str(json, 'targetApp') ?? _str(json, 'target_app'),
      targetApps: apps is List
          ? apps.map((e) => '$e').toList()
          : const <String>[],
      status: ScheduledTaskStatus.fromWire(
        _str(json, 'status'),
      ),
      config: _map(json, 'config') ?? const {},
      createdAt: _date(json, 'createdAt') ?? _date(json, 'created_at'),
      updatedAt: _date(json, 'updatedAt') ?? _date(json, 'updated_at'),
    );
  }

  /// Body for `POST /agents/scheduled/` (only non-null fields are sent).
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3617
  /// (`createScheduledTask`: name/description/cronExpression/nlPrompt/
  /// agentId/actionPrompt/targetApp/targetApps/config).
  Map<String, dynamic> toCreateJson() {
    return {
      'name': name,
      if (description != null) 'description': description,
      if (cronExpression != null) 'cronExpression': cronExpression,
      if (nlPrompt != null) 'nlPrompt': nlPrompt,
      if (agentId != null) 'agentId': agentId,
      if (actionPrompt != null) 'actionPrompt': actionPrompt,
      if (targetApp != null) 'targetApp': targetApp,
      if (targetApps.isNotEmpty) 'targetApps': targetApps,
      'config': config,
    };
  }

  ScheduledTask copyWith({
    String? id,
    String? name,
    String? description,
    String? cronExpression,
    String? nlPrompt,
    String? agentId,
    String? actionPrompt,
    String? targetApp,
    List<String>? targetApps,
    ScheduledTaskStatus? status,
    Map<String, dynamic>? config,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return ScheduledTask(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      cronExpression: cronExpression ?? this.cronExpression,
      nlPrompt: nlPrompt ?? this.nlPrompt,
      agentId: agentId ?? this.agentId,
      actionPrompt: actionPrompt ?? this.actionPrompt,
      targetApp: targetApp ?? this.targetApp,
      targetApps: targetApps ?? this.targetApps,
      status: status ?? this.status,
      config: config ?? this.config,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() =>
      'ScheduledTask(id: $id, name: $name, status: ${status.wireValue}, '
      'cron: $cronExpression)';
}

/// Preview returned by `POST /agents/scheduled/parse`.
///
/// spec: app-foundations/quantai/openapi.yaml L3597
/// (`parseScheduleTrigger`: parses a natural-language trigger into a cron
/// preview). The exact payload shape is NOT spec-documented — parsed
/// defensively, flagged TODO(UNVERIFIED).
class ScheduleParsePreview {
  final String? cronExpression;
  final String? humanSummary;
  final Map<String, dynamic> raw;

  const ScheduleParsePreview({
    this.cronExpression,
    this.humanSummary,
    this.raw = const {},
  });

  // TODO(UNVERIFIED): payload field names for the parse preview are not
  // spec-documented; this factory reads `cronExpression`/`humanSummary` and
  // falls back to common alternates.
  factory ScheduleParsePreview.fromJson(Map<String, dynamic> json) {
    return ScheduleParsePreview(
      cronExpression: _str(json, 'cronExpression') ??
          _str(json, 'cron_expression') ??
          _str(json, 'cron'),
      humanSummary: _str(json, 'humanSummary') ??
          _str(json, 'summary') ??
          _str(json, 'description'),
      raw: json,
    );
  }
}

/// One execution-ledger entry of a scheduled task.
///
/// spec: app-foundations/quantai/openapi.yaml L3723-L3747
/// (`listTaskRuns` / `getTaskRun`).
class TaskRun {
  final String runId;
  final String taskId;
  final String status;
  final DateTime? startedAt;
  final DateTime? finishedAt;
  final String? error;
  final String? resultSummary;

  const TaskRun({
    required this.runId,
    required this.taskId,
    required this.status,
    this.startedAt,
    this.finishedAt,
    this.error,
    this.resultSummary,
  });

  // TODO(UNVERIFIED): run payload field names are not spec-documented.
  factory TaskRun.fromJson(Map<String, dynamic> json) {
    return TaskRun(
      runId: _str(json, 'runId') ?? _str(json, 'run_id') ?? '',
      taskId: _str(json, 'taskId') ?? _str(json, 'task_id') ?? '',
      status: _str(json, 'status') ?? 'UNKNOWN',
      startedAt:
          _date(json, 'startedAt') ?? _date(json, 'started_at'),
      finishedAt:
          _date(json, 'finishedAt') ?? _date(json, 'finished_at'),
      error: _str(json, 'error') ?? _str(json, 'errorMessage'),
      resultSummary:
          _str(json, 'resultSummary') ?? _str(json, 'result_summary'),
    );
  }

  @override
  String toString() =>
      'TaskRun(runId: $runId, taskId: $taskId, status: $status)';
}

// -- parsing helpers --------------------------------------------------------

String? _str(Map<String, dynamic> json, String key) {
  final value = json[key];
  return value is String ? value : null;
}

Map<String, dynamic>? _map(Map<String, dynamic> json, String key) {
  final value = json[key];
  return value is Map<String, dynamic> ? value : null;
}

DateTime? _date(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String) return DateTime.tryParse(value);
  return null;
}
