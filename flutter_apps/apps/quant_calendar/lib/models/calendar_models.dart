// Sovereign QuantCalendar - Domain Models & Data Structures
// Strictly ZERO raw Unicode emojis and ZERO clipPath throughout.

/// Model representing a rich calendar event in QuantCalendar.
class CalendarEvent {
  final String id;
  final String title;
  final String description;
  final DateTime startTime;
  final DateTime endTime;
  final bool isAllDay;
  final String location;
  final String? meetingUrl;
  final bool isQuantMeet;
  final String colorHex;
  final String organizer;
  final List<String> attendees;
  final String recurrenceRule;
  final List<String> tags;
  final bool isE2EE;

  const CalendarEvent({
    required this.id,
    required this.title,
    required this.description,
    required this.startTime,
    required this.endTime,
    this.isAllDay = false,
    this.location = '',
    this.meetingUrl,
    this.isQuantMeet = false,
    this.colorHex = '#F59E0B', // Default Sunset Gold
    this.organizer = 'alex@quantmail.in',
    this.attendees = const [],
    this.recurrenceRule = '',
    this.tags = const [],
    this.isE2EE = true,
  });

  /// Duration of the event in minutes.
  int get durationMinutes => endTime.difference(startTime).inMinutes;

  /// IST (UTC+5:30) formatted time string.
  String get istTimeString {
    final istTime = startTime.toUtc().add(const Duration(hours: 5, minutes: 30));
    final hour = istTime.hour;
    final minute = istTime.minute.toString().padLeft(2, '0');
    final ampm = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    return '$displayHour:$minute $ampm IST';
  }

  /// PST (UTC-8:00) formatted time string.
  String get pstTimeString {
    final pstTime = startTime.toUtc().subtract(const Duration(hours: 8));
    final hour = pstTime.hour;
    final minute = pstTime.minute.toString().padLeft(2, '0');
    final ampm = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    return '$displayHour:$minute $ampm PST';
  }

  /// Full dual-timezone formatted badge string.
  String get dualTimezoneLabel => '$istTimeString · $pstTimeString';

  /// Generates initial mock schedule for demo & test suites.
  static List<CalendarEvent> sampleEvents() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return [
      CalendarEvent(
        id: 'evt-101',
        title: 'Tripartite Swarm Autonomous Sync',
        description: 'Synchronize Node A (IDE), Node B (Peer), and Node C (CLI Dev-Worker). Verify Wave 76 Flutter Sovereign parity.',
        startTime: today.add(const Duration(hours: 9, minutes: 30)),
        endTime: today.add(const Duration(hours: 10, minutes: 30)),
        location: 'QuantMeet Room: swarm-alpha',
        meetingUrl: 'https://meet.quantrinity.in/swarm-alpha',
        isQuantMeet: true,
        colorHex: '#F59E0B', // Sunset Gold
        organizer: 'node-a@quantrinity.in',
        attendees: ['node-b@quantrinity.in', 'node-c@quantrinity.in', 'ceo@quantrinity.in'],
        tags: ['Architecture', 'Swarm', 'Wave 76'],
      ),
      CalendarEvent(
        id: 'evt-102',
        title: 'Impeller 120Hz Pipeline Benchmark',
        description: 'Audit raster thread frame render times on Android Jetpack & Flutter Impeller engines. Target <8.3ms per frame.',
        startTime: today.add(const Duration(hours: 11, minutes: 0)),
        endTime: today.add(const Duration(hours: 11, minutes: 45)),
        location: 'Hardware Lab #4',
        colorHex: '#38BDF8', // Sky Cyan
        organizer: 'alex@quantmail.in',
        attendees: ['perf-sentinel@quantmail.in'],
        tags: ['Graphics', 'Impeller', 'Zero ClipPath'],
      ),
      CalendarEvent(
        id: 'evt-103',
        title: 'Calendly-Class Booking Engine Review',
        description: 'Review atomic mutex booking locks and CalDAV RFC 5545 bi-directional sync engine across Google Calendar and Apple iCal.',
        startTime: today.add(const Duration(hours: 14, minutes: 0)),
        endTime: today.add(const Duration(hours: 15, minutes: 0)),
        location: 'QuantMeet Room: booking-core',
        meetingUrl: 'https://meet.quantrinity.in/booking-core',
        isQuantMeet: true,
        colorHex: '#10B981', // Emerald
        organizer: 'booking-lead@quantmail.in',
        attendees: ['calendar-dev@quantmail.in', 'alex@quantmail.in'],
        tags: ['CalDAV', 'Booking', 'Mutex'],
      ),
      CalendarEvent(
        id: 'evt-104',
        title: 'QuantMeet WebRTC Hardware Bridge Validation',
        description: 'Verify dynamic hardware capture: Camera AV1 hardware encoding, Opus 48kHz audio beamforming, and zero-leak audio tracks.',
        startTime: today.add(const Duration(hours: 16, minutes: 30)),
        endTime: today.add(const Duration(hours: 17, minutes: 15)),
        location: 'QuantMeet Studio A',
        meetingUrl: 'https://meet.quantrinity.in/webrtc-stage',
        isQuantMeet: true,
        colorHex: '#A855F7', // Royal Purple
        organizer: 'webrtc-core@quantrinity.in',
        attendees: ['media-eng@quantrinity.in'],
        tags: ['WebRTC', 'HD Video', 'E2EE'],
      ),
      CalendarEvent(
        id: 'evt-105',
        title: 'Quant Security Pre-Flight & E2EE Key Audit',
        description: 'Audit ratchet pre-keys and cryptographic memory suppression before staging deployment.',
        startTime: today.add(const Duration(hours: 18, minutes: 0)),
        endTime: today.add(const Duration(hours: 18, minutes: 30)),
        location: 'Security Vault',
        colorHex: '#EF4444', // Crimson Alert
        organizer: 'sentinel@quantrinity.in',
        attendees: ['sec-team@quantrinity.in'],
        tags: ['Security', 'Audit', 'E2EE'],
      ),
    ];
  }
}

/// Model representing a Calendly-class public booking slot.
class BookingSlot {
  final String id;
  final String timeLabel;
  final DateTime slotTime;
  final int durationMinutes;
  final bool isAvailable;
  final bool isSelected;
  final String hostSlug;

  const BookingSlot({
    required this.id,
    required this.timeLabel,
    required this.slotTime,
    this.durationMinutes = 30,
    this.isAvailable = true,
    this.isSelected = false,
    this.hostSlug = 'alex-dev',
  });

  BookingSlot copyWith({
    String? id,
    String? timeLabel,
    DateTime? slotTime,
    int? durationMinutes,
    bool? isAvailable,
    bool? isSelected,
    String? hostSlug,
  }) {
    return BookingSlot(
      id: id ?? this.id,
      timeLabel: timeLabel ?? this.timeLabel,
      slotTime: slotTime ?? this.slotTime,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      isAvailable: isAvailable ?? this.isAvailable,
      isSelected: isSelected ?? this.isSelected,
      hostSlug: hostSlug ?? this.hostSlug,
    );
  }

  static List<BookingSlot> sampleSlots() {
    final now = DateTime.now();
    final base = DateTime(now.year, now.month, now.day);
    return [
      BookingSlot(
        id: 'slot-1',
        timeLabel: '09:00 AM',
        slotTime: base.add(const Duration(hours: 9)),
        isAvailable: true,
      ),
      BookingSlot(
        id: 'slot-2',
        timeLabel: '10:00 AM',
        slotTime: base.add(const Duration(hours: 10)),
        isAvailable: true,
      ),
      BookingSlot(
        id: 'slot-3',
        timeLabel: '11:30 AM',
        slotTime: base.add(const Duration(hours: 11, minutes: 30)),
        isAvailable: true,
      ),
      BookingSlot(
        id: 'slot-4',
        timeLabel: '02:00 PM',
        slotTime: base.add(const Duration(hours: 14)),
        isAvailable: true,
      ),
      BookingSlot(
        id: 'slot-5',
        timeLabel: '03:30 PM',
        slotTime: base.add(const Duration(hours: 15, minutes: 30)),
        isAvailable: false, // Booked mutex lock
      ),
      BookingSlot(
        id: 'slot-6',
        timeLabel: '05:00 PM',
        slotTime: base.add(const Duration(hours: 17)),
        isAvailable: true,
      ),
    ];
  }
}

/// Model representing a QuantMeet video conference room / upcoming call.
class MeetingCall {
  final String id;
  final String title;
  final DateTime scheduledTime;
  final int durationMinutes;
  final String roomCode;
  final String hostName;
  final int attendeeCount;
  final bool isLiveNow;
  final bool isHardwareReady;

  const MeetingCall({
    required this.id,
    required this.title,
    required this.scheduledTime,
    this.durationMinutes = 45,
    required this.roomCode,
    required this.hostName,
    this.attendeeCount = 1,
    this.isLiveNow = false,
    this.isHardwareReady = true,
  });

  static List<MeetingCall> sampleCalls() {
    final now = DateTime.now();
    return [
      MeetingCall(
        id: 'call-01',
        title: 'Autonomous Swarm Standup (Node A + B + C)',
        scheduledTime: now.add(const Duration(minutes: 15)),
        durationMinutes: 30,
        roomCode: 'swarm-standup-76',
        hostName: 'Node A Orchestrator',
        attendeeCount: 6,
        isLiveNow: true,
        isHardwareReady: true,
      ),
      MeetingCall(
        id: 'call-02',
        title: 'Executive Product Architecture & Staging Demo',
        scheduledTime: now.add(const Duration(hours: 2, minutes: 30)),
        durationMinutes: 60,
        roomCode: 'exec-demo-room',
        hostName: 'Alex Quant',
        attendeeCount: 12,
        isLiveNow: false,
        isHardwareReady: true,
      ),
      MeetingCall(
        id: 'call-03',
        title: 'QuantMeet WebRTC Hardware Bridge Review',
        scheduledTime: now.add(const Duration(hours: 5)),
        durationMinutes: 45,
        roomCode: 'webrtc-av1-review',
        hostName: 'Media Sentinel',
        attendeeCount: 4,
        isLiveNow: false,
        isHardwareReady: true,
      ),
    ];
  }
}

/// Model representing calendar reminders / tasks.
class CalendarReminder {
  final String id;
  final String title;
  final DateTime dueTime;
  final bool isCompleted;
  final String priority; // High, Medium, Low
  final String category;
  final String rrule;

  const CalendarReminder({
    required this.id,
    required this.title,
    required this.dueTime,
    this.isCompleted = false,
    this.priority = 'High',
    this.category = 'Sprint',
    this.rrule = 'FREQ=DAILY',
  });

  static List<CalendarReminder> sampleReminders() {
    final now = DateTime.now();
    return [
      CalendarReminder(
        id: 'rem-1',
        title: 'Verify Impeller 120Hz zero frame-drop benchmark',
        dueTime: now.add(const Duration(hours: 1)),
        isCompleted: false,
        priority: 'High',
        category: 'Performance',
      ),
      CalendarReminder(
        id: 'rem-2',
        title: 'Check CalDAV bi-directional synchronization stream',
        dueTime: now.add(const Duration(hours: 3)),
        isCompleted: true,
        priority: 'Medium',
        category: 'Sync',
      ),
      CalendarReminder(
        id: 'rem-3',
        title: 'Rotate E2EE session ratchet keys for QuantMeet rooms',
        dueTime: now.add(const Duration(hours: 6)),
        isCompleted: false,
        priority: 'High',
        category: 'Security',
      ),
      CalendarReminder(
        id: 'rem-4',
        title: 'Review public booking reservations for tomorrow',
        dueTime: now.add(const Duration(hours: 8)),
        isCompleted: false,
        priority: 'Low',
        category: 'Booking',
      ),
    ];
  }
}
