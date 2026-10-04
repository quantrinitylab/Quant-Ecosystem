// ============================================================================
// quant_core - injectable clock (VQA-P2-10)
//
// Relative-date labels used `DateTime.now()` directly, which broke golden
// determinism (weekday labels flip at UTC-midnight — visual-qa had to work
// around it with >=8-day samples) and made timestamp formatting
// untestable. [QuantClock] is the injectable seam: production code watches
// [clockProvider] (a [SystemQuantClock]); tests override it with a
// [FakeQuantClock] pinned at a fixed instant.
//
// [formatRelativeDate] is the single shared formatter for inbox rows and
// thread message cards ("now" / "5m" / "2h" / "Tue" / "Oct 2" /
// "Oct 2, 2025"), so the two screens can never drift apart again.

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Injectable "now" seam. Call [now] once per format pass and reuse the
/// result so a single render never straddles a clock tick.
abstract class QuantClock {
  /// The current instant.
  DateTime now();
}

/// Production clock: delegates to [DateTime.now].
class SystemQuantClock implements QuantClock {
  /// Creates the system clock.
  const SystemQuantClock();

  @override
  DateTime now() => DateTime.now();
}

/// Test clock with a mutable instant.
class FakeQuantClock implements QuantClock {
  /// Creates a fake clock pinned at [initial].
  FakeQuantClock(DateTime initial) : _now = initial;

  DateTime _now;

  /// Moves the clock to [value].
  void setTo(DateTime value) => _now = value;

  @override
  DateTime now() => _now;
}

/// The app's clock: a [SystemQuantClock] by default, overridable per test
/// with `clockProvider.overrideWithValue(FakeQuantClock(...))`.
final clockProvider = Provider<QuantClock>(
  (ref) => const SystemQuantClock(),
  name: 'clockProvider',
);

/// Compact relative date for list rows and message cards, driven by
/// [clock] instead of `DateTime.now()` so the output is deterministic in
/// tests and golden screenshots.
///
/// Buckets: "now" (< 1m, or future) / "5m" / "2h" / "Tue" (< 7d) /
/// "Oct 2" (this year) / "Oct 2, 2025". Returns '' for a null [date].
String formatRelativeDate(DateTime? date, QuantClock clock) {
  if (date == null) return '';
  final DateTime now = clock.now();
  final Duration diff = now.difference(date);
  if (diff.isNegative || diff.inMinutes < 1) return 'now';
  if (diff.inHours < 1) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return _weekdayShort(date.weekday);
  if (now.year == date.year) return '${_monthShort(date.month)} ${date.day}';
  return '${_monthShort(date.month)} ${date.day}, ${date.year}';
}

String _weekdayShort(int weekday) {
  const List<String> names = <String>[
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun'
  ];
  return names[weekday - 1];
}

String _monthShort(int month) {
  const List<String> names = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  return names[month - 1];
}
