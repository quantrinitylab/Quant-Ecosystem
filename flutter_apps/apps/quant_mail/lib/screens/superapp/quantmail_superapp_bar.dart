import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

/// Official Sovereign Quant Monogram Custom Painter
///
/// Features Impeller hardware-accelerated 120Hz rendering:
/// - Luxury dual-gradient outer orbital ring.
/// - Inner glowing quantum core jewel.
/// - 45-degree tangent Q tail with rounded cap.
/// - Strictly ZERO Skia clipPath invocations and ZERO raw Unicode emojis.
class QuantMonogramPainter extends CustomPainter {
  final Color primaryColor;
  final Color secondaryColor;
  final double strokeWidth;

  const QuantMonogramPainter({
    this.primaryColor = QuantColors.moltenAmber,
    this.secondaryColor = QuantColors.sovereignCyan,
    this.strokeWidth = 3.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth * 2) / 2;

    // 1. Luxury Outer Gradient Ring (Zero clipPath)
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [primaryColor, secondaryColor],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    canvas.drawCircle(center, radius, ringPaint);

    // 2. Inner Quantum Core (Glowing center jewel)
    final corePaint = Paint()
      ..style = PaintingStyle.fill
      ..color = primaryColor;
    canvas.drawCircle(center, radius * 0.28, corePaint);

    // 3. Diagonal Q Tangent Tail (45 degrees from bottom-right)
    final tailPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = secondaryColor;

    final startX = center.dx + radius * 0.45;
    final startY = center.dy + radius * 0.45;
    final endX = size.width - strokeWidth / 2;
    final endY = size.height - strokeWidth / 2;

    canvas.drawLine(Offset(startX, startY), Offset(endX, endY), tailPaint);
  }

  @override
  bool shouldRepaint(covariant QuantMonogramPainter oldDelegate) {
    return oldDelegate.primaryColor != primaryColor ||
        oldDelegate.secondaryColor != secondaryColor ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

/// Official Sovereign Quant Monogram Logo Widget
class QuantMonogramLogo extends StatelessWidget {
  final double size;
  final Color primaryColor;
  final Color secondaryColor;

  const QuantMonogramLogo({
    super.key,
    this.size = 28.0,
    this.primaryColor = QuantColors.moltenAmber,
    this.secondaryColor = QuantColors.sovereignCyan,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: QuantMonogramPainter(
          primaryColor: primaryColor,
          secondaryColor: secondaryColor,
          strokeWidth: (size * 0.1).clamp(2.0, 4.0),
        ),
      ),
    );
  }
}

/// Sovereign QuantMail Super-App Multi-Tier Header Bar
///
/// Features 3 distinct functional tiers:
/// - Brand Identity: Canonical 'QuantMail' logo with official monogram.
/// - Tier 1: Workspace selector pill ('Quant Trinity Lab [v]') + Global Voice & QR Search Bar.
/// - Tier 2: 5-Pillar Horizontal Mini-App Rail (Mail, Calendar, Drive, Contacts, QuantGit)
///   with live badge counts, jewel-tone accents, and smooth tab switching.
///
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class QuantMailSuperAppBar extends StatelessWidget implements PreferredSizeWidget {
  final QuantPillar activePillar;
  final ValueChanged<QuantPillar> onPillarSelected;
  final String activeWorkspace;
  final VoidCallback? onWorkspaceTap;
  final TextEditingController? searchController;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback? onVoiceSearchTap;
  final VoidCallback? onQrScanTap;
  final VoidCallback? onProfileTap;
  final Map<QuantPillar, int>? pillarBadges;
  final bool isListeningVoice;

  const QuantMailSuperAppBar({
    super.key,
    required this.activePillar,
    required this.onPillarSelected,
    this.activeWorkspace = 'Quant Trinity Lab',
    this.onWorkspaceTap,
    this.searchController,
    this.onSearchChanged,
    this.onVoiceSearchTap,
    this.onQrScanTap,
    this.onProfileTap,
    this.pillarBadges,
    this.isListeningVoice = false,
  });

  @override
  Size get preferredSize => const Size.fromHeight(176.0);

  static const List<QuantPillar> _orderedPillars = [
    QuantPillar.mail,
    QuantPillar.calendar,
    QuantPillar.drive,
    QuantPillar.contacts,
    QuantPillar.quantGit,
  ];

  static IconData _getPillarIcon(QuantPillar pillar) {
    switch (pillar) {
      case QuantPillar.mail:
        return Icons.mail_rounded;
      case QuantPillar.calendar:
        return Icons.calendar_month_rounded;
      case QuantPillar.drive:
        return Icons.folder_rounded;
      case QuantPillar.contacts:
        return Icons.contacts_rounded;
      case QuantPillar.quantGit:
        return Icons.code_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(
            color: QuantColors.hairlineBorder,
            width: 1.0,
          ),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16.0, 8.0, 16.0, 8.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Tier 0: Brand Identity & Workspace Selector
              _buildBrandAndWorkspaceRow(context),

              const SizedBox(height: 10.0),

              // Tier 1: Global Search Bar with Voice and QR Scanner
              _buildGlobalSearchBar(context),

              const SizedBox(height: 10.0),

              // Tier 2: 5-Pillar Horizontal Mini-App Rail
              _build5PillarRail(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBrandAndWorkspaceRow(BuildContext context) {
    return Row(
      children: [
        // Canonical Brand Monogram Logo
        const QuantMonogramLogo(
          size: 30.0,
          primaryColor: QuantColors.moltenAmber,
          secondaryColor: QuantColors.sovereignCyan,
        ),

        const SizedBox(width: 8.0),

        // Canonical Brand Wordmark
        RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: 'Quant',
                style: QuantTypography.titleMedium.copyWith(
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
              TextSpan(
                text: 'Mail',
                style: QuantTypography.titleMedium.copyWith(
                  fontWeight: FontWeight.w800,
                  color: QuantColors.moltenAmber,
                  letterSpacing: -0.5,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(width: 6.0),

        // Sovereign Pill Tag
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 5.0, vertical: 1.5),
          decoration: BoxDecoration(
            color: QuantColors.moltenAmber.withOpacity(0.12),
            borderRadius: BorderRadius.circular(4.0),
            border: Border.all(
              color: QuantColors.moltenAmber.withOpacity(0.4),
              width: 0.8,
            ),
          ),
          child: Text(
            'SOVEREIGN',
            style: QuantTypography.pillarLabel.copyWith(
              color: QuantColors.moltenAmber,
              fontSize: 8.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ),

        const Spacer(),

        // Workspace Selector Pill ("Quant Trinity Lab [v]")
        GestureDetector(
          onTap: onWorkspaceTap,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 5.0),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(8.0),
              border: Border.all(
                color: QuantColors.hairlineBorder,
                width: 1.0,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.business_rounded,
                  size: 13.0,
                  color: QuantColors.moltenAmber,
                ),
                const SizedBox(width: 5.0),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 110.0),
                  child: Text(
                    activeWorkspace,
                    overflow: TextOverflow.ellipsis,
                    style: QuantTypography.pillarLabel.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 11.5,
                    ),
                  ),
                ),
                const SizedBox(width: 3.0),
                const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 14.0,
                  color: Colors.white70,
                ),
              ],
            ),
          ),
        ),

        const SizedBox(width: 8.0),

        // Profile Avatar with Verified Beacon
        GestureDetector(
          onTap: onProfileTap,
          behavior: HitTestBehavior.opaque,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 30.0,
                height: 30.0,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF6366F1), Color(0xFFA855F7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(8.0),
                  border: Border.all(
                    color: QuantColors.hairlineBorder,
                    width: 1.0,
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  'AM',
                  style: QuantTypography.pillarLabel.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 11.0,
                  ),
                ),
              ),
              Positioned(
                bottom: -1.0,
                right: -1.0,
                child: Container(
                  width: 8.0,
                  height: 8.0,
                  decoration: BoxDecoration(
                    color: QuantColors.emeraldMatrix,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: QuantColors.voidObsidian,
                      width: 1.5,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildGlobalSearchBar(BuildContext context) {
    return Container(
      height: 42.0,
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(10.0),
        border: Border.all(
          color: isListeningVoice
              ? Colors.redAccent.withOpacity(0.8)
              : QuantColors.hairlineBorder,
          width: 1.0,
        ),
      ),
      child: Row(
        children: [
          const SizedBox(width: 10.0),
          const Icon(
            Icons.search_rounded,
            size: 18.0,
            color: QuantColors.moltenAmber,
          ),
          const SizedBox(width: 8.0),
          Expanded(
            child: TextField(
              controller: searchController,
              onChanged: onSearchChanged,
              style: QuantTypography.bodyMedium.copyWith(
                color: Colors.white,
                fontSize: 13.0,
              ),
              decoration: InputDecoration(
                hintText: _getPlaceholderForPillar(activePillar),
                hintStyle: QuantTypography.bodyMedium.copyWith(
                  color: Colors.white38,
                  fontSize: 12.0,
                ),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 10.0),
              ),
            ),
          ),
          // QR Code Scanner Action
          IconButton(
            icon: const Icon(
              Icons.qr_code_scanner_rounded,
              size: 17.0,
              color: Colors.white70,
            ),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32.0, minHeight: 32.0),
            splashRadius: 18.0,
            tooltip: 'Scan QR Code',
            onPressed: onQrScanTap,
          ),
          // Voice Search Mic Action
          IconButton(
            icon: Icon(
              Icons.mic_rounded,
              size: 17.0,
              color: isListeningVoice ? Colors.redAccent : QuantColors.moltenAmber,
            ),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32.0, minHeight: 32.0),
            splashRadius: 18.0,
            tooltip: 'Voice Search (VAD)',
            onPressed: onVoiceSearchTap,
          ),
          const SizedBox(width: 4.0),
        ],
      ),
    );
  }

  Widget _build5PillarRail(BuildContext context) {
    return Row(
      children: _orderedPillars.map((pillar) {
        final isSelected = pillar == activePillar;
        final badgeCount = pillarBadges?[pillar] ?? 0;
        final accent = pillar.accentColor;
        final icon = _getPillarIcon(pillar);

        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2.5),
            child: GestureDetector(
              onTap: () => onPillarSelected(pillar),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                height: 48.0,
                decoration: BoxDecoration(
                  color: isSelected
                      ? QuantColors.darkSlateCard
                      : QuantColors.darkSlateCard.withOpacity(0.35),
                  borderRadius: BorderRadius.circular(9.0),
                  border: Border.all(
                    color: isSelected
                        ? accent.withOpacity(0.85)
                        : QuantColors.hairlineBorder,
                    width: isSelected ? 1.2 : 0.8,
                  ),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: accent.withOpacity(0.22),
                            blurRadius: 6.0,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Icon(
                          icon,
                          size: 17.0,
                          color: isSelected ? accent : Colors.white60,
                        ),
                        if (badgeCount > 0)
                          Positioned(
                            top: -4.0,
                            right: -9.0,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 3.5,
                                vertical: 1.0,
                              ),
                              decoration: BoxDecoration(
                                color: accent,
                                borderRadius: BorderRadius.circular(5.0),
                              ),
                              constraints: const BoxConstraints(
                                minWidth: 13.0,
                                minHeight: 12.0,
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                badgeCount > 99 ? '99+' : badgeCount.toString(),
                                style: const TextStyle(
                                  color: Colors.black,
                                  fontSize: 8.0,
                                  fontWeight: FontWeight.w800,
                                  height: 1.0,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 3.0),
                    Text(
                      pillar.label,
                      style: TextStyle(
                        color: isSelected ? Colors.white : Colors.white60,
                        fontSize: 10.0,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        letterSpacing: -0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  String _getPlaceholderForPillar(QuantPillar pillar) {
    switch (pillar) {
      case QuantPillar.mail:
        return 'Search emails, threads, drafts... <5ms index';
      case QuantPillar.calendar:
        return 'Search events, slots, meetings... <5ms index';
      case QuantPillar.drive:
        return 'Search files, vault, chunks... FastCDC <5ms';
      case QuantPillar.contacts:
        return 'Search contacts, VIPs, circles... <5ms index';
      case QuantPillar.quantGit:
        return 'Search repos, commits, PRs, issues... <5ms';
    }
  }
}
