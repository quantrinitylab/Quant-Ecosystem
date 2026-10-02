// Sovereign QuantCalendar - Domain Models & Data Structures
// Strictly ZERO raw Unicode emojis and ZERO clipPath throughout.

/// Supported booking timezones with UTC offsets and conversion math.
enum BookingTimezone {
  ist('IST · UTC+5:30', 'IST', Duration(hours: 5, minutes: 30)),
  pst('PST · UTC-8:00', 'PST', Duration(hours: -8)),
  est('EST · UTC-5:00', 'EST', Duration(hours: -5)),
  utc('UTC · UTC+0:00', 'UTC', Duration.zero),
  local('Local Device TZ', 'LOCAL', Duration.zero);

  final String label;
  final String code;
  final Duration offset;
  const BookingTimezone(this.label, this.code, this.offset);

  /// Effective duration offset accounting for dynamic local device timezone.
  Duration get effectiveOffset {
    if (this == BookingTimezone.local) {
      return DateTime.now().timeZoneOffset;
    }
    return offset;
  }

  /// Converts a UTC [DateTime] to this timezone.
  DateTime convertUtc(DateTime utcTime) {
    final utc = utcTime.isUtc ? utcTime : utcTime.toUtc();
    return utc.add(effectiveOffset);
  }

  /// Formats a UTC [DateTime] into a 12-hour formatted time string in this timezone.
  String formatTime(DateTime utcTime) {
    final dt = convertUtc(utcTime);
    final hour = dt.hour;
    final minute = dt.minute.toString().padLeft(2, '0');
    final ampm = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    return '$displayHour:$minute $ampm';
  }

  /// Formats time with the timezone code appended (e.g. "09:30 AM IST").
  String formatTimeWithZone(DateTime utcTime) {
    final codeStr = this == BookingTimezone.local ? 'LOCAL' : code;
    return '${formatTime(utcTime)} $codeStr';
  }

  /// Calculates the time difference string between two timezones.
  static String timeDifferenceString(BookingTimezone tzA, BookingTimezone tzB) {
    final diff = tzA.effectiveOffset - tzB.effectiveOffset;
    final totalMinutes = diff.inMinutes.abs();
    final hours = totalMinutes ~/ 60;
    final minutes = totalMinutes % 60;
    final sign = diff.isNegative ? '-' : '+';
    if (minutes == 0) {
      return '$sign${hours}h delta';
    }
    return '$sign${hours}h ${minutes}m delta';
  }
}

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
  final bool isMultiDaySeries;
  final int seriesDayIndex;
  final int seriesTotalDays;

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
    this.isMultiDaySeries = false,
    this.seriesDayIndex = 1,
    this.seriesTotalDays = 1,
  });

  /// Duration of the event in minutes.
  int get durationMinutes => endTime.difference(startTime).inMinutes;

  /// Formats the event start time in an arbitrary [BookingTimezone].
  String formatInTimezone(BookingTimezone tz) {
    return tz.formatTimeWithZone(startTime.toUtc());
  }

  /// IST (UTC+5:30) formatted time string.
  String get istTimeString => BookingTimezone.ist.formatTimeWithZone(startTime.toUtc());

  /// PST (UTC-8:00) formatted time string.
  String get pstTimeString => BookingTimezone.pst.formatTimeWithZone(startTime.toUtc());

  /// Full dual-timezone formatted badge string.
  String get dualTimezoneLabel => '$istTimeString · $pstTimeString';

  /// Multi-day series badge description.
  String get seriesLabel => isMultiDaySeries
      ? 'Series: Day $seriesDayIndex of $seriesTotalDays (RFC 5545)'
      : '';

  /// Generates initial mock schedule for demo & test suites.
  static List<CalendarEvent> sampleEvents() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return [
      CalendarEvent(
        id: 'evt-series-01',
        title: 'Wave 76 Tripartite Sovereign Architecture Sprint',
        description: 'Multi-day engineering sprint aligning Node A, Node B, and Node C across all sovereign multiplatform runners and CalDAV RFC 5545 pipelines.',
        startTime: today.add(const Duration(hours: 8, minutes: 0)),
        endTime: today.add(const Duration(hours: 19, minutes: 0)),
        location: 'QuantMeet Room: sprint-war-room',
        meetingUrl: 'https://meet.quantrinity.in/sprint-war-room',
        isQuantMeet: true,
        colorHex: '#EC4899', // Hot Pink
        organizer: 'node-a@quantrinity.in',
        attendees: ['node-b@quantrinity.in', 'node-c@quantrinity.in', 'sentinel@quantrinity.in'],
        tags: ['Multi-Day Sprint', 'RFC 5545', 'Sovereign'],
        isMultiDaySeries: true,
        seriesDayIndex: 1,
        seriesTotalDays: 7,
      ),
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

/// Model representing a Calendly-class public booking slot with double-booking mutex protection.
class BookingSlot {
  final String id;
  final String timeLabel;
  final DateTime slotTime; // Ground truth UTC DateTime
  final int durationMinutes;
  final bool isAvailable;
  final bool isSelected;
  final String hostSlug;
  final bool isMutexLocked;
  final String? lockedBy;
  final DateTime? lockedAt;
  final String? mutexTransactionId;

  const BookingSlot({
    required this.id,
    required this.timeLabel,
    required this.slotTime,
    this.durationMinutes = 30,
    this.isAvailable = true,
    this.isSelected = false,
    this.hostSlug = 'alex-dev',
    this.isMutexLocked = false,
    this.lockedBy,
    this.lockedAt,
    this.mutexTransactionId,
  });

  /// Indicates whether the slot is effectively locked against double-booking.
  bool get isLocked => isMutexLocked || !isAvailable;

  /// Formatted slot start time localized to chosen timezone.
  String formattedTime(BookingTimezone tz) {
    return tz.formatTime(slotTime);
  }

  /// Formatted slot end time localized to chosen timezone based on [durationMinutes].
  String formattedEndTime(BookingTimezone tz, [int? customDuration]) {
    final effectiveDuration = customDuration ?? durationMinutes;
    final endUtc = slotTime.add(Duration(minutes: effectiveDuration));
    return tz.formatTime(endUtc);
  }

  /// Formatted slot time range (e.g. "09:00 AM - 09:30 AM").
  String formattedSlotRange(BookingTimezone tz, [int? customDuration]) {
    final start = formattedTime(tz);
    final end = formattedEndTime(tz, customDuration);
    final code = tz == BookingTimezone.local ? 'LOCAL' : tz.code;
    return '$start - $end $code';
  }

  /// Dual-timezone slot conversion display string (e.g. "09:00 AM IST (08:30 PM PST)").
  String dualTimezoneDisplay({
    BookingTimezone primary = BookingTimezone.ist,
    BookingTimezone secondary = BookingTimezone.pst,
  }) {
    final primStr = '${formattedTime(primary)} ${primary.code}';
    final secStr = '${formattedTime(secondary)} ${secondary.code}';
    return '$primStr ($secStr)';
  }

  /// Atomically acquires a double-booking mutex protection lock.
  /// Throws [StateError] if slot is already mutex-locked.
  BookingSlot acquireMutexLock({
    required String guestIdentifier,
    String? transactionId,
  }) {
    if (isLocked) {
      throw StateError('Double-Booking Conflict: Slot $id is already locked by $lockedBy');
    }
    final txnId = transactionId ?? 'MTX-${DateTime.now().millisecondsSinceEpoch}-${id.hashCode.abs().toRadixString(16)}';
    return copyWith(
      isAvailable: false,
      isMutexLocked: true,
      lockedBy: guestIdentifier,
      lockedAt: DateTime.now().toUtc(),
      mutexTransactionId: txnId,
    );
  }

  /// Releases the double-booking mutex lock.
  BookingSlot releaseMutexLock() {
    return copyWith(
      isAvailable: true,
      isMutexLocked: false,
      lockedBy: null,
      lockedAt: null,
      mutexTransactionId: null,
    );
  }

  BookingSlot copyWith({
    String? id,
    String? timeLabel,
    DateTime? slotTime,
    int? durationMinutes,
    bool? isAvailable,
    bool? isSelected,
    String? hostSlug,
    bool? isMutexLocked,
    String? lockedBy,
    DateTime? lockedAt,
    String? mutexTransactionId,
  }) {
    return BookingSlot(
      id: id ?? this.id,
      timeLabel: timeLabel ?? this.timeLabel,
      slotTime: slotTime ?? this.slotTime,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      isAvailable: isAvailable ?? this.isAvailable,
      isSelected: isSelected ?? this.isSelected,
      hostSlug: hostSlug ?? this.hostSlug,
      isMutexLocked: isMutexLocked ?? this.isMutexLocked,
      lockedBy: lockedBy ?? this.lockedBy,
      lockedAt: lockedAt ?? this.lockedAt,
      mutexTransactionId: mutexTransactionId ?? this.mutexTransactionId,
    );
  }

  static List<BookingSlot> sampleSlots({String slug = 'alex-dev'}) {
    final now = DateTime.now().toUtc();
    final base = DateTime.utc(now.year, now.month, now.day);
    return [
      BookingSlot(
        id: 'slot-1',
        timeLabel: '09:00 AM',
        slotTime: base.add(const Duration(hours: 3, minutes: 30)), // 09:00 AM IST / 20:30 PST (prev day)
        isAvailable: true,
        hostSlug: slug,
      ),
      BookingSlot(
        id: 'slot-2',
        timeLabel: '10:00 AM',
        slotTime: base.add(const Duration(hours: 4, minutes: 30)), // 10:00 AM IST / 21:30 PST (prev day)
        isAvailable: true,
        hostSlug: slug,
      ),
      BookingSlot(
        id: 'slot-3',
        timeLabel: '11:30 AM',
        slotTime: base.add(const Duration(hours: 6)), // 11:30 AM IST / 23:00 PST (prev day)
        isAvailable: true,
        hostSlug: slug,
      ),
      BookingSlot(
        id: 'slot-4',
        timeLabel: '02:00 PM',
        slotTime: base.add(const Duration(hours: 8, minutes: 30)), // 02:00 PM IST / 00:30 PST
        isAvailable: true,
        hostSlug: slug,
      ),
      BookingSlot(
        id: 'slot-5',
        timeLabel: '03:30 PM',
        slotTime: base.add(const Duration(hours: 10)), // 03:30 PM IST / 02:00 PST
        isAvailable: false, // Mutex locked by peer node
        isMutexLocked: true,
        lockedBy: 'peer-node@quantrinity.in',
        lockedAt: now.subtract(const Duration(minutes: 42)),
        mutexTransactionId: 'MTX-LOCKED-PREV-005',
        hostSlug: slug,
      ),
      BookingSlot(
        id: 'slot-6',
        timeLabel: '05:00 PM',
        slotTime: base.add(const Duration(hours: 11, minutes: 30)), // 05:00 PM IST / 03:30 PST
        isAvailable: true,
        hostSlug: slug,
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
  final String? meetingUrl;
  final int av1BitrateKbps;
  final String audioCodec;

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
    this.meetingUrl,
    this.av1BitrateKbps = 4500,
    this.audioCodec = 'Opus 48kHz Beamforming',
  });

  /// Canonical QuantMeet join URL.
  String get joinUrl => meetingUrl ?? 'https://meet.quantrinity.in/$roomCode';

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
        meetingUrl: 'https://meet.quantrinity.in/swarm-standup-76',
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
        meetingUrl: 'https://meet.quantrinity.in/exec-demo-room',
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
        meetingUrl: 'https://meet.quantrinity.in/webrtc-av1-review',
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
