import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/calendar_models.dart';

/// Month Grid Screen - 30-Day Interactive Calendar Month Grid
///
/// Features 30-day month grid with day event dots, selected day highlighted
/// with a Sunset Gold (#F59E0B) halo, and day schedule breakdown.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class MonthGridScreen extends StatefulWidget {
  final VoidCallback? onOpenQuantMeet;

  const MonthGridScreen({
    super.key,
    this.onOpenQuantMeet,
  });

  @override
  State<MonthGridScreen> createState() => _MonthGridScreenState();
}

class _MonthGridScreenState extends State<MonthGridScreen> {
  late DateTime _currentMonth;
  late DateTime _selectedDate;
  late Map<int, List<CalendarEvent>> _monthEvents;

  final List<String> _weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  final List<String> _monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _currentMonth = DateTime(now.year, now.month, 1);
    _selectedDate = DateTime(now.year, now.month, now.day);
    _generateMonthEvents();
  }

  void _generateMonthEvents() {
    // No mock data: honestly empty until the real calendar source is wired.
    // (The previous implementation fabricated sample events onto fixed dates.)
    _monthEvents = <int, List<CalendarEvent>>{};
  }

  void _previousMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1, 1);
    });
  }

  void _nextMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 1);
    });
  }

  int _daysInMonth(DateTime date) {
    final firstDayNextMonth = DateTime(date.year, date.month + 1, 1);
    return firstDayNextMonth.subtract(const Duration(days: 1)).day;
  }

  @override
  Widget build(BuildContext context) {
    final totalDays = _daysInMonth(_currentMonth);
    final firstWeekday = _currentMonth.weekday; // 1 = Mon, 7 = Sun
    final leadingBlanks = firstWeekday - 1;
    final selectedDayEvents = _monthEvents[_selectedDate.day] ?? [];

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Month Header with Navigation
            _buildMonthHeader(),

            // Weekday Strip (MON-SUN)
            _buildWeekdayHeaders(),

            // 30-Day Grid
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: _buildCalendarGrid(leadingBlanks, totalDays),
            ),

            const SizedBox(height: 12),

            // Divider & Section Header for Selected Day Breakdown
            _buildSelectedDayDivider(),

            // Selected Day Schedule Breakdown List
            Expanded(
              child: selectedDayEvents.isEmpty
                  ? _buildEmptyDayState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      itemCount: selectedDayEvents.length,
                      itemBuilder: (context, index) {
                        return _buildScheduleItemCard(selectedDayEvents[index]);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMonthHeader() {
    final monthLabel = '${_monthNames[_currentMonth.month - 1]} ${_currentMonth.year}';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: QuantColors.sunsetGold.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: QuantColors.sunsetGold.withOpacity(0.4)),
                ),
                child: const Icon(Icons.calendar_month_rounded, size: 18, color: QuantColors.sunsetGold),
              ),
              const SizedBox(width: 10),
              Text(
                monthLabel,
                style: QuantTypography.titleLarge.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
            ],
          ),
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left_rounded, color: QuantColors.textSecondary),
                onPressed: _previousMonth,
                tooltip: 'Previous Month',
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right_rounded, color: QuantColors.textSecondary),
                onPressed: _nextMonth,
                tooltip: 'Next Month',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildWeekdayHeaders() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: _weekdays.map((day) {
          return Expanded(
            child: Center(
              child: Text(
                day,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textMuted,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildCalendarGrid(int leadingBlanks, int totalDays) {
    final totalCells = leadingBlanks + totalDays;
    final totalRows = (totalCells / 7).ceil();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: List.generate(totalRows, (rowIndex) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 2.0),
            child: Row(
              children: List.generate(7, (colIndex) {
                final cellIndex = rowIndex * 7 + colIndex;
                final dayNumber = cellIndex - leadingBlanks + 1;

                if (dayNumber < 1 || dayNumber > totalDays) {
                  return const Expanded(child: SizedBox(height: 38));
                }

                final isSelected = _selectedDate.year == _currentMonth.year &&
                    _selectedDate.month == _currentMonth.month &&
                    _selectedDate.day == dayNumber;

                final isToday = DateTime.now().year == _currentMonth.year &&
                    DateTime.now().month == _currentMonth.month &&
                    DateTime.now().day == dayNumber;

                final dayEvents = _monthEvents[dayNumber] ?? [];
                final hasEvents = dayEvents.isNotEmpty;

                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _selectedDate = DateTime(_currentMonth.year, _currentMonth.month, dayNumber);
                      });
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      height: 38,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? QuantColors.sunsetGold
                            : (isToday ? QuantColors.voidObsidian : Colors.transparent),
                        borderRadius: BorderRadius.circular(10),
                        border: isToday && !isSelected
                            ? Border.all(color: QuantColors.sunsetGold.withOpacity(0.8), width: 1.2)
                            : null,
                        boxShadow: isSelected
                            ? [
                                BoxShadow(
                                  color: QuantColors.sunsetGold.withOpacity(0.45),
                                  blurRadius: 10,
                                  spreadRadius: 1,
                                  offset: const Offset(0, 1),
                                ),
                              ]
                            : null,
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Text(
                            '$dayNumber',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isSelected || isToday ? FontWeight.w800 : FontWeight.w500,
                              color: isSelected
                                  ? QuantColors.voidObsidian
                                  : (isToday ? QuantColors.sunsetGold : QuantColors.textPrimary),
                            ),
                          ),
                          if (hasEvents)
                            Positioned(
                              bottom: 4,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 4,
                                    height: 4,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isSelected
                                          ? QuantColors.voidObsidian
                                          : QuantColors.sunsetGold,
                                    ),
                                  ),
                                  if (dayEvents.length > 1) ...[
                                    const SizedBox(width: 2),
                                    Container(
                                      width: 4,
                                      height: 4,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: isSelected
                                            ? QuantColors.voidObsidian
                                            : QuantColors.sovereignCyan,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildSelectedDayDivider() {
    final weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    final weekdayName = weekdays[_selectedDate.weekday - 1];
    final dateLabel = '$weekdayName, ${_monthNames[_selectedDate.month - 1]} ${_selectedDate.day}';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: QuantColors.sunsetGold,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                dateLabel,
                style: QuantTypography.titleMedium.copyWith(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          QuantBadge(
            label: '${_monthEvents[_selectedDate.day]?.length ?? 0} Events',
            variant: QuantBadgeVariant.amber,
          ),
        ],
      ),
    );
  }

  Widget _buildScheduleItemCard(CalendarEvent event) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10.0),
      child: FrostedCard(
        borderRadius: 14,
        padding: const EdgeInsets.all(14),
        borderColor: QuantColors.hairlineBorder,
        backgroundColor: QuantColors.darkSlateCard,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Time Indicator Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: QuantColors.voidObsidian,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    event.startTime.hour.toString().padLeft(2, '0') +
                        ':' +
                        event.startTime.minute.toString().padLeft(2, '0'),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: QuantColors.sunsetGold,
                    ),
                  ),
                  Text(
                    '${event.durationMinutes}m',
                    style: const TextStyle(
                      fontSize: 10,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    event.title,
                    style: QuantTypography.bodyMedium.copyWith(
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    event.dualTimezoneLabel,
                    style: QuantTypography.labelSpeed.copyWith(
                      fontSize: 10,
                      color: QuantColors.textSecondary,
                    ),
                  ),
                  if (event.location.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          event.isQuantMeet ? Icons.videocam_rounded : Icons.place_rounded,
                          size: 13,
                          color: event.isQuantMeet ? QuantColors.sunsetGold : QuantColors.textMuted,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          event.location,
                          style: QuantTypography.bodySmall,
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),

            if (event.isQuantMeet)
              IconButton(
                icon: const Icon(Icons.play_circle_filled_rounded, color: QuantColors.sunsetGold, size: 28),
                onPressed: () => widget.onOpenQuantMeet?.call(),
                tooltip: 'Launch QuantMeet',
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyDayState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.event_busy_rounded, size: 36, color: QuantColors.textMuted.withOpacity(0.6)),
          const SizedBox(height: 8),
          const Text('No Events on this date', style: QuantTypography.bodyMedium),
          const SizedBox(height: 4),
          const Text('Tap any highlighted date with dots to inspect agenda.', style: QuantTypography.bodySmall),
        ],
      ),
    );
  }
}
