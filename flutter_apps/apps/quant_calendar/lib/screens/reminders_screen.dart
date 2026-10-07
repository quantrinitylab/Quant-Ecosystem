import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/calendar_models.dart';

/// Reminders Screen - Sovereign Reminders & Task Tracker
///
/// Features priority badges, RFC 5545 recurrence status, interactive completion toggles,
/// and quick reminder modal.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class RemindersScreen extends StatefulWidget {
  const RemindersScreen({super.key});

  @override
  State<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends State<RemindersScreen> {
  late List<CalendarReminder> _reminders;
  String _filter = 'all'; // all, pending, completed

  @override
  void initState() {
    super.initState();
    _reminders = CalendarReminder.sampleReminders();
  }

  void _toggleReminder(String id) {
    setState(() {
      final index = _reminders.indexWhere((r) => r.id == id);
      if (index != -1) {
        final current = _reminders[index];
        _reminders[index] = CalendarReminder(
          id: current.id,
          title: current.title,
          dueTime: current.dueTime,
          isCompleted: !current.isCompleted,
          priority: current.priority,
          category: current.category,
          rrule: current.rrule,
        );
      }
    });
  }

  void _showAddReminderDialog() {
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
          title: const Text('Add Sovereign Reminder', style: QuantTypography.titleLarge),
          content: TextField(
            controller: titleController,
            style: const TextStyle(color: QuantColors.textPrimary),
            decoration: InputDecoration(
              hintText: 'Reminder details...',
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
                  setState(() {
                    _reminders.insert(
                      0,
                      CalendarReminder(
                        id: 'rem-${DateTime.now().millisecondsSinceEpoch}',
                        title: titleController.text.trim(),
                        dueTime: DateTime.now().add(const Duration(hours: 2)),
                        priority: 'High',
                        category: 'Task',
                      ),
                    );
                  });
                }
                Navigator.pop(context);
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _reminders.where((r) {
      if (_filter == 'pending') return !r.isCompleted;
      if (_filter == 'completed') return r.isCompleted;
      return true;
    }).toList();

    final pendingCount = _reminders.where((r) => !r.isCompleted).length;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Status Card
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$pendingCount Active Reminders',
                          style: QuantTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Synced via CalDAV VTODO RFC 5545 protocol',
                          style: QuantTypography.bodySmall,
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_circle_rounded, color: QuantColors.sunsetGold, size: 28),
                      onPressed: _showAddReminderDialog,
                      tooltip: 'Add Reminder',
                    ),
                  ],
                ),
              ),
            ),

            // Filter Chips
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
              child: Row(
                children: [
                  _buildFilterChip('all', 'All (${_reminders.length})'),
                  const SizedBox(width: 8),
                  _buildFilterChip('pending', 'Pending ($pendingCount)'),
                  const SizedBox(width: 8),
                  _buildFilterChip('completed', 'Completed (${_reminders.length - pendingCount})'),
                ],
              ),
            ),

            const SizedBox(height: 8),

            // Reminders List
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                itemCount: filtered.length,
                itemBuilder: (context, index) {
                  final rem = filtered[index];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10.0),
                    child: FrostedCard(
                      borderRadius: 14,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      borderColor: rem.isCompleted
                          ? QuantColors.hairlineBorder.withOpacity(0.5)
                          : QuantColors.hairlineBorder,
                      backgroundColor: QuantColors.darkSlateCard,
                      child: Row(
                        children: [
                          GestureDetector(
                            onTap: () => _toggleReminder(rem.id),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              width: 22,
                              height: 22,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: rem.isCompleted
                                    ? QuantColors.statusSuccess
                                    : Colors.transparent,
                                border: Border.all(
                                  color: rem.isCompleted
                                      ? QuantColors.statusSuccess
                                      : QuantColors.textMuted,
                                  width: 1.5,
                                ),
                              ),
                              child: rem.isCompleted
                                  ? const Icon(Icons.check_rounded, size: 14, color: QuantColors.voidObsidian)
                                  : null,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  rem.title,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: rem.isCompleted
                                        ? QuantColors.textMuted
                                        : QuantColors.textPrimary,
                                    decoration: rem.isCompleted
                                        ? TextDecoration.lineThrough
                                        : null,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    const Icon(Icons.schedule_rounded, size: 12, color: QuantColors.textMuted),
                                    const SizedBox(width: 4),
                                    Text(
                                      'Due in ${rem.dueTime.difference(DateTime.now()).inHours}h · ${rem.category}',
                                      style: QuantTypography.bodySmall,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          QuantBadge(
                            label: rem.priority.toUpperCase(),
                            variant: rem.priority == 'High'
                                ? QuantBadgeVariant.error
                                : QuantBadgeVariant.neutral,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: QuantColors.sunsetGold,
        foregroundColor: QuantColors.voidObsidian,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        onPressed: _showAddReminderDialog,
        child: const Icon(Icons.add_rounded),
      ),
    );
  }

  Widget _buildFilterChip(String key, String label) {
    final isSelected = _filter == key;
    return GestureDetector(
      onTap: () => setState(() => _filter = key),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? QuantColors.sunsetGold : QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? QuantColors.sunsetGold : QuantColors.hairlineBorder,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? QuantColors.voidObsidian : QuantColors.textSecondary,
          ),
        ),
      ),
    );
  }
}
