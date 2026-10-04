// ============================================================================
// quant_core - QuantClock + formatRelativeDate tests
//
// Pins the injectable-clock seam (VQA-P2-10): the system clock delegates
// to DateTime.now, the fake clock is mutable, clockProvider is
// overridable, and formatRelativeDate's buckets are deterministic under a
// fake clock.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  group('QuantClock', () {
    test('SystemQuantClock delegates to DateTime.now', () {
      final before = DateTime.now();
      final now = const SystemQuantClock().now();
      final after = DateTime.now();
      expect(
        now.isAfter(before) || now.isAtSameMomentAs(before),
        isTrue,
        reason: 'system clock reads the real time',
      );
      expect(
        now.isBefore(after) || now.isAtSameMomentAs(after),
        isTrue,
        reason: 'system clock reads the real time',
      );
    });

    test('FakeQuantClock is mutable via setTo', () {
      final clock = FakeQuantClock(DateTime(2026, 1, 1));
      expect(clock.now(), DateTime(2026, 1, 1));
      clock.setTo(DateTime(2026, 6, 15, 12, 30));
      expect(clock.now(), DateTime(2026, 6, 15, 12, 30));
    });

    test('clockProvider defaults to the system clock', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      expect(container.read(clockProvider), isA<SystemQuantClock>());
    });

    test('clockProvider is overridable with a pinned fake', () {
      final fake = FakeQuantClock(DateTime(2026, 10, 3, 12));
      final container = ProviderContainer(
        overrides: <Override>[
          clockProvider.overrideWithValue(fake),
        ],
      );
      addTearDown(container.dispose);
      expect(container.read(clockProvider).now(), DateTime(2026, 10, 3, 12));
    });
  });

  group('formatRelativeDate', () {
    // 2026-10-03 is a Saturday.
    final QuantClock clock = FakeQuantClock(DateTime(2026, 10, 3, 12, 0));

    test('null date renders empty', () {
      expect(formatRelativeDate(null, clock), '');
    });

    test('under a minute and future dates render "now"', () {
      final now = clock.now();
      expect(
        formatRelativeDate(now.subtract(const Duration(seconds: 30)), clock),
        'now',
      );
      expect(formatRelativeDate(now, clock), 'now');
      expect(
        formatRelativeDate(now.add(const Duration(hours: 1)), clock),
        'now',
      );
    });

    test('minutes render as "Nm"', () {
      expect(
        formatRelativeDate(
          clock.now().subtract(const Duration(minutes: 5)),
          clock,
        ),
        '5m',
      );
      expect(
        formatRelativeDate(
          clock.now().subtract(const Duration(minutes: 59)),
          clock,
        ),
        '59m',
      );
    });

    test('hours render as "Nh"', () {
      expect(
        formatRelativeDate(
          clock.now().subtract(const Duration(hours: 2)),
          clock,
        ),
        '2h',
      );
    });

    test('within a week renders the weekday', () {
      // Yesterday: Friday.
      expect(
        formatRelativeDate(
          clock.now().subtract(const Duration(days: 1)),
          clock,
        ),
        'Fri',
      );
      // 3 days ago: Wednesday.
      expect(
        formatRelativeDate(
          clock.now().subtract(const Duration(days: 3)),
          clock,
        ),
        'Wed',
      );
    });

    test('older dates this year render "Mon D"', () {
      expect(
        formatRelativeDate(DateTime(2026, 9, 20), clock),
        'Sep 20',
      );
    });

    test('older dates in a previous year include the year', () {
      expect(
        formatRelativeDate(DateTime(2025, 10, 2), clock),
        'Oct 2, 2025',
      );
    });

    test('output is fully determined by the injected clock', () {
      final date = DateTime(2026, 10, 2, 11, 0);
      final early = FakeQuantClock(DateTime(2026, 10, 3, 12, 0));
      final late = FakeQuantClock(DateTime(2026, 10, 10, 12, 0));
      expect(formatRelativeDate(date, early), 'Fri');
      expect(formatRelativeDate(date, late), 'Oct 2');
    });
  });
}
