// Pure formatting helpers shared by the Quant Mail components.

const List<String> _weekdays = <String>[
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const List<String> _months = <String>[
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// Sticky day header text: Today, Yesterday, a weekday for the last week,
/// otherwise "Month year". Mail from the same label belongs to one group.
String qmDayLabel(DateTime date, DateTime now) {
  final DateTime d = _day(date.toLocal());
  final DateTime today = _day(now.toLocal());
  final int diff = today.difference(d).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return _weekdays[d.weekday - 1];
  return '${_months[d.month - 1]} ${d.year}';
}

String _two(int v) => v.toString().padLeft(2, '0');

/// Time text at the end of a mail row: "14:02" today, "12 Oct" this year,
/// "12 Oct 2025" otherwise.
String qmRowTime(DateTime date, DateTime now) {
  final DateTime local = date.toLocal();
  final DateTime today = _day(now.toLocal());
  if (_day(local) == today) return '${_two(local.hour)}:${_two(local.minute)}';
  final String month = _months[local.month - 1].substring(0, 3);
  if (local.year == today.year) return '${local.day} $month';
  return '${local.day} $month ${local.year}';
}

/// "1.4 MB" style size text.
String qmFormatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  final double kb = bytes / 1024;
  if (kb < 1024) return '${kb.toStringAsFixed(kb < 10 ? 1 : 0)} KB';
  final double mb = kb / 1024;
  if (mb < 1024) return '${mb.toStringAsFixed(mb < 10 ? 1 : 0)} MB';
  return '${(mb / 1024).toStringAsFixed(1)} GB';
}

/// Up to two initials from a display name, else from the address.
String qmInitials(String name, [String email = '']) {
  final List<String> parts = name.trim().split(RegExp(r'\s+')).where((String p) => p.isNotEmpty).toList();
  if (parts.length >= 2) {
    return '${_first(parts.first)}${_first(parts.last)}'.toUpperCase();
  }
  if (parts.length == 1) return _first(parts.first).toUpperCase();
  final String local = email.split('@').first.trim();
  if (local.isNotEmpty) return _first(local).toUpperCase();
  return '?';
}

String _first(String s) => String.fromCharCode(s.runes.first);
