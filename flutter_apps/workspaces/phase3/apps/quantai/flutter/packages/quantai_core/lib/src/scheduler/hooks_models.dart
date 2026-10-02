// ============================================================================
// quantai_core - scheduler hooks: event-driven, dry-run gated (blueprint §3.5)
// ============================================================================
//
// Hooks are the event-driven sibling of crons. The backend currently exposes
// NO hooks endpoint (`app-foundations/quantai/openapi.yaml` only has the
// ScheduledTasks `/agents/scheduled/*` operations), so hooks are LOCAL-ONLY
// for now: definitions + run ledger live in [HooksRepository] in memory.
// The repository interface is shaped so a future `HooksApi` slots in without
// touching callers.
//
// The iron law of hooks: a dry run NEVER executes — it proposes. The user
// sees `proposalSummary` ("main ye karne wala tha") and approves, or the
// hook stays a proposal forever.

/// What event fires a hook (e.g. `mail.received`, `chat.mentioned`,
/// `time.morning`).
class HookTrigger {
  final String event;
  final Map<String, dynamic> filter;
  final Duration debounce;

  const HookTrigger({
    required this.event,
    this.filter = const {},
    this.debounce = const Duration(minutes: 5),
  });

  factory HookTrigger.fromJson(Map<String, dynamic> json) {
    final rawDebounce = json['debounceMinutes'] ?? json['debounce_minutes'];
    return HookTrigger(
      event: json['event'] is String ? json['event'] as String : '',
      filter: json['filter'] is Map<String, dynamic>
          ? json['filter'] as Map<String, dynamic>
          : const {},
      debounce: rawDebounce is num
          ? Duration(minutes: rawDebounce.toInt())
          : const Duration(minutes: 5),
    );
  }

  Map<String, dynamic> toJson() => {
        'event': event,
        'filter': filter,
        'debounceMinutes': debounce.inMinutes,
      };

  @override
  String toString() => 'HookTrigger($event, debounce: $debounce)';
}

/// What a dry run / execution of a hook produced.
enum HookOutcome {
  /// The dry run produced a proposal; nothing executed.
  proposed,

  /// The hook executed (only possible when dryRun=false and approved).
  executed,

  /// Execution was blocked waiting for user approval.
  blockedByApproval,

  failed,
}

/// One hook execution-ledger entry.
class HookRun {
  final String hookId;
  final bool dryRun;
  final DateTime startedAt;
  final DateTime? finishedAt;
  final HookOutcome outcome;
  final String? proposalSummary;
  final String? error;

  const HookRun({
    required this.hookId,
    required this.dryRun,
    required this.startedAt,
    this.finishedAt,
    required this.outcome,
    this.proposalSummary,
    this.error,
  });

  factory HookRun.fromJson(Map<String, dynamic> json) {
    return HookRun(
      hookId: json['hookId'] is String ? json['hookId'] as String : '',
      dryRun: json['dryRun'] is bool ? json['dryRun'] as bool : true,
      startedAt: json['startedAt'] is String
          ? DateTime.tryParse(json['startedAt'] as String) ?? DateTime.now()
          : DateTime.now(),
      finishedAt: json['finishedAt'] is String
          ? DateTime.tryParse(json['finishedAt'] as String)
          : null,
      outcome: _outcomeFrom(json['outcome']),
      proposalSummary: json['proposalSummary'] is String
          ? json['proposalSummary'] as String
          : null,
      error: json['error'] is String ? json['error'] as String : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'hookId': hookId,
        'dryRun': dryRun,
        'startedAt': startedAt.toIso8601String(),
        if (finishedAt != null)
          'finishedAt': finishedAt!.toIso8601String(),
        'outcome': outcome.name,
        if (proposalSummary != null) 'proposalSummary': proposalSummary,
        if (error != null) 'error': error,
      };

  static HookOutcome _outcomeFrom(Object? raw) {
    switch ('$raw') {
      case 'proposed':
        return HookOutcome.proposed;
      case 'executed':
        return HookOutcome.executed;
      case 'blockedByApproval':
        return HookOutcome.blockedByApproval;
      case 'failed':
        return HookOutcome.failed;
      default:
        return HookOutcome.proposed;
    }
  }

  @override
  String toString() =>
      'HookRun(hookId: $hookId, dryRun: $dryRun, outcome: $outcome)';
}

/// An event-driven hook definition.
///
/// TODO(UNVERIFIED): no backend contract exists for hooks; `toJson` follows
/// the ScheduledTasks field conventions so a future `/agents/hooks/*`
/// endpoint can adopt it with minimal churn.
class Hook {
  final String id;
  final String name;
  final String description;
  final HookTrigger trigger;

  /// The agent prompt to run when the trigger fires.
  final String actionPrompt;

  /// Dry-run gate: `true` = propose only, never execute (the default, and
  /// the only honest default).
  final bool dryRun;

  /// State-changing hooks require a user approval card before execution.
  final bool requiresApproval;
  final DateTime? createdAt;

  const Hook({
    required this.id,
    required this.name,
    this.description = '',
    required this.trigger,
    required this.actionPrompt,
    this.dryRun = true,
    this.requiresApproval = true,
    this.createdAt,
  });

  factory Hook.fromJson(Map<String, dynamic> json) {
    return Hook(
      id: json['id'] is String ? json['id'] as String : '',
      name: json['name'] is String ? json['name'] as String : '',
      description:
          json['description'] is String ? json['description'] as String : '',
      trigger: json['trigger'] is Map<String, dynamic>
          ? HookTrigger.fromJson(json['trigger'] as Map<String, dynamic>)
          : const HookTrigger(event: ''),
      actionPrompt: json['actionPrompt'] is String
          ? json['actionPrompt'] as String
          : (json['action_prompt'] is String
              ? json['action_prompt'] as String
              : ''),
      dryRun: json['dryRun'] is bool ? json['dryRun'] as bool : true,
      requiresApproval: json['requiresApproval'] is bool
          ? json['requiresApproval'] as bool
          : true,
      createdAt: json['createdAt'] is String
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'trigger': trigger.toJson(),
        'actionPrompt': actionPrompt,
        'dryRun': dryRun,
        'requiresApproval': requiresApproval,
        if (createdAt != null)
          'createdAt': createdAt!.toIso8601String(),
      };

  Hook copyWith({
    String? id,
    String? name,
    String? description,
    HookTrigger? trigger,
    String? actionPrompt,
    bool? dryRun,
    bool? requiresApproval,
    DateTime? createdAt,
  }) {
    return Hook(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      trigger: trigger ?? this.trigger,
      actionPrompt: actionPrompt ?? this.actionPrompt,
      dryRun: dryRun ?? this.dryRun,
      requiresApproval: requiresApproval ?? this.requiresApproval,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  String toString() => 'Hook(id: $id, name: $name, dryRun: $dryRun)';
}
