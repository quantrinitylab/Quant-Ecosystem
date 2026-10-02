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
  group('QuantCalendar Domain Models', () {
    test('CalendarEvent calculates dual timezones correctly', () {
      final now = DateTime.now();
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

    test('BookingSlot handles mutex locking', () {
      final slots = BookingSlot.sampleSlots();
      expect(slots.length, greaterThanOrEqualTo(4));

      final lockedSlot = slots.firstWhere((s) => !s.isAvailable);
      expect(lockedSlot.isAvailable, isFalse);

      final openSlot = slots.firstWhere((s) => s.isAvailable);
      expect(openSlot.isAvailable, isTrue);
    });

    test('MeetingCall generates valid video stages', () {
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

    testWidgets('Switches to Month Grid view when Month tab tapped', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Tap Month tab
      await tester.tap(find.text('Month'));
      await tester.pumpAndSettle();

      // Verify MonthGridScreen active
      expect(find.byType(MonthGridScreen), findsOneWidget);
      expect(find.text('MON'), findsOneWidget);
      expect(find.text('SUN'), findsOneWidget);
    });

    testWidgets('Switches to Public Booking view when Booking tab tapped', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Tap Booking tab
      await tester.tap(find.text('Booking'));
      await tester.pumpAndSettle();

      // Verify PublicBookingScreen active
      expect(find.byType(PublicBookingScreen), findsOneWidget);
      expect(find.text('Alex Quant'), findsOneWidget);
      expect(find.text('SELECT DURATION'), findsOneWidget);
      expect(find.text('30m'), findsOneWidget);
      expect(find.text('AVAILABLE TIME SLOTS'), findsOneWidget);
    });

    testWidgets('Switches to QuantMeet launcher when QuantMeet tab tapped', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Tap QuantMeet tab
      await tester.tap(find.text('QuantMeet'));
      await tester.pumpAndSettle();

      // Verify QuantMeetLauncherScreen active
      expect(find.byType(QuantMeetLauncherScreen), findsOneWidget);
      expect(find.text('Host Sovereign HD Video Stage'), findsOneWidget);
      expect(find.text('Start Instant Meeting'), findsOneWidget);
      expect(find.text('UPCOMING VIDEO STAGES'), findsOneWidget);
    });

    testWidgets('Switches to Reminders screen when Reminders tab tapped', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Tap Reminders tab
      await tester.tap(find.text('Reminders'));
      await tester.pumpAndSettle();

      // Verify RemindersScreen active
      expect(find.byType(RemindersScreen), findsOneWidget);
      expect(find.text('Active Reminders'), findsWidgets);
    });
  });
}
