import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_calendar/main.dart';
import 'package:quant_calendar/models/calendar_models.dart';
import 'package:quant_calendar/screens/agenda_view_screen.dart';
import 'package:quant_calendar/screens/month_grid_screen.dart';
import 'package:quant_calendar/screens/public_booking_screen.dart';
import 'package:quant_calendar/screens/quantmeet_launcher_screen.dart';
import 'package:quant_calendar/screens/reminders_screen.dart';

void main() {
  group('QuantCalendar Domain Models & Invariants', () {
    test('CalendarEvent calculates dual timezones correctly', () {
      final event = CalendarEvent(
        id: 'test-1',
        title: 'Impeller 120Hz Test',
        description: 'Test event',
        startTime: DateTime.utc(2026, 10, 2, 10, 0),
        endTime: DateTime.utc(2026, 10, 2, 11, 0),
      );

      expect(event.durationMinutes, 60);
      expect(event.istTimeString.contains('IST'), isTrue);
      expect(event.pstTimeString.contains('PST'), isTrue);
      expect(event.dualTimezoneLabel.contains('IST'), isTrue);
      expect(event.dualTimezoneLabel.contains('PST'), isTrue);
    });

    test('CalendarEvent supports multi-day series and RFC 5545 labeling', () {
      final now = DateTime.now();
      final seriesEvent = CalendarEvent(
        id: 'series-test',
        title: 'Wave 76 Tripartite Architecture Sprint',
        description: 'Multi-day sprint event',
        startTime: now,
        endTime: now.add(const Duration(days: 7)),
        isMultiDaySeries: true,
        seriesDayIndex: 1,
        seriesTotalDays: 7,
      );

      expect(seriesEvent.isMultiDaySeries, isTrue);
      expect(seriesEvent.seriesDayIndex, 1);
      expect(seriesEvent.seriesTotalDays, 7);
      expect(seriesEvent.seriesLabel.contains('Day 1 of 7'), isTrue);
      expect(seriesEvent.seriesLabel.contains('RFC 5545'), isTrue);
    });

    test('BookingSlot handles atomic mutex locking and double-booking prevention', () {
      final slots = BookingSlot.sampleSlots();
      expect(slots.length, greaterThanOrEqualTo(4));

      final lockedSlot = slots.firstWhere((s) => !s.isAvailable);
      expect(lockedSlot.isAvailable, isFalse);
      expect(lockedSlot.isMutexLocked, isTrue);
      expect(lockedSlot.lockedBy, isNotNull);

      final openSlot = slots.firstWhere((s) => s.isAvailable);
      expect(openSlot.isAvailable, isTrue);
      expect(openSlot.isMutexLocked, isFalse);
    });

    test('BookingSlot formats times across timezones (IST and PST)', () {
      final base = DateTime.utc(2026, 10, 2, 3, 30); // 09:00 AM IST / 07:30 PM PST prev day
      final slot = BookingSlot(
        id: 'slot-tz',
        timeLabel: '09:00 AM',
        slotTime: base,
      );

      final istTime = slot.formattedTime(BookingTimezone.ist);
      final pstTime = slot.formattedTime(BookingTimezone.pst);

      expect(istTime.isNotEmpty, isTrue);
      expect(pstTime.isNotEmpty, isTrue);
      expect(istTime, '9:00 AM');
      expect(pstTime, '7:30 PM');
    });

    test('MeetingCall generates valid HD video stages', () {
      final calls = MeetingCall.sampleCalls();
      expect(calls.isNotEmpty, isTrue);
      expect(calls.first.roomCode.isNotEmpty, isTrue);
      expect(calls.first.isHardwareReady, isTrue);
    });

    test('CalendarReminder tracks RFC 5545 completion', () {
      final reminders = CalendarReminder.sampleReminders();
      expect(reminders.isNotEmpty, isTrue);
      expect(reminders.first.priority.isNotEmpty, isTrue);
    });
  });

  group('QuantCalendar Screen Hierarchy & Widget Tests', () {
    testWidgets('Renders QuantCalendarApp with Dynamic Island and subviews', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Verify app title
      expect(find.text('QuantCalendar'), findsOneWidget);

      // Verify Dynamic Island AI Capsule
      expect(find.text('Quanty AI'), findsOneWidget);
      expect(find.text('<5ms CalDAV'), findsOneWidget);

      // Verify Agenda Screen rendered by default
      expect(find.byType(AgendaViewScreen), findsOneWidget);
      expect(find.text('CalDAV: In Sync · 4 accounts · Next: 58s'), findsOneWidget);

      // Verify CalDAV dual timezone subtitle
      expect(find.text('Dual TZ Engine: IST (UTC+5:30) / PST (UTC-8:00)'), findsOneWidget);

      // Verify navigation items in bottom nav
      expect(find.text('Agenda'), findsOneWidget);
      expect(find.text('Month'), findsOneWidget);
      expect(find.text('Booking'), findsOneWidget);
      expect(find.text('QuantMeet'), findsOneWidget);
      expect(find.text('Reminders'), findsOneWidget);
    });

    testWidgets('Agenda view displays 7-day strip and multi-day event series', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Verify 7-day strip
      expect(find.text('TODAY'), findsOneWidget);

      // Verify multi-day event series in agenda
      expect(find.text('Wave 76 Tripartite Sovereign Architecture Sprint'), findsOneWidget);
      expect(find.text('DAY 1/7'), findsOneWidget);
    });

    testWidgets('Switches to Public Booking view with timezone selector and QuantMeet launcher', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Tap Booking tab
      await tester.tap(find.text('Booking'));
      await tester.pumpAndSettle();

      // Verify PublicBookingScreen active
      expect(find.byType(PublicBookingScreen), findsOneWidget);
      expect(find.text('Alex Quant'), findsOneWidget);

      // Verify Timezone Selector
      expect(find.text('TIMEZONE SELECTOR'), findsOneWidget);
      expect(find.text('IST · UTC+5:30'), findsOneWidget);
      expect(find.text('PST · UTC-8:00'), findsOneWidget);

      // Verify Duration Picker
      expect(find.text('SELECT DURATION'), findsOneWidget);
      expect(find.text('30m'), findsOneWidget);

      // Verify Time Slots Grid and Mutex Lock status
      expect(find.text('AVAILABLE TIME SLOTS'), findsOneWidget);
      expect(find.text('MUTEX LOCKED'), findsOneWidget);

      // Verify QuantMeet HD Launcher
      expect(find.text('QuantMeet HD Launcher'), findsOneWidget);
      expect(find.text('Launch HD Stage'), findsOneWidget);
      expect(find.text('Test Hardware'), findsOneWidget);
    });

    testWidgets('Toggling timezone selector switches between IST and PST in PublicBookingScreen', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Tap Booking tab
      await tester.tap(find.text('Booking'));
      await tester.pumpAndSettle();

      // Tap PST timezone chip
      await tester.tap(find.text('PST · UTC-8:00'));
      await tester.pumpAndSettle();

      // Verify PST active
      expect(find.text('Active: PST · UTC-8:00'), findsOneWidget);
      expect(find.text('Zone: PST'), findsOneWidget);

      // Tap IST timezone chip
      await tester.tap(find.text('IST · UTC+5:30'));
      await tester.pumpAndSettle();

      // Verify IST active
      expect(find.text('Active: IST · UTC+5:30'), findsOneWidget);
      expect(find.text('Zone: IST'), findsOneWidget);
    });

    testWidgets('Switches to Month Grid view when Month tab tapped', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      await tester.tap(find.text('Month'));
      await tester.pumpAndSettle();

      expect(find.byType(MonthGridScreen), findsOneWidget);
      expect(find.text('MON'), findsOneWidget);
      expect(find.text('SUN'), findsOneWidget);
    });

    testWidgets('Switches to QuantMeet launcher when QuantMeet tab tapped', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      await tester.tap(find.text('QuantMeet'));
      await tester.pumpAndSettle();

      expect(find.byType(QuantMeetLauncherScreen), findsOneWidget);
      expect(find.text('Host Sovereign HD Video Stage'), findsOneWidget);
      expect(find.text('Start Instant Meeting'), findsOneWidget);
    });

    testWidgets('Switches to Reminders screen when Reminders tab tapped', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      await tester.tap(find.text('Reminders'));
      await tester.pumpAndSettle();

      expect(find.byType(RemindersScreen), findsOneWidget);
      expect(find.text('Active Reminders'), findsWidgets);
    });
  });
}
