import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/calendar_models.dart';

/// Public Booking Screen - Calendly-Class Public Booking Engine
///
/// Features `/booking/:slug` host profile, selectable duration chips (15m, 30m, 45m, 60m),
/// selectable time slot chips (10:00 AM, 11:30 AM, 02:00 PM), mutex slot reservation status
/// ('4 slots available today · Instant E2EE Confirmation'), and booking confirmation dialog.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class PublicBookingScreen extends StatefulWidget {
  final String slug;

  const PublicBookingScreen({
    super.key,
    this.slug = 'alex-dev',
  });

  @override
  State<PublicBookingScreen> createState() => _PublicBookingScreenState();
}

class _PublicBookingScreenState extends State<PublicBookingScreen> {
  int _selectedDuration = 30; // 15, 30, 45, 60
  String? _selectedSlotId;
  late List<BookingSlot> _slots;

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _notesController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _slots = BookingSlot.sampleSlots();
    // Default select first available
    _selectedSlotId = _slots.firstWhere((s) => s.isAvailable).id;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _copySlugLink() {
    final url = 'https://quant.me/booking/${widget.slug}';
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Row(
          children: [
            const Icon(Icons.link_rounded, color: QuantColors.sunsetGold, size: 18),
            const SizedBox(width: 8),
            Text(
              'Booking link copied: $url',
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
            ),
          ],
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _confirmReservation() {
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: QuantColors.statusError,
          content: Text('Please enter your name to reserve this slot.'),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    Future.delayed(const Duration(milliseconds: 1100), () {
      if (!mounted) return;
      setState(() => _isSubmitting = false);

      final selectedSlot = _slots.firstWhere((s) => s.id == _selectedSlotId);

      showDialog(
        context: context,
        builder: (context) {
          return AlertDialog(
            backgroundColor: QuantColors.darkSlateCard,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    color: QuantColors.statusSuccess.withOpacity(0.16),
                    shape: BoxShape.circle,
                    border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.4)),
                  ),
                  child: const Icon(Icons.check_rounded, color: QuantColors.statusSuccess, size: 30),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Mutex Slot Reserved!',
                  style: QuantTypography.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'Reserved with ${widget.slug} for ${selectedSlot.timeLabel} (${_selectedDuration}m).',
                  textAlign: TextAlign.center,
                  style: QuantTypography.bodySecondary,
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: Column(
                    children: [
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('E2EE Confirmation', style: QuantTypography.bodySmall),
                          QuantBadge(
                            label: 'ATOMIC MUTEX LOCK',
                            variant: QuantBadgeVariant.success,
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'QuantMeet video link & RFC 5545 CalDAV invite dispatched to ${_emailController.text.trim().isEmpty ? 'guest' : _emailController.text.trim()}.',
                        style: QuantTypography.microCapsule.copyWith(color: QuantColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  _nameController.clear();
                  _emailController.clear();
                  _notesController.clear();
                },
                child: const Text('Done', style: TextStyle(color: QuantColors.sunsetGold)),
              ),
            ],
          );
        },
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final availableSlotsCount = _slots.where((s) => s.isAvailable).length;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Host Profile Card
              _buildHostCard(),

              const SizedBox(height: 14),

              // Mutex Status Banner
              _buildMutexStatusBanner(availableSlotsCount),

              const SizedBox(height: 18),

              // Duration Picker Chips (15m, 30m, 45m, 60m)
              _buildDurationPicker(),

              const SizedBox(height: 20),

              // Selectable Time Slots Grid
              _buildTimeSlotsGrid(),

              const SizedBox(height: 22),

              // Guest Information Inputs
              _buildGuestInputs(),

              const SizedBox(height: 24),

              // Instant Confirmation CTA Button
              SquircleButton(
                label: 'Confirm Sovereign Reservation',
                icon: Icons.lock_clock_rounded,
                isFullWidth: true,
                height: 52,
                backgroundColor: QuantColors.sunsetGold,
                textColor: QuantColors.voidObsidian,
                isLoading: _isSubmitting,
                onPressed: _confirmReservation,
              ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHostCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          Row(
            children: [
              // Host Squircle Avatar
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.sunsetGold, QuantColors.moltenAmber],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.sunsetGold.withOpacity(0.3),
                      blurRadius: 10,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: const Center(
                  child: Text(
                    'AQ',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: QuantColors.voidObsidian,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),

              // Host Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Alex Quant',
                          style: QuantTypography.titleMedium.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(Icons.verified_rounded, size: 16, color: QuantColors.sunsetGold),
                      ],
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Staff Architect · Sovereign Suite Lead',
                      style: QuantTypography.bodySmall,
                    ),
                  ],
                ),
              ),

              // Copy Link Action
              IconButton(
                icon: const Icon(Icons.share_rounded, color: QuantColors.textSecondary, size: 20),
                onPressed: _copySlugLink,
                tooltip: 'Share Booking Link',
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Slug Pill
          GestureDetector(
            onTap: _copySlugLink,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: QuantColors.voidObsidian,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Row(
                children: [
                  const Icon(Icons.link_rounded, size: 16, color: QuantColors.sunsetGold),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'quant.me/booking/${widget.slug}',
                      style: QuantTypography.labelSpeed.copyWith(color: QuantColors.textPrimary),
                    ),
                  ),
                  const Text('COPY', style: TextStyle(fontSize: 10, color: QuantColors.sunsetGold, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMutexStatusBanner(int availableCount) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.sunsetGold.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: QuantColors.statusSuccess,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$availableCount slots available today · Instant E2EE Confirmation',
              style: QuantTypography.bodySmall.copyWith(
                color: QuantColors.textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const QuantBadge(
            label: 'MUTEX LOCK',
            variant: QuantBadgeVariant.success,
          ),
        ],
      ),
    );
  }

  Widget _buildDurationPicker() {
    final durations = [15, 30, 45, 60];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'SELECT DURATION',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: durations.map((mins) {
            final isSelected = _selectedDuration == mins;
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4.0),
                child: GestureDetector(
                  onTap: () => setState(() => _selectedDuration = mins),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    height: 42,
                    decoration: BoxDecoration(
                      color: isSelected ? QuantColors.sunsetGold : QuantColors.darkSlateCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? QuantColors.sunsetGold : QuantColors.hairlineBorder,
                      ),
                      boxShadow: isSelected
                          ? [
                              BoxShadow(
                                color: QuantColors.sunsetGold.withOpacity(0.3),
                                blurRadius: 8,
                                spreadRadius: 1,
                              ),
                            ]
                          : [],
                    ),
                    child: Center(
                      child: Text(
                        '${mins}m',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: isSelected ? QuantColors.voidObsidian : QuantColors.textPrimary,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildTimeSlotsGrid() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'AVAILABLE TIME SLOTS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                color: QuantColors.textMuted,
              ),
            ),
            Text(
              'Timezone: IST (UTC+5:30)',
              style: QuantTypography.microCapsule.copyWith(color: QuantColors.textSecondary),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: _slots.map((slot) {
            final isSelected = slot.id == _selectedSlotId;
            final isAvailable = slot.isAvailable;

            return GestureDetector(
              onTap: isAvailable ? () => setState(() => _selectedSlotId = slot.id) : null,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: !isAvailable
                      ? QuantColors.voidObsidian.withOpacity(0.5)
                      : (isSelected ? QuantColors.sunsetGold.withOpacity(0.2) : QuantColors.darkSlateCard),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: !isAvailable
                        ? QuantColors.hairlineBorder.withOpacity(0.5)
                        : (isSelected ? QuantColors.sunsetGold : QuantColors.hairlineBorder),
                    width: isSelected ? 1.5 : 1.0,
                  ),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: QuantColors.sunsetGold.withOpacity(0.25),
                            blurRadius: 10,
                            spreadRadius: 1,
                          ),
                        ]
                      : [],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      !isAvailable
                          ? Icons.block_rounded
                          : (isSelected ? Icons.check_circle_rounded : Icons.schedule_rounded),
                      size: 14,
                      color: !isAvailable
                          ? QuantColors.textDisabled
                          : (isSelected ? QuantColors.sunsetGold : QuantColors.textSecondary),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      slot.timeLabel,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                        color: !isAvailable
                            ? QuantColors.textDisabled
                            : (isSelected ? QuantColors.textPrimary : QuantColors.textSecondary),
                        decoration: !isAvailable ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    if (!isAvailable) ...[
                      const SizedBox(width: 6),
                      const Text(
                        'TAKEN',
                        style: TextStyle(fontSize: 9, color: QuantColors.textDisabled, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildGuestInputs() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'GUEST DETAILS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 10),
        _buildTextField(
          controller: _nameController,
          label: 'Your Name *',
          icon: Icons.person_outline_rounded,
        ),
        const SizedBox(height: 10),
        _buildTextField(
          controller: _emailController,
          label: 'Work Email (CalDAV invite) *',
          icon: Icons.mail_outline_rounded,
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 10),
        _buildTextField(
          controller: _notesController,
          label: 'Meeting Topic / Objective',
          icon: Icons.notes_rounded,
          maxLines: 2,
        ),
      ],
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      style: const TextStyle(color: QuantColors.textPrimary, fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
        prefixIcon: Icon(icon, color: QuantColors.textSecondary, size: 18),
        filled: true,
        fillColor: QuantColors.darkSlateCard,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
    );
  }
}
