import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

import 'package:quant_calendar/main.dart';
import 'package:quant_calendar/models/calendar_models.dart';
import 'package:quant_calendar/screens/agenda_view_screen.dart';
import 'package:quant_calendar/screens/month_grid_screen.dart';
import 'package:quant_calendar/screens/public_booking_screen.dart';
import 'package:quant_calendar/screens/quantmeet_launcher_screen.dart';
import 'package:quant_calendar/screens/reminders_screen.dart';
import 'package:quant_calendar/screens/event_editor_sheet.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ===========================================================================
  // 1. DOMAIN MODELS & DUAL-TIMEZONE MATH UNIT TESTS
  // ===========================================================================
  group('QuantCalendar Domain Models & Timezone Math', () {
    test('BookingTimezone: Validates UTC offsets, labels, and codes', () {
      expect(BookingTimezone.values.length, 5);

      // IST: UTC+5:30
      expect(BookingTimezone.ist.code, 'IST');
      expect(BookingTimezone.ist.offset, const Duration(hours: 5, minutes: 30));
      expect(BookingTimezone.ist.effectiveOffset, const Duration(hours: 5, minutes: 30));

      // PST: UTC-8:00
      expect(BookingTimezone.pst.code, 'PST');
      expect(BookingTimezone.pst.offset, const Duration(hours: -8));
      expect(BookingTimezone.pst.effectiveOffset, const Duration(hours: -8));

      // EST: UTC-5:00
      expect(BookingTimezone.est.code, 'EST');
      expect(BookingTimezone.est.offset, const Duration(hours: -5));

      // UTC: +0:00
      expect(BookingTimezone.utc.code, 'UTC');
      expect(BookingTimezone.utc.offset, Duration.zero);

      // Local: Dynamic system offset
      expect(BookingTimezone.local.code, 'LOCAL');
      expect(BookingTimezone.local.effectiveOffset, DateTime.now().timeZoneOffset);
    });

    test('BookingTimezone: Real-time timezone conversion and formatTime math', () {
      // 10:00 AM UTC reference
      final testUtcTime = DateTime.utc(2026, 10, 2, 10, 0);

      // In IST (UTC+5:30): 10:00 + 5:30 = 15:30 (03:30 PM)
      expect(BookingTimezone.ist.formatTime(testUtcTime), '3:30 PM');
      expect(BookingTimezone.ist.formatTimeWithZone(testUtcTime), '3:30 PM IST');

      // In PST (UTC-8:00): 10:00 - 8:00 = 02:00 (02:00 AM)
      expect(BookingTimezone.pst.formatTime(testUtcTime), '2:00 AM');
      expect(BookingTimezone.pst.formatTimeWithZone(testUtcTime), '2:00 AM PST');

      // In EST (UTC-5:00): 10:00 - 5:00 = 05:00 (05:00 AM)
      expect(BookingTimezone.est.formatTime(testUtcTime), '5:00 AM');
      expect(BookingTimezone.est.formatTimeWithZone(testUtcTime), '5:00 AM EST');

      // Time difference delta between IST (+5:30) and PST (-8:00) is 13 hours 30 mins
      final delta = BookingTimezone.timeDifferenceString(BookingTimezone.ist, BookingTimezone.pst);
      expect(delta.contains('13h 30m delta'), isTrue);
    });

    test('BookingSlot: Formatted slot intervals for 15m, 30m, and 60m durations', () {
      final baseUtc = DateTime.utc(2026, 10, 2, 3, 30); // 09:00 AM IST
      final slot = BookingSlot(
        id: 'slot-test-1',
        timeLabel: '09:00 AM',
        slotTime: baseUtc,
        durationMinutes: 30,
        isAvailable: true,
      );

      // Start time in IST
      expect(slot.formattedTime(BookingTimezone.ist), '9:00 AM');

      // 15m end time
      expect(slot.formattedEndTime(BookingTimezone.ist, 15), '9:15 AM');
      expect(slot.formattedSlotRange(BookingTimezone.ist, 15), '9:00 AM - 9:15 AM IST');

      // 30m end time
      expect(slot.formattedEndTime(BookingTimezone.ist, 30), '9:30 AM');
      expect(slot.formattedSlotRange(BookingTimezone.ist, 30), '9:00 AM - 9:30 AM IST');

      // 60m end time
      expect(slot.formattedEndTime(BookingTimezone.ist, 60), '10:00 AM');
      expect(slot.formattedSlotRange(BookingTimezone.ist, 60), '9:00 AM - 10:00 AM IST');

      // Dual-timezone summary
      final dualSummary = slot.dualTimezoneDisplay(
        primary: BookingTimezone.ist,
        secondary: BookingTimezone.pst,
      );
      expect(dualSummary.contains('IST'), isTrue);
      expect(dualSummary.contains('PST'), isTrue);
    });

    test('BookingSlot: Double-booking mutex protection lock acquisition and conflict guard', () {
      final slot = BookingSlot(
        id: 'mutex-slot-01',
        timeLabel: '10:00 AM',
        slotTime: DateTime.utc(2026, 10, 2, 4, 30),
        isAvailable: true,
        isMutexLocked: false,
      );

      expect(slot.isLocked, isFalse);
      expect(slot.isAvailable, isTrue);

      // 1. Acquire mutex lock atomically
      final lockedSlot = slot.acquireMutexLock(
        guestIdentifier: 'guest@quantmail.in',
        transactionId: 'TXN-MUTEX-TEST-99',
      );

      expect(lockedSlot.isLocked, isTrue);
      expect(lockedSlot.isAvailable, isFalse);
      expect(lockedSlot.isMutexLocked, isTrue);
      expect(lockedSlot.lockedBy, 'guest@quantmail.in');
      expect(lockedSlot.mutexTransactionId, 'TXN-MUTEX-TEST-99');
      expect(lockedSlot.lockedAt, isNotNull);

      // 2. Attempt double-booking on already locked slot -> Must throw StateError
      expect(
        () => lockedSlot.acquireMutexLock(guestIdentifier: 'attacker@evil.com'),
        throwsA(isA<StateError>()),
      );

      // 3. Release mutex lock
      final releasedSlot = lockedSlot.releaseMutexLock();
      expect(releasedSlot.isLocked, isFalse);
      expect(releasedSlot.isAvailable, isTrue);
      expect(releasedSlot.isMutexLocked, isFalse);
      expect(releasedSlot.lockedBy, isNull);
      expect(releasedSlot.mutexTransactionId, isNull);
    });

    test('CalendarEvent: Multi-day series RFC 5545 and dual timezone strings', () {
      final event = CalendarEvent(
        id: 'evt-sprint-series',
        title: 'Wave 76 Multi-Day Architecture Sprint',
        description: 'Autonomous swarm synchronization',
        startTime: DateTime.utc(2026, 10, 2, 8, 0),
        endTime: DateTime.utc(2026, 10, 2, 18, 0),
        isMultiDaySeries: true,
        seriesDayIndex: 2,
        seriesTotalDays: 5,
      );

      expect(event.durationMinutes, 600); // 10 hours
      expect(event.istTimeString.contains('IST'), isTrue);
      expect(event.pstTimeString.contains('PST'), isTrue);
      expect(event.dualTimezoneLabel.contains('IST'), isTrue);
      expect(event.dualTimezoneLabel.contains('PST'), isTrue);
      expect(event.seriesLabel, 'Series: Day 2 of 5 (RFC 5545)');

      final sampleEvents = CalendarEvent.sampleEvents();
      expect(sampleEvents.length, greaterThanOrEqualTo(5));
      expect(sampleEvents.any((e) => e.isMultiDaySeries), isTrue);
    });

    test('MeetingCall: QuantMeet HD Video properties, AV1 bitrates and join URL', () {
      final call = MeetingCall(
        id: 'call-hd-01',
        title: 'Tripartite Swarm Standup',
        scheduledTime: DateTime.now().add(const Duration(minutes: 30)),
        roomCode: 'swarm-alpha-room',
        hostName: 'Node A',
        av1BitrateKbps: 4500,
        audioCodec: 'Opus 48kHz Beamforming',
      );

      expect(call.joinUrl, 'https://meet.quantrinity.in/swarm-alpha-room');
      expect(call.av1BitrateKbps, 4500);
      expect(call.audioCodec, contains('Opus 48kHz'));

      final sampleCalls = MeetingCall.sampleCalls();
      expect(sampleCalls.isNotEmpty, isTrue);
      expect(sampleCalls.first.joinUrl.startsWith('https://meet.quantrinity.in/'), isTrue);
    });

    test('CalendarReminder: Priority classification and sample tasks', () {
      final reminders = CalendarReminder.sampleReminders();
      expect(reminders.length, greaterThanOrEqualTo(4));
      expect(reminders.any((r) => r.priority == 'High'), isTrue);
      expect(reminders.any((r) => r.isCompleted), isTrue);
      expect(reminders.any((r) => !r.isCompleted), isTrue);
    });
  });

  // ===========================================================================
  // 2. PUBLIC BOOKING SCREEN WIDGET TESTS
  // ===========================================================================
  group('PublicBookingScreen Widget Tests', () {
    testWidgets('Renders host card with /booking/:slug and copy link action', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: PublicBookingScreen(slug: 'satyam-lead'),
          ),
        ),
      );
      await tester.pump();

      // Verify host card details
      expect(find.text('Alex Quant'), findsOneWidget);
      expect(find.text('Host: /booking/satyam-lead · Sovereign Lead'), findsOneWidget);
      expect(find.text('quant.me/booking/satyam-lead'), findsOneWidget);

      // Verify copy slug link button exists
      expect(find.byIcon(Icons.share_rounded), findsOneWidget);

      // Tap copy link button
      await tester.tap(find.byIcon(Icons.share_rounded));
      await tester.pump();
      expect(find.textContaining('Booking link copied: https://quant.me/booking/satyam-lead'), findsOneWidget);
    });

    testWidgets('Duration selector switches between 15m, 30m, and 60m', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: PublicBookingScreen(slug: 'alex-dev'),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('SELECT DURATION'), findsOneWidget);
      expect(find.text('15m'), findsOneWidget);
      expect(find.text('30m'), findsOneWidget);
      expect(find.text('60m'), findsOneWidget);

      // Default is 30 minutes
      expect(find.text('30 minutes selected'), findsOneWidget);

      // Tap 15m
      await tester.tap(find.text('15m'));
      await tester.pump();
      expect(find.text('15 minutes selected'), findsOneWidget);

      // Tap 60m
      await tester.tap(find.text('60m'));
      await tester.pump();
      expect(find.text('60 minutes selected'), findsOneWidget);

      // Tap 30m
      await tester.tap(find.text('30m'));
      await tester.pump();
      expect(find.text('30 minutes selected'), findsOneWidget);
    });

    testWidgets('Dual-Timezone selector recomputes slot times in real time', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: PublicBookingScreen(slug: 'alex-dev'),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('DUAL-TIMEZONE SELECTOR'), findsOneWidget);
      expect(find.text('IST · UTC+5:30'), findsOneWidget);
      expect(find.text('PST · UTC-8:00'), findsOneWidget);
      expect(find.text('Local Device TZ'), findsOneWidget);

      // Initially active timezone is IST
      expect(find.textContaining('Zone: IST'), findsOneWidget);

      // Switch to PST
      await tester.tap(find.text('PST · UTC-8:00'));
      await tester.pump();
      expect(find.textContaining('Zone: PST'), findsOneWidget);

      // Switch to Local Device TZ
      await tester.tap(find.text('Local Device TZ'));
      await tester.pump();
      expect(find.textContaining('Zone: LOCAL'), findsOneWidget);

      // Switch back to IST
      await tester.tap(find.text('IST · UTC+5:30'));
      await tester.pump();
      expect(find.textContaining('Zone: IST'), findsOneWidget);
    });

    testWidgets('Double-booking mutex lock blocks selection of already locked slots', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: PublicBookingScreen(slug: 'alex-dev'),
          ),
        ),
      );
      await tester.pump();

      // Verify mutex locked slot is labeled
      expect(find.text('MUTEX LOCKED'), findsWidgets);

      // Tap the mutex locked slot
      await tester.tap(find.text('MUTEX LOCKED').first);
      await tester.pump();

      // Double-booking prevention snackbar appears
      expect(find.textContaining('Double-Booking Prevented'), findsOneWidget);
    });

    testWidgets('QuantMeet HD Video Meeting launcher card: Copy meeting link & join action', (WidgetTester tester) async {
      bool meetLaunched = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: PublicBookingScreen(
              slug: 'alex-dev',
              onLaunchQuantMeet: () => meetLaunched = true,
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify launcher card header & specs
      expect(find.text('QuantMeet Sovereign HD Video Stage'), findsOneWidget);
      expect(find.textContaining('AV1 Hardware 1080p60'), findsOneWidget);
      expect(find.text('https://meet.quantrinity.in/booking-alex-dev'), findsOneWidget);

      // 1-tap Copy Meeting Link
      expect(find.text('Copy Meeting Link'), findsOneWidget);
      await tester.tap(find.text('Copy Meeting Link'));
      await tester.pump();
      expect(find.textContaining('QuantMeet link copied:'), findsOneWidget);

      // 1-tap Join Action
      expect(find.text('Join HD Stage'), findsOneWidget);
      await tester.tap(find.text('Join HD Stage'));
      await tester.pumpAndSettle();

      // Enter HD Stage dialog
      expect(find.text('QuantMeet HD Stage'), findsOneWidget);
      expect(find.text('Enter HD Stage'), findsOneWidget);

      await tester.tap(find.text('Enter HD Stage'));
      await tester.pumpAndSettle();
      expect(meetLaunched, isTrue);
    });

    testWidgets('Completes reservation and atomically acquires mutex lock', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: PublicBookingScreen(slug: 'alex-dev'),
          ),
        ),
      );
      await tester.pump();

      // Fill guest name
      final nameField = find.byType(TextField).first;
      await tester.enterText(nameField, 'Jane Doe');
      await tester.pump();

      // Fill work email
      final emailField = find.byType(TextField).at(1);
      await tester.enterText(emailField, 'jane@enterprise.com');
      await tester.pump();

      // Tap Confirm Sovereign Reservation
      await tester.tap(find.text('Confirm Sovereign Reservation'));
      await tester.pump(); // Starts loading
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Fast-forward delay for mutex acquisition
      await tester.pump(const Duration(milliseconds: 1000));
      await tester.pumpAndSettle();

      // Dialog opens confirming atomic mutex lock
      expect(find.text('Mutex Slot Reserved!'), findsOneWidget);
      expect(find.text('ACTIVE · ZERO CONFLICT'), findsOneWidget);
      expect(find.textContaining('Transaction: MTX-76-LOCK-'), findsOneWidget);
      expect(find.text('Done'), findsOneWidget);

      // Close dialog
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.text('Mutex Slot Reserved!'), findsNothing);
    });
  });

  // ===========================================================================
  // 3. QUANTMEET LAUNCHER SCREEN WIDGET TESTS
  // ===========================================================================
  group('QuantMeetLauncherScreen Widget Tests', () {
    testWidgets('Renders instant meeting card, preflight toggles, and scheduled stages', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: QuantMeetLauncherScreen(),
          ),
        ),
      );
      await tester.pump();

      // Header card
      expect(find.text('Host Sovereign HD Video Stage'), findsOneWidget);
      expect(find.text('Start Instant Meeting'), findsOneWidget);
      expect(find.text('Copy Link'), findsOneWidget);

      // Hardware status
      expect(find.textContaining('WebRTC Hardware Status:'), findsOneWidget);
      expect(find.text('120Hz AV1'), findsOneWidget);

      // Preflight toggles
      expect(find.text('Mic On'), findsOneWidget);
      expect(find.text('Cam On'), findsOneWidget);

      // Upcoming calls list
      expect(find.text('UPCOMING VIDEO STAGES'), findsOneWidget);
      expect(find.text('Autonomous Swarm Standup (Node A + B + C)'), findsOneWidget);
    });

    testWidgets('Toggles mic and camera preflight controls', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: QuantMeetLauncherScreen(),
          ),
        ),
      );
      await tester.pump();

      // Toggle Mic Off
      await tester.tap(find.text('Mic On'));
      await tester.pump();
      expect(find.text('Mic Muted'), findsOneWidget);

      // Toggle Mic On
      await tester.tap(find.text('Mic Muted'));
      await tester.pump();
      expect(find.text('Mic On'), findsOneWidget);

      // Toggle Cam Off
      await tester.tap(find.text('Cam On'));
      await tester.pump();
      expect(find.text('Cam Off'), findsOneWidget);

      // Toggle Cam On
      await tester.tap(find.text('Cam Off'));
      await tester.pump();
      expect(find.text('Cam On'), findsOneWidget);
    });

    testWidgets('Launches instant meeting dialog from instant card', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: QuantMeetLauncherScreen(),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Start Instant Meeting'));
      await tester.pumpAndSettle();

      expect(find.text('Instant Sovereign Meeting'), findsOneWidget);
      expect(find.textContaining('E2EE Signal WebRTC Active'), findsOneWidget);
      expect(find.text('Leave Stage'), findsOneWidget);

      await tester.tap(find.text('Leave Stage'));
      await tester.pumpAndSettle();
      expect(find.text('Instant Sovereign Meeting'), findsNothing);
    });
  });

  // ===========================================================================
  // 4. MAIN APP NAVIGATION & DYNAMIC ISLAND WIDGET TESTS
  // ===========================================================================
  group('QuantCalendarApp Navigation & Dynamic Island Tests', () {
    testWidgets('Switches tabs between Agenda, Month, Booking, QuantMeet, and Reminders', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Starts on Agenda
      expect(find.byType(AgendaViewScreen), findsOneWidget);

      // Switch to Month
      await tester.tap(find.text('Month'));
      await tester.pumpAndSettle();
      expect(find.byType(MonthGridScreen), findsOneWidget);

      // Switch to Booking
      await tester.tap(find.text('Booking'));
      await tester.pumpAndSettle();
      expect(find.byType(PublicBookingScreen), findsOneWidget);

      // Switch to QuantMeet
      await tester.tap(find.text('QuantMeet'));
      await tester.pumpAndSettle();
      expect(find.byType(QuantMeetLauncherScreen), findsOneWidget);

      // Switch to Reminders
      await tester.tap(find.text('Reminders'));
      await tester.pumpAndSettle();
      expect(find.byType(RemindersScreen), findsOneWidget);
    });

    testWidgets('Taps Dynamic Island to reveal Quanty AI Copilot modal', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantCalendarApp());
      await tester.pump();

      // Tap Quanty AI Capsule
      await tester.tap(find.text('Quanty AI'));
      await tester.pumpAndSettle();

      // Copilot modal appears
      expect(find.text('Quanty AI Schedule Copilot'), findsOneWidget);
      expect(find.textContaining('CalDAV Sync Latency'), findsOneWidget);
      expect(find.textContaining('Public Booking Mutex Lock'), findsOneWidget);

      // Dismiss
      await tester.tap(find.text('Dismiss Copilot Insight'));
      await tester.pumpAndSettle();
      expect(find.text('Quanty AI Schedule Copilot'), findsNothing);
    });
  });

  // ===========================================================================
  // 5. EVENT EDITOR SHEET (RFC 5545 COMPOSER) TESTS
  // ===========================================================================
  group('EventEditorSheet Full RFC 5545 Composer Tests', () {
    testWidgets('Renders all fields, dual-timezone calculations, and default settings', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: EventEditorSheet(),
          ),
        ),
      );
      await tester.pump();

      // Header & title
      expect(find.text('New Sovereign Event'), findsOneWidget);
      expect(find.text('Event title (e.g. Wave 76 Architecture Sync)'), findsOneWidget);

      // Dual timezone card
      expect(find.textContaining('IST'), findsWidgets);
      expect(find.textContaining('PST'), findsWidgets);
      expect(find.text('RFC 5545'), findsOneWidget);
      expect(find.textContaining('Dual-Timezone Synchronization'), findsOneWidget);

      // All day toggle
      expect(find.text('All-day event'), findsOneWidget);
      expect(find.text('Starts'), findsOneWidget);
      expect(find.text('Ends'), findsOneWidget);

      // Recurrence selector
      expect(find.text('Recurrence (RFC 5545 RRULE)'), findsOneWidget);
      expect(find.text('Does not repeat'), findsOneWidget);

      // QuantMeet HD Video Section
      expect(find.text('QuantMeet HD Video Stage'), findsOneWidget);
      expect(find.textContaining('AV1 1080p60 Hardware Encoder'), findsOneWidget);

      // Attendees section
      expect(find.textContaining('Attendees (2)'), findsOneWidget);
      expect(find.text('CALDAV DISPATCH'), findsOneWidget);
      expect(find.text('node-b@quantrinity.in'), findsOneWidget);
      expect(find.text('node-c@quantrinity.in'), findsOneWidget);

      // Color Tag & Action buttons
      expect(find.text('Event Color Tag'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Save Event'), findsOneWidget);
    });

    testWidgets('Attendees input: Adds new attendee chip and removes existing attendee chip', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: EventEditorSheet(),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('node-b@quantrinity.in'), findsOneWidget);

      // Add a new attendee
      final attendeeField = find.widgetWithText(TextField, 'Enter attendee email...');
      expect(attendeeField, findsOneWidget);

      await tester.enterText(attendeeField, 'sentinel@quantrinity.in');
      await tester.pump();

      // Tap add attendee button
      await tester.tap(find.byTooltip('Add Attendee'));
      await tester.pump();

      // Verify new attendee chip appears
      expect(find.text('sentinel@quantrinity.in'), findsOneWidget);
      expect(find.textContaining('Attendees (3)'), findsOneWidget);

      // Remove an attendee chip
      final closeIcons = find.byIcon(Icons.close_rounded);
      expect(closeIcons, findsWidgets);

      await tester.tap(closeIcons.at(1)); // Remove first chip
      await tester.pump();
      expect(find.textContaining('Attendees (2)'), findsOneWidget);
    });

    testWidgets('Recurrence picker: Switches to Daily, Weekly, and Custom RRULE', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: EventEditorSheet(),
          ),
        ),
      );
      await tester.pump();

      // Initially 'Does not repeat'
      expect(find.text('Does not repeat'), findsOneWidget);

      // Open Dropdown
      await tester.tap(find.text('Does not repeat'));
      await tester.pumpAndSettle();

      // Select Daily
      expect(find.text('Daily (RFC 5545)'), findsWidgets);
      await tester.tap(find.text('Daily (RFC 5545)').last);
      await tester.pumpAndSettle();

      // Verify RRULE badge shows
      expect(find.text('RRULE:FREQ=DAILY'), findsOneWidget);

      // Switch to Custom
      await tester.tap(find.text('Daily (RFC 5545)'));
      await tester.pumpAndSettle();

      expect(find.text('Custom recurrence...'), findsWidgets);
      await tester.tap(find.text('Custom recurrence...').last);
      await tester.pumpAndSettle();

      // Custom RRULE text field appears
      expect(find.widgetWithText(TextFormField, 'RRULE:FREQ=WEEKLY;INTERVAL=2'), findsOneWidget);
    });

    testWidgets('QuantMeet toggle switches HD stage on/off', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: EventEditorSheet(),
          ),
        ),
      );
      await tester.pump();

      // QuantMeet is ON by default
      expect(find.textContaining('AV1 1080p60 Hardware Encoder'), findsOneWidget);

      // Find switch in QuantMeet section
      final switches = find.byType(Switch);
      expect(switches, findsNWidgets(2)); // All-day and QuantMeet

      // Toggle QuantMeet OFF
      await tester.tap(switches.last);
      await tester.pump();

      // Hardware spec card disappears and physical location field appears
      expect(find.textContaining('AV1 1080p60 Hardware Encoder'), findsNothing);
      expect(find.text('Physical Location / Room'), findsOneWidget);
    });

    testWidgets('Validation blocks saving with empty title and saves valid event', (WidgetTester tester) async {
      CalendarEvent? savedEvent;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: EventEditorSheet(
              onEventSaved: (evt) => savedEvent = evt,
            ),
          ),
        ),
      );
      await tester.pump();

      // Tap Save with empty title
      await tester.tap(find.text('Save Event'));
      await tester.pump();

      // Validation error appears
      expect(find.text('Event title is required'), findsOneWidget);
      expect(savedEvent, isNull);

      // Enter Title
      final titleField = find.widgetWithText(TextFormField, 'Event title (e.g. Wave 76 Architecture Sync)');
      await tester.enterText(titleField, 'Sovereign Sprint 76 Review');
      await tester.pump();

      // Tap Save Event
      await tester.tap(find.text('Save Event'));
      await tester.pumpAndSettle();

      // Verify event is saved with correct attributes
      expect(savedEvent, isNotNull);
      expect(savedEvent!.title, 'Sovereign Sprint 76 Review');
      expect(savedEvent!.isQuantMeet, isTrue);
      expect(savedEvent!.attendees.length, 2);
      expect(savedEvent!.colorHex, '#F59E0B');
    });

    testWidgets('Pre-populates fields when initialEvent is passed for editing', (WidgetTester tester) async {
      final initial = CalendarEvent(
        id: 'evt-custom-009',
        title: 'Impeller Architecture Review',
        description: 'Zero clipPath and 120Hz pipeline review',
        startTime: DateTime.utc(2026, 10, 2, 14, 0),
        endTime: DateTime.utc(2026, 10, 2, 15, 30),
        isQuantMeet: true,
        colorHex: '#38BDF8',
        recurrenceRule: 'RRULE:FREQ=DAILY;INTERVAL=1',
        attendees: const ['alex@quantmail.in', 'lead@quantrinity.in'],
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: EventEditorSheet(initialEvent: initial),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Edit Sovereign Event'), findsOneWidget);
      expect(find.text('Update Event'), findsOneWidget);
      expect(find.text('Impeller Architecture Review'), findsOneWidget);
      expect(find.text('RRULE:FREQ=DAILY'), findsOneWidget);
      expect(find.text('alex@quantmail.in'), findsOneWidget);
      expect(find.text('lead@quantrinity.in'), findsOneWidget);
    });
  });
}

