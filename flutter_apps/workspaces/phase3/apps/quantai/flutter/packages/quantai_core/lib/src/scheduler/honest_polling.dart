// ============================================================================
// quantai_core - honest-polling scheduler semantics (blueprint §3.5)
// ============================================================================
//
// QuantAI's scheduler NEVER promises "the moment it happens". It promises
// honest cadences — "main har 30 min me check karunga" — and the UI labels
// everything with the same honesty. Two more laws live here:
//
// 1. Pacing: proactive notifications are paced — at most 1/day, only during
//    waking hours (08:00–22:00 user-local by default); urgent notifications
//    bypass pacing but never silently.
// 2. Goals vs jobs: a goal is durable intent ("Hindi seekhna"), a job is an
//    execution ("har subah 8 baje vocab check karna"). [JobKind] keeps the
//    distinction visible in the UI so a missed tick is never confused with
//    a dropped goal.
//
// All time math is pure and clock-injected so tests never wait on real
// timers.

import 'dart:async';

/// Minimum honest polling interval. Anything shorter is not "checking", it
/// is polling theater — clamp it.
const Duration kMinPollInterval = Duration(minutes: 15);

/// Overdue grace: a check is overdue only after interval + 25% grace.
const double kOverdueGraceFactor = 1.25;

/// What kind of work a poll tick belongs to (goals vs jobs).
enum JobKind {
  /// A durable-intent progress check (e.g. "weekly goal review").
  goalCheck,

  /// A recurring execution (e.g. "har subah 8 baje news digest").
  recurring,

  /// A one-shot execution (fires once at [HonestPollSchedule.runOnceAt]).
  oneShot,
}

/// An honest polling schedule: when we will check, in plain words.
class HonestPollSchedule {
  /// Polling cadence. Clamped to at least [kMinPollInterval].
  final Duration interval;

  /// When the single execution happens (one-shot jobs only).
  final DateTime? runOnceAt;

  /// Human label of what is being checked (e.g. "naye emails").
  final String label;

  HonestPollSchedule({
    required Duration interval,
    this.runOnceAt,
    this.label = '',
  }) : interval =
            interval < kMinPollInterval ? kMinPollInterval : interval;

  /// Next check strictly after [from].
  DateTime nextCheckAt(DateTime from) {
    if (runOnceAt != null) return runOnceAt!;
    return from.add(interval);
  }

  /// The promise we show the user — cadence, never immediacy.
  ///
  /// Hinglish by default (QuantAI's primary voice); English on request.
  String honestPromise({bool hinglish = true}) {
    final every = _describeInterval(hinglish);
    if (runOnceAt != null) {
      return hinglish
          ? 'Main ${_formatTime(runOnceAt!)} par ek baar check karunga'
          : 'I will check once at ${_formatTime(runOnceAt!)}';
    }
    final what = label.isEmpty ? '' : hinglish ? ' $label' : ' $label';
    return hinglish
        ? 'Main har $every$what check karunga'
        : 'I will check every $every$what';
  }

  /// `true` when the last check is older than interval + grace.
  bool isOverdue(DateTime now, DateTime? lastCheck) {
    if (lastCheck == null) return true;
    final deadline = lastCheck.add(
      Duration(
        microseconds:
            (interval.inMicroseconds * kOverdueGraceFactor).round(),
      ),
    );
    return now.isAfter(deadline);
  }

  String _describeInterval(bool hinglish) {
    if (interval.inMinutes < 60) {
      final m = interval.inMinutes;
      return hinglish ? '$m min me' : '$m minutes';
    }
    if (interval.inHours < 24 && interval.inMinutes % 60 == 0) {
      final h = interval.inHours;
      return hinglish ? '$h ghante me' : '$h hours';
    }
    if (interval.inHours < 24) {
      return hinglish
          ? '${interval.inHours} ghante ${interval.inMinutes % 60} min me'
          : '${interval.inHours}h ${interval.inMinutes % 60}m';
    }
    final d = interval.inDays;
    return hinglish ? '$d din me' : '$d days';
  }

  static String _formatTime(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:'
      '${t.minute.toString().padLeft(2, '0')}';

  @override
  String toString() =>
      'HonestPollSchedule(interval: $interval, runOnceAt: $runOnceAt)';
}

/// Why a proactive notification may (not) fire right now.
enum PollDecision {
  allowed,
  blockedDailyCap,
  blockedWakingHours,
  urgentBypass,
}

/// Pacing enforcement for proactive notifications (blueprint §3.5):
/// at most [maxPerDay] proactive notifications per calendar day, only
/// inside the waking-hours window; [urgent] bypasses but is still labeled
/// as a bypass so the UI can say so honestly.
class PollGovernor {
  final int maxPerDay;
  final int wakingStartHour;
  final int wakingEndHour;

  const PollGovernor({
    this.maxPerDay = 1,
    this.wakingStartHour = 8,
    this.wakingEndHour = 22,
  });

  PollDecision canNotify({
    required bool urgent,
    required DateTime now,
    required int notifiedToday,
  }) {
    if (urgent) return PollDecision.urgentBypass;
    final hour = now.hour;
    if (hour < wakingStartHour || hour >= wakingEndHour) {
      return PollDecision.blockedWakingHours;
    }
    if (notifiedToday >= maxPerDay) return PollDecision.blockedDailyCap;
    return PollDecision.allowed;
  }
}

/// One poll tick: what was scheduled, when it actually ran, and the drift.
class PollTick {
  final DateTime scheduledAt;
  final DateTime actualAt;
  final JobKind kind;

  const PollTick({
    required this.scheduledAt,
    required this.actualAt,
    required this.kind,
  });

  /// How late the tick ran vs its schedule.
  Duration get drift => actualAt.difference(scheduledAt);

  @override
  String toString() =>
      'PollTick(kind: $kind, drift: ${drift.inMilliseconds}ms)';
}

/// Factory for timers, injectable in tests.
typedef PollTimerFactory = Timer Function(
  Duration duration,
  void Function() callback,
);

/// The honest engine: fires [check] at each [HonestPollSchedule.nextCheckAt],
/// tracks last/next check and missed checks, and broadcasts ticks.
///
/// A missed check is counted (not silently skipped): if the timer fires late
/// or the callback throws, [missedChecks] grows and the tick still goes out
/// labeled with its drift.
class PollTicker {
  final HonestPollSchedule schedule;
  final JobKind kind;
  final Future<void> Function() check;
  final DateTime Function() clock;
  final PollTimerFactory timerFactory;

  Timer? _timer;
  DateTime? _lastCheckAt;
  DateTime? _nextCheckAt;
  int _missedChecks = 0;
  bool _disposed = false;

  final _ticks = StreamController<PollTick>.broadcast();

  PollTicker({
    required this.schedule,
    required this.check,
    this.kind = JobKind.recurring,
    DateTime Function()? clock,
    PollTimerFactory? timerFactory,
  })  : clock = clock ?? DateTime.now,
        timerFactory = timerFactory ?? _defaultTimer;

  static Timer _defaultTimer(Duration d, void Function() cb) =>
      Timer(d, cb);

  Stream<PollTick> get ticks => _ticks.stream;
  DateTime? get lastCheckAt => _lastCheckAt;
  DateTime? get nextCheckAt => _nextCheckAt;
  int get missedChecks => _missedChecks;
  bool get isRunning => _timer != null;

  /// Starts (or restarts) the ticker from [clock] now.
  void start() {
    if (_disposed) return;
    _timer?.cancel();
    _arm(clock());
  }

  /// Stops the ticker. Safe to call when not running.
  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// Stops the ticker and releases the tick stream.
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    stop();
    _ticks.close();
  }

  void _arm(DateTime from) {
    if (_disposed) return;
    final next = schedule.nextCheckAt(from);
    _nextCheckAt = next;
    var delay = next.difference(clock());
    if (delay.isNegative) delay = Duration.zero;
    _timer = timerFactory(delay, () => _fire(next));
  }

  Future<void> _fire(DateTime scheduledAt) async {
    final actualAt = clock();
    try {
      await check();
      _lastCheckAt = actualAt;
    } catch (_) {
      _missedChecks++;
    }
    if (!_ticks.isClosed) {
      _ticks.add(PollTick(
        scheduledAt: scheduledAt,
        actualAt: actualAt,
        kind: kind,
      ));
    }
    _arm(actualAt);
  }
}
