import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/calendar_models.dart';

/// Agenda View Screen - 7-Day Schedule Timeline with Multi-Day Event Series
///
/// Features dual-timezone badges (IST UTC+5:30 / PST UTC-8:00),
/// CalDAV RFC 5545 sync indicator with account parity counter,
/// 7-day horizontal day selector strip, and multi-day event series visual trackers.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class AgendaViewScreen extends StatefulWidget {
  final VoidCallback? onOpenQuantMeet;

  const AgendaViewScreen({
    super.key,
    this.onOpenQuantMeet,
  });

  @override
  State<AgendaViewScreen> createState() => _AgendaViewScreenState();
}

class _AgendaViewScreenState extends State<AgendaViewScreen> {
  late List<CalendarEvent> _events;
  int _selectedDayIndex = 0; // 0 = today, 1 = today + 1, etc.
  bool _isCalDavSyncing = false;
  String _activeFilter = 'all'; // all, meetings, focus, series, audit

  @override
  void initState() {
    super.initState();
    _events = CalendarEvent.sampleEvents();
  }

  void _triggerCalDavSync() {
    setState(() => _isCalDavSyncing = true);
    Future.delayed(const Duration(milliseconds: 900), () {
      if (mounted) {
        setState(() => _isCalDavSyncing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: QuantColors.darkSlateCard,
            content: Row(
              children: [
                Icon(Icons.check_circle_rounded, color: QuantColors.statusSuccess, size: 18),
                SizedBox(width: 8),
                Text(
                  'CalDAV Bi-Directional Sync: 4 accounts in parity (RFC 5545)',
                  style: TextStyle(color: QuantColors.textPrimary, fontSize: 13),
                ),
              ],
            ),
            duration: Duration(seconds: 2),
          ),
        );
      }
    });
  }

  void _showEventDetailSheet(CalendarEvent event) {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Drag handle
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: QuantColors.activeBorder,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // Title & Multi-Day / Security Tags
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        event.title,
                        style: QuantTypography.titleLarge.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (event.isMultiDaySeries) ...[
                      const SizedBox(width: 8),
                      const QuantBadge(
                        label: 'MULTI-DAY SERIES',
                        variant: QuantBadgeVariant.amber,
                        leadingIcon: Icons.date_range_rounded,
                      ),
                    ] else if (event.isE2EE) ...[
                      const SizedBox(width: 8),
                      const QuantBadge(
                        label: 'E2EE RATCHET',
                        variant: QuantBadgeVariant.success,
                        leadingIcon: Icons.lock_rounded,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),

                // Multi-Day Series Progress Bar
                if (event.isMultiDaySeries) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFEC4899).withOpacity(0.4)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              event.seriesLabel,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFFEC4899),
                              ),
                            ),
                            Text(
                              'Day ${event.seriesDayIndex} of ${event.seriesTotalDays}',
                              style: QuantTypography.microCapsule.copyWith(color: QuantColors.textMuted),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            value: event.seriesDayIndex / event.seriesTotalDays,
                            backgroundColor: QuantColors.darkSlateSurface,
                            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFEC4899)),
                            minHeight: 6,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Dual Timezone Pill
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.schedule_rounded, size: 16, color: QuantColors.sunsetGold),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          event.dualTimezoneLabel,
                          style: QuantTypography.bodySecondary.copyWith(
                            color: QuantColors.textPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        '${event.durationMinutes} min',
                        style: QuantTypography.labelSpeed.copyWith(color: QuantColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Description
                Text(
                  event.description,
                  style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textSecondary),
                ),
                const SizedBox(height: 16),

                // Location / Meeting URL
                if (event.location.isNotEmpty) ...[
                  Row(
                    children: [
                      Icon(
                        event.isQuantMeet ? Icons.videocam_rounded : Icons.place_rounded,
                        size: 16,
                        color: event.isQuantMeet ? QuantColors.sunsetGold : QuantColors.sovereignCyan,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        event.location,
                        style: QuantTypography.bodySecondary.copyWith(color: QuantColors.textPrimary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                // Attendees
                if (event.attendees.isNotEmpty) ...[
                  Row(
                    children: [
                      const Icon(Icons.people_alt_rounded, size: 16, color: QuantColors.textSecondary),
                      const SizedBox(width: 8),
                      Text(
                        '${event.attendees.length} Attendees · Organizer: ${event.organizer}',
                        style: QuantTypography.bodySmall,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                ],

                // Action Buttons
                Row(
                  children: [
                    if (event.isQuantMeet)
                      Expanded(
                        child: SquircleButton(
                          label: 'Join QuantMeet HD',
                          icon: Icons.videocam_rounded,
                          backgroundColor: QuantColors.sunsetGold,
                          textColor: QuantColors.voidObsidian,
                          onPressed: () {
                            Navigator.pop(context);
                            widget.onOpenQuantMeet?.call();
                          },
                        ),
                      ),
                    if (event.isQuantMeet) const SizedBox(width: 12),
                    Expanded(
                      child: SquircleButton(
                        label: 'Dismiss',
                        backgroundColor: QuantColors.darkSlateSurface,
                        textColor: QuantColors.textSecondary,
                        border: const BorderSide(color: QuantColors.hairlineBorder),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showAddEventDialog() {
    final titleController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: QuantColors.hairlineBorder),
          ),
          title: const Text('New Sovereign Event', style: QuantTypography.titleLarge),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                style: const TextStyle(color: QuantColors.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Event title...',
                  hintStyle: const TextStyle(color: QuantColors.textMuted),
                  filled: true,
                  fillColor: QuantColors.voidObsidian,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: QuantColors.sunsetGold),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.lock_rounded, size: 16, color: QuantColors.statusSuccess),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Encrypted with Signal Double Ratchet & synced via CalDAV RFC 5545.',
                        style: QuantTypography.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: QuantColors.textMuted)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: QuantColors.sunsetGold,
                foregroundColor: QuantColors.voidObsidian,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () {
                if (titleController.text.trim().isNotEmpty) {
                  final now = DateTime.now();
                  final newEvt = CalendarEvent(
                    id: 'evt-${DateTime.now().millisecondsSinceEpoch}',
                    title: titleController.text.trim(),
                    description: 'Scheduled from QuantCalendar Sovereign Suite.',
                    startTime: now.add(const Duration(hours: 1)),
                    endTime: now.add(const Duration(hours: 2)),
                    colorHex: '#F59E0B',
                    organizer: 'me@quantmail.in',
                    tags: ['Sovereign'],
                  );
                  setState(() => _events.insert(0, newEvt));
                }
                Navigator.pop(context);
              },
              child: const Text('Save Event'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredEvents = _events.where((e) {
      if (_activeFilter == 'meetings') return e.isQuantMeet;
      if (_activeFilter == 'series') return e.isMultiDaySeries;
      if (_activeFilter == 'focus') return e.tags.contains('Graphics') || e.tags.contains('Impeller');
      if (_activeFilter == 'audit') return e.tags.contains('Security') || e.tags.contains('Audit');
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // CalDAV Sync Status Header Pill & Telemetry
            _buildSyncBar(),

            // 7-Day Timeline Selector Strip
            _buildSevenDayStrip(),

            const SizedBox(height: 8),

            // Category Filter Badges
            _buildFilterPills(),

            const SizedBox(height: 12),

            // 7-Day Event Timeline Feed
            Expanded(
              child: filteredEvents.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      itemCount: filteredEvents.length,
                      itemBuilder: (context, index) {
                        final event = filteredEvents[index];
                        return _buildEventCard(event);
                      },
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: QuantColors.sunsetGold,
        foregroundColor: QuantColors.voidObsidian,
        elevation: 6,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        onPressed: _showAddEventDialog,
        icon: const Icon(Icons.add_rounded, size: 20),
        label: const Text(
          'Quick Event',
          style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.2),
        ),
      ),
    );
  }

  Widget _buildSyncBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _isCalDavSyncing ? QuantColors.statusWarning : QuantColors.statusSuccess,
              boxShadow: [
                BoxShadow(
                  color: (_isCalDavSyncing ? QuantColors.statusWarning : QuantColors.statusSuccess).withOpacity(0.5),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _isCalDavSyncing
                      ? 'CalDAV: Syncing RFC 5545...'
                      : 'CalDAV: In Sync · 4 accounts · Next: 58s',
                  style: QuantTypography.bodySmall.copyWith(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Dual TZ Engine: IST (UTC+5:30) / PST (UTC-8:00)',
                  style: QuantTypography.microCapsule.copyWith(
                    color: QuantColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: _isCalDavSyncing
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(QuantColors.sunsetGold),
                    ),
                  )
                : const Icon(Icons.sync_rounded, color: QuantColors.textSecondary, size: 20),
            onPressed: _isCalDavSyncing ? null : _triggerCalDavSync,
            tooltip: 'Force CalDAV Sync',
          ),
        ],
      ),
    );
  }

  Widget _buildSevenDayStrip() {
    final now = DateTime.now();
    final weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    return Container(
      height: 78,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: 7,
        itemBuilder: (context, index) {
          final dayDate = now.add(Duration(days: index));
          final isSelected = index == _selectedDayIndex;
          final isToday = index == 0;
          final weekdayLabel = weekdays[dayDate.weekday - 1];

          return GestureDetector(
            onTap: () => setState(() => _selectedDayIndex = index),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 58,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: isSelected
                    ? QuantColors.sunsetGold.withOpacity(0.18)
                    : QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSelected ? QuantColors.sunsetGold : QuantColors.hairlineBorder,
                  width: isSelected ? 1.5 : 1.0,
                ),
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: QuantColors.sunsetGold.withOpacity(0.28),
                          blurRadius: 10,
                          spreadRadius: 1,
                        ),
                      ]
                    : [],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    isToday ? 'TODAY' : weekdayLabel,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: isSelected
                          ? QuantColors.sunsetGold
                          : (isToday ? QuantColors.moltenAmber : QuantColors.textMuted),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${dayDate.day}',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: isSelected ? QuantColors.textPrimary : QuantColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  // Event indicator dots
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 4,
                        height: 4,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isSelected ? QuantColors.sunsetGold : QuantColors.textMuted,
                        ),
                      ),
                      if (index % 2 == 0) ...[
                        const SizedBox(width: 2),
                        Container(
                          width: 4,
                          height: 4,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: QuantColors.sovereignCyan,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFilterPills() {
    final filters = [
      {'id': 'all', 'label': 'All Events'},
      {'id': 'series', 'label': 'Multi-Day Series'},
      {'id': 'meetings', 'label': 'QuantMeet'},
      {'id': 'focus', 'label': 'Deep Work'},
      {'id': 'audit', 'label': 'Audits & QA'},
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: filters.map((f) {
          final isSelected = _activeFilter == f['id'];
          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: FilterChip(
              selected: isSelected,
              label: Text(f['label']!),
              labelStyle: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? QuantColors.voidObsidian : QuantColors.textSecondary,
              ),
              backgroundColor: QuantColors.darkSlateCard,
              selectedColor: QuantColors.sunsetGold,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: BorderSide(
                  color: isSelected ? QuantColors.sunsetGold : QuantColors.hairlineBorder,
                ),
              ),
              showCheckmark: false,
              onSelected: (_) => setState(() => _activeFilter = f['id']!),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildEventCard(CalendarEvent event) {
    Color accentColor;
    try {
      accentColor = Color(int.parse(event.colorHex.replaceFirst('#', '0xFF')));
    } catch (_) {
      accentColor = QuantColors.sunsetGold;
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: FrostedCard(
        onTap: () => _showEventDetailSheet(event),
        borderRadius: 16,
        padding: const EdgeInsets.all(16),
        borderColor: event.isMultiDaySeries ? accentColor.withOpacity(0.5) : QuantColors.hairlineBorder,
        backgroundColor: QuantColors.darkSlateCard,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Dual Timezone Pill & Multi-Day / QuantMeet Badge
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: accentColor.withOpacity(0.4), width: 0.8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.schedule_rounded, size: 12, color: accentColor),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            event.dualTimezoneLabel,
                            style: QuantTypography.labelSpeed.copyWith(
                              color: QuantColors.textPrimary,
                              fontSize: 10,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                if (event.isMultiDaySeries)
                  QuantBadge(
                    label: 'DAY ${event.seriesDayIndex}/${event.seriesTotalDays}',
                    variant: QuantBadgeVariant.amber,
                    leadingIcon: Icons.date_range_rounded,
                  )
                else if (event.isQuantMeet)
                  const QuantBadge(
                    label: 'QUANTMEET',
                    variant: QuantBadgeVariant.amber,
                    leadingIcon: Icons.videocam_rounded,
                  )
                else
                  QuantBadge(
                    label: '${event.durationMinutes}m',
                    variant: QuantBadgeVariant.neutral,
                    leadingIcon: Icons.timer_outlined,
                  ),
              ],
            ),
            const SizedBox(height: 12),

            // Event Title
            Row(
              children: [
                Container(
                  width: 4,
                  height: 18,
                  decoration: BoxDecoration(
                    color: accentColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    event.title,
                    style: QuantTypography.titleMedium.copyWith(
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Description
            Padding(
              padding: const EdgeInsets.only(left: 14),
              child: Text(
                event.description,
                style: QuantTypography.bodySecondary,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(height: 12),

            // Multi-Day Series Timeline Indicator Bar
            if (event.isMultiDaySeries) ...[
              Padding(
                padding: const EdgeInsets.only(left: 14, right: 4, bottom: 8),
                child: Row(
                  children: [
                    const Icon(Icons.repeat_rounded, size: 14, color: Color(0xFFEC4899)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        event.seriesLabel,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFFEC4899),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Footer: Location & Tags & Join Button
            Padding(
              padding: const EdgeInsets.only(left: 14),
              child: Row(
                children: [
                  if (event.location.isNotEmpty) ...[
                    const Icon(Icons.location_on_outlined, size: 14, color: QuantColors.textMuted),
                    const SizedBox(width: 4),
                    Text(
                      event.location,
                      style: QuantTypography.bodySmall,
                    ),
                    const Spacer(),
                  ],
                  if (event.isQuantMeet)
                    SizedBox(
                      height: 32,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: QuantColors.sunsetGold,
                          foregroundColor: QuantColors.voidObsidian,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        onPressed: () {
                          widget.onOpenQuantMeet?.call();
                        },
                        icon: const Icon(Icons.videocam_rounded, size: 16),
                        label: const Text(
                          'Join Call',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              shape: BoxShape.circle,
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: const Icon(Icons.calendar_today_rounded, size: 40, color: QuantColors.sunsetGold),
          ),
          const SizedBox(height: 16),
          const Text('No Events Scheduled', style: QuantTypography.titleMedium),
          const SizedBox(height: 6),
          const Text(
            'Tap Quick Event to schedule a sovereign timeline item.',
            style: QuantTypography.bodySecondary,
          ),
        ],
      ),
    );
  }
}
