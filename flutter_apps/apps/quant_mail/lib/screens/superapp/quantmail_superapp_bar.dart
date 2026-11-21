import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

/// Canonical per-pillar visual tokens matching QuantMail Chrome Mobile 1:1.
class PillarVisuals {
  static Color accentFor(QuantPillar pillar) {
    switch (pillar) {
      case QuantPillar.mail:
        return const Color(0xFFFF6B35);
      case QuantPillar.calendar:
        return const Color(0xFF4285F4);
      case QuantPillar.drive:
        return const Color(0xFF34A853);
      case QuantPillar.contacts:
        return const Color(0xFFF59E0B);
      case QuantPillar.quantGit:
        return const Color(0xFF8B5CF6);
    }
  }

  static String mascotMdFor(QuantPillar pillar) {
    switch (pillar) {
      case QuantPillar.mail:
        return 'assets/mascots/mail-md.png';
      case QuantPillar.calendar:
        return 'assets/mascots/calendar-md.png';
      case QuantPillar.drive:
        return 'assets/mascots/drive-md.png';
      case QuantPillar.contacts:
        return 'assets/mascots/contacts-md.png';
      case QuantPillar.quantGit:
        return 'assets/mascots/quantgit-md.png';
    }
  }

  static String mascotLgFor(QuantPillar pillar) {
    switch (pillar) {
      case QuantPillar.mail:
        return 'assets/mascots/mail-lg.png';
      case QuantPillar.calendar:
        return 'assets/mascots/calendar-lg.png';
      case QuantPillar.drive:
        return 'assets/mascots/drive-lg.png';
      case QuantPillar.contacts:
        return 'assets/mascots/contacts-lg.png';
      case QuantPillar.quantGit:
        return 'assets/mascots/quantgit-lg.png';
    }
  }

  static String searchPlaceholderFor(QuantPillar pillar) {
    switch (pillar) {
      case QuantPillar.mail:
        return 'Search in QuantMail';
      case QuantPillar.calendar:
        return 'Search in Calendar';
      case QuantPillar.drive:
        return 'Search in Drive';
      case QuantPillar.contacts:
        return 'Search in Contacts';
      case QuantPillar.quantGit:
        return 'Search in QuantGit';
    }
  }
}

/// Official Sovereign Quant Monogram Custom Painter (kept for desktop/legacy callers).
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

    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [primaryColor, secondaryColor],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    canvas.drawCircle(center, radius, ringPaint);

    final corePaint = Paint()
      ..style = PaintingStyle.fill
      ..color = primaryColor;
    canvas.drawCircle(center, radius * 0.28, corePaint);

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

/// CustomPainter implementing the upgraded Liquid Glass geometry:
/// - True translucent frosted glass capsule (`#141722`) with top specular rim.
/// - Unclipped S-curve math (`halfTop = 0.25 * segW`, `shoulder = 0.14 * segW`,
///   `foot = 0.09 * segW` => total `0.48 * segW < 0.50 * segW`) so index `0`
///   and `count - 1` NEVER get cut in half vertically at the left/right edges.
/// - Frosted glass active dome with outer ambient halo, specular inner highlight,
///   and connected floor meniscus glow.
class LiquidTrackPainter extends CustomPainter {
  final int count;
  final double animatedIndex;
  final Color accentColor;
  final double radius;
  final double lift;
  final double pad;
  final double topRatio;
  final double flareRatio;
  final bool connectBottomGlow;

  const LiquidTrackPainter({
    required this.count,
    required this.animatedIndex,
    required this.accentColor,
    this.radius = 20.0,
    this.lift = 5.5,
    this.pad = 5.0,
    this.topRatio = 0.25,
    this.flareRatio = 0.14,
    this.connectBottomGlow = true,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final barTop = lift;
    final barRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, barTop, w, h - barTop),
      Radius.circular(radius),
    );

    // 1. Base translucent frosted glass capsule
    final bgPaint = Paint()
      ..style = PaintingStyle.fill
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color(0xE61A1E2B),
          Color(0xF210131B),
        ],
      ).createShader(Rect.fromLTWH(0, barTop, w, h - barTop));
    canvas.drawRRect(barRect, bgPaint);

    // Subtle glass specular top rim + border
    final borderPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Colors.white.withOpacity(0.15),
          Colors.white.withOpacity(0.05),
        ],
      ).createShader(Rect.fromLTWH(0, barTop, w, h - barTop));
    canvas.drawRRect(barRect, borderPaint);

    if (count <= 0) return;

    // 2. Compute unclipped active liquid S-curve geometry
    // Total half-width = (0.25 + 0.14 + 0.09) * segW = 0.48 * segW < 0.50 * segW
    // Guarantees zero vertical clipping at index 0 and index (count - 1).
    final innerW = w - pad * 2;
    final segW = innerW / count;
    final cx = pad + (animatedIndex + 0.5) * segW;

    final halfTop = segW * 0.25;
    final shoulder = segW * 0.14;
    final foot = segW * 0.09;

    final xLFoot = (cx - halfTop - shoulder - foot).clamp(pad, w - pad);
    final xLShoulder = (cx - halfTop - shoulder).clamp(pad, w - pad);
    final xLTop = (cx - halfTop).clamp(pad, w - pad);
    final xRTop = (cx + halfTop).clamp(pad, w - pad);
    final xRShoulder = (cx + halfTop + shoulder).clamp(pad, w - pad);
    final xRFoot = (cx + halfTop + shoulder + foot).clamp(pad, w - pad);

    final yTop = 1.0; // Raised liquid crest
    final yMid = barTop + (h - barTop) * 0.44;
    final yBot = h - 1.2;

    final liquidPath = Path()
      ..moveTo(xLFoot, yBot)
      ..cubicTo(
        xLFoot + foot * 0.55,
        yBot,
        xLShoulder - shoulder * 0.28,
        yMid + 5.5,
        xLShoulder,
        yMid,
      )
      ..cubicTo(
        xLShoulder + shoulder * 0.35,
        barTop + 1.0,
        xLTop - shoulder * 0.25,
        yTop,
        xLTop,
        yTop,
      )
      ..lineTo(xRTop, yTop)
      ..cubicTo(
        xRTop + shoulder * 0.25,
        yTop,
        xRShoulder - shoulder * 0.35,
        barTop + 1.0,
        xRShoulder,
        yMid,
      )
      ..cubicTo(
        xRShoulder + shoulder * 0.28,
        yMid + 5.5,
        xRFoot - foot * 0.55,
        yBot,
        xRFoot,
        yBot,
      )
      ..close();

    // 3. Soft outer ambient halo under the active liquid glass dome
    final haloPaint = Paint()
      ..style = PaintingStyle.fill
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8.0)
      ..color = accentColor.withOpacity(0.24);
    canvas.drawPath(liquidPath, haloPaint);

    // 4. Translucent frosted glass gradient fill (true glassmorphism, not opaque solid paint)
    final fillPaint = Paint()
      ..style = PaintingStyle.fill
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color.lerp(accentColor, Colors.white, 0.28)!.withOpacity(0.50),
          accentColor.withOpacity(0.34),
          accentColor.withOpacity(0.16),
          const Color(0xFF12151E).withOpacity(0.82),
        ],
        stops: const [0.0, 0.30, 0.72, 1.0],
      ).createShader(Rect.fromLTWH(xLFoot, yTop, xRFoot - xLFoot, yBot - yTop));
    canvas.drawPath(liquidPath, fillPaint);

    // 5. Inner glass specular reflection near the top crest
    final specularHighlightRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        xLTop + 3.0,
        yTop + 2.0,
        math.max(4.0, (xRTop - xLTop) - 6.0),
        5.0,
      ),
      const Radius.circular(999.0),
    );
    final specularPaint = Paint()
      ..style = PaintingStyle.fill
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Colors.white.withOpacity(0.26),
          Colors.white.withOpacity(0.0),
        ],
      ).createShader(specularHighlightRect.outerRect);
    canvas.drawRRect(specularHighlightRect, specularPaint);

    // 6. Glowing S-curve crest & shoulder rim stroke
    final crestPath = Path()
      ..moveTo(xLFoot, yBot)
      ..cubicTo(
        xLFoot + foot * 0.55,
        yBot,
        xLShoulder - shoulder * 0.28,
        yMid + 5.5,
        xLShoulder,
        yMid,
      )
      ..cubicTo(
        xLShoulder + shoulder * 0.35,
        barTop + 1.0,
        xLTop - shoulder * 0.25,
        yTop,
        xLTop,
        yTop,
      )
      ..lineTo(xRTop, yTop)
      ..cubicTo(
        xRTop + shoulder * 0.25,
        yTop,
        xRShoulder - shoulder * 0.35,
        barTop + 1.0,
        xRShoulder,
        yMid,
      )
      ..cubicTo(
        xRShoulder + shoulder * 0.28,
        yMid + 5.5,
        xRFoot - foot * 0.55,
        yBot,
        xRFoot,
        yBot,
      );

    final crestGlowPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color.lerp(accentColor, Colors.white, 0.55)!,
          accentColor.withOpacity(0.92),
          accentColor.withOpacity(0.18),
        ],
        stops: const [0.0, 0.45, 1.0],
      ).createShader(Rect.fromLTWH(xLFoot, yTop, xRFoot - xLFoot, yBot - yTop));
    canvas.drawPath(crestPath, crestGlowPaint);

    // 7. Connected floor meniscus flare along the bottom of the active curve
    if (connectBottomGlow) {
      final floorBlurPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.0
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4.0)
        ..shader = LinearGradient(
          colors: [
            Colors.transparent,
            accentColor.withOpacity(0.65),
            Color.lerp(accentColor, Colors.white, 0.45)!,
            accentColor.withOpacity(0.65),
            Colors.transparent,
          ],
        ).createShader(Rect.fromLTWH(xLFoot, yBot - 2, xRFoot - xLFoot, 4));
      canvas.drawLine(Offset(xLFoot, yBot), Offset(xRFoot, yBot), floorBlurPaint);
    }

    final floorPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..shader = LinearGradient(
        colors: [
          Colors.transparent,
          accentColor.withOpacity(0.95),
          Color.lerp(accentColor, Colors.white, 0.45)!,
          accentColor.withOpacity(0.95),
          Colors.transparent,
        ],
      ).createShader(Rect.fromLTWH(xLFoot, yBot - 2, xRFoot - xLFoot, 4));
    canvas.drawLine(Offset(xLFoot, yBot), Offset(xRFoot, yBot), floorPaint);
  }

  @override
  bool shouldRepaint(covariant LiquidTrackPainter oldDelegate) {
    return oldDelegate.count != count ||
        oldDelegate.animatedIndex != animatedIndex ||
        oldDelegate.accentColor != accentColor ||
        oldDelegate.radius != radius ||
        oldDelegate.lift != lift;
  }
}

/// QuantMail Super-App Top Header Bar:
/// - Row 1 (collapsible on scroll-down):
///   - Full-width 5-Pillar Connected Liquid Glass Switcher with ONLY the 5 3D mascot logos
///     (`mail`, `calendar`, `drive`, `contacts`, `quantgit`) — NO extra top-right `QM` circle!
/// - Row 2 (pinned, never hides on scroll — slides to the very top when Row 1 collapses):
///   - Search bar (`Search in QuantMail` + clear + voice mic).
///   - On Mail pillar: Smart Morphing/Sliding `Inbox ↔ Structured` toggle pill right next
///     to the Search bar (`[ ✉️ Inbox | ⊞ ]` ↔ `[ ✉️ | ⊞ Structured ]`).
///   - On other pillars: Circular `⌘` Command Palette button.
///   - Circular `Ember` Quanty AI 3D avatar button (`42x42`) with glowing accent ring.
class QuantMailSuperAppBar extends StatefulWidget implements PreferredSizeWidget {
  final QuantPillar activePillar;
  final ValueChanged<QuantPillar>? onPillarSelected;
  final bool isHeaderHidden;
  final String? activeWorkspace;
  final VoidCallback? onWorkspaceTap;
  final TextEditingController? searchController;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback? onVoiceSearchTap;
  final VoidCallback? onQrScanTap;
  final VoidCallback? onCommandPaletteTap;
  final VoidCallback? onQuantyTap;
  final VoidCallback? onProfileTap;
  final bool isListeningVoice;
  final Map<QuantPillar, int> unreadCounts;
  final String accountInitials;
  final String mailViewMode;
  final ValueChanged<String>? onMailViewModeChanged;

  const QuantMailSuperAppBar({
    super.key,
    required this.activePillar,
    this.onPillarSelected,
    this.isHeaderHidden = false,
    this.activeWorkspace,
    this.onWorkspaceTap,
    this.searchController,
    this.onSearchChanged,
    this.onVoiceSearchTap,
    this.onQrScanTap,
    this.onCommandPaletteTap,
    this.onQuantyTap,
    this.onProfileTap,
    this.isListeningVoice = false,
    this.unreadCounts = const {},
    this.accountInitials = 'QM',
    this.mailViewMode = 'inbox',
    this.onMailViewModeChanged,
  });

  @override
  Size get preferredSize => Size.fromHeight(isHeaderHidden ? 60.0 : 122.0);

  @override
  State<QuantMailSuperAppBar> createState() => _QuantMailSuperAppBarState();
}

class _QuantMailSuperAppBarState extends State<QuantMailSuperAppBar>
    with SingleTickerProviderStateMixin {
  static const List<QuantPillar> _pillars = [
    QuantPillar.mail,
    QuantPillar.calendar,
    QuantPillar.drive,
    QuantPillar.contacts,
    QuantPillar.quantGit,
  ];

  late final AnimationController _spinController;
  QuantPillar? _spinningPillar;

  @override
  void initState() {
    super.initState();
    _spinController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
  }

  @override
  void dispose() {
    _spinController.dispose();
    super.dispose();
  }

  void _handlePillarTap(QuantPillar pillar) {
    if (pillar == widget.activePillar) {
      setState(() => _spinningPillar = pillar);
      _spinController.forward(from: 0.0).whenComplete(() {
        if (mounted) setState(() => _spinningPillar = null);
      });
    }
    widget.onPillarSelected?.call(pillar);
  }

  @override
  Widget build(BuildContext context) {
    final activeIndex = _pillars.indexOf(widget.activePillar);
    final accent = PillarVisuals.accentFor(widget.activePillar);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF090A0E),
        boxShadow: [
          BoxShadow(
            color: accent.withOpacity(0.10),
            blurRadius: 18.0,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Collapsible Full-Width 5-Pillar Liquid Glass Switcher Row
            ClipRect(
              child: AnimatedAlign(
                duration: const Duration(milliseconds: 240),
                curve: Curves.easeOutCubic,
                alignment: Alignment.topCenter,
                heightFactor: widget.isHeaderHidden ? 0.0 : 1.0,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12.0, 8.0, 12.0, 4.0),
                  child: SizedBox(
                    height: 56.0,
                    width: double.infinity,
                    child: TweenAnimationBuilder<double>(
                      tween: Tween<double>(
                        end: activeIndex < 0 ? 0.0 : activeIndex.toDouble(),
                      ),
                      duration: const Duration(milliseconds: 240),
                      curve: Curves.easeOutCubic,
                      builder: (context, animIndex, child) {
                        return CustomPaint(
                          painter: LiquidTrackPainter(
                            count: _pillars.length,
                            animatedIndex: animIndex,
                            accentColor: accent,
                            radius: 20.0,
                            lift: 5.5,
                            pad: 5.0,
                          ),
                          child: child,
                        );
                      },
                      child: Padding(
                        padding: const EdgeInsets.only(
                          left: 5.0,
                          right: 5.0,
                          top: 3.0,
                        ),
                        child: Row(
                          children: _pillars.map((pillar) {
                            final isSelected = pillar == widget.activePillar;
                            final badge = widget.unreadCounts[pillar] ?? 0;
                            final isSpinning = _spinningPillar == pillar;

                            return Expanded(
                              child: Semantics(
                                button: true,
                                selected: isSelected,
                                label: pillar.label,
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => _handlePillarTap(pillar),
                                  child: Tooltip(
                                    message: pillar.label,
                                    child: Stack(
                                      alignment: Alignment.center,
                                      clipBehavior: Clip.none,
                                      children: [
                                        AnimatedScale(
                                          scale: isSelected ? 1.12 : 0.94,
                                          duration: const Duration(milliseconds: 200),
                                          curve: Curves.easeOutCubic,
                                          child: AnimatedOpacity(
                                            opacity: isSelected ? 1.0 : 0.72,
                                            duration: const Duration(milliseconds: 180),
                                            child: RotationTransition(
                                              turns: isSpinning
                                                  ? CurvedAnimation(
                                                      parent: _spinController,
                                                      curve: Curves.easeInOutCubic,
                                                    )
                                                  : const AlwaysStoppedAnimation(0.0),
                                              child: Image.asset(
                                                PillarVisuals.mascotMdFor(pillar),
                                                width: 34.0,
                                                height: 34.0,
                                                fit: BoxFit.contain,
                                                filterQuality: FilterQuality.high,
                                              ),
                                            ),
                                          ),
                                        ),
                                        if (badge > 0)
                                          Positioned(
                                            top: 4.0,
                                            right: 8.0,
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(
                                                horizontal: 5.0,
                                                vertical: 1.5,
                                              ),
                                              decoration: BoxDecoration(
                                                color: PillarVisuals.accentFor(pillar),
                                                borderRadius: BorderRadius.circular(10.0),
                                              ),
                                              child: Text(
                                                badge > 99 ? '99+' : '$badge',
                                                style: const TextStyle(
                                                  color: Colors.black,
                                                  fontSize: 9.5,
                                                  fontWeight: FontWeight.w800,
                                                  height: 1.0,
                                                ),
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),

            // Pinned Search Row (slides to the very top when switcher collapses)
            Padding(
              padding: EdgeInsets.fromLTRB(
                12.0,
                widget.isHeaderHidden ? 6.0 : 5.0,
                12.0,
                8.0,
              ),
              child: Row(
                children: [
                  // Search Field
                  Expanded(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      curve: Curves.easeOut,
                      height: widget.isHeaderHidden ? 40.0 : 42.0,
                      decoration: BoxDecoration(
                        color: const Color(0xFF141720),
                        borderRadius: BorderRadius.circular(13.0),
                        border: Border.all(
                          color: widget.isListeningVoice
                              ? Colors.redAccent.withOpacity(0.75)
                              : const Color(0xFF232938),
                          width: 1.0,
                        ),
                      ),
                      child: Row(
                        children: [
                          const SizedBox(width: 11.0),
                          const Icon(
                            Icons.search_rounded,
                            size: 17.5,
                            color: Color(0xFF94A3B8),
                          ),
                          const SizedBox(width: 7.0),
                          Expanded(
                            child: TextField(
                              controller: widget.searchController,
                              onChanged: widget.onSearchChanged,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12.8,
                                fontWeight: FontWeight.w400,
                              ),
                              decoration: InputDecoration(
                                hintText: PillarVisuals.searchPlaceholderFor(
                                  widget.activePillar,
                                ),
                                hintStyle: const TextStyle(
                                  color: Color(0xFF64748B),
                                  fontSize: 12.2,
                                ),
                                border: InputBorder.none,
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                  vertical: 10.0,
                                ),
                              ),
                            ),
                          ),
                          if (widget.searchController != null &&
                              widget.searchController!.text.isNotEmpty)
                            GestureDetector(
                              onTap: () {
                                widget.searchController!.clear();
                                widget.onSearchChanged?.call('');
                              },
                              child: const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 5.0),
                                child: Icon(
                                  Icons.close_rounded,
                                  size: 15.5,
                                  color: Color(0xFF94A3B8),
                                ),
                              ),
                            ),
                          GestureDetector(
                            onTap: widget.onVoiceSearchTap,
                            behavior: HitTestBehavior.opaque,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 9.0,
                                vertical: 8.0,
                              ),
                              child: Icon(
                                Icons.mic_none_rounded,
                                size: 17.5,
                                color: widget.isListeningVoice
                                    ? Colors.redAccent
                                    : const Color(0xFF94A3B8),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(width: 7.0),

                  // On Mail Pillar: Smart Sliding `Inbox ↔ Structured` Toggle Pill
                  // `[ ✉️ Inbox | ⊞ ]` <-> `[ ✉️ | ⊞ Structured ]`
                  if (widget.activePillar == QuantPillar.mail)
                    _buildSlidingInboxStructuredToggle(accent)
                  else
                    GestureDetector(
                      onTap: widget.onCommandPaletteTap,
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        width: 42.0,
                        height: 42.0,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFF141720),
                          border: Border.all(
                            color: const Color(0xFF232938),
                            width: 1.0,
                          ),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.keyboard_command_key_rounded,
                          size: 18.0,
                          color: Color(0xFFCBD5E1),
                        ),
                      ),
                    ),

                  const SizedBox(width: 7.0),

                  // Circular Ember (Quanty AI) 3D Avatar Button with glowing accent ring
                  GestureDetector(
                    onTap: widget.onQuantyTap,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 42.0,
                      height: 42.0,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF141720),
                        border: Border.all(
                          color: accent.withOpacity(0.75),
                          width: 1.6,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: accent.withOpacity(0.28),
                            blurRadius: 10.0,
                            spreadRadius: 0.5,
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(2.0),
                      child: ClipOval(
                        child: Image.asset(
                          'assets/mascots/ember.webp',
                          fit: BoxFit.cover,
                          filterQuality: FilterQuality.high,
                        ),
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

  /// Smart Morphing/Sliding `Inbox ↔ Structured` Pill in the Search Bar Row:
  /// - When `inbox` is active: `[ ✉️ Inbox | ⊞ ]`
  /// - When `structured` is active: `[ ✉️ | ⊞ Structured ]`
  Widget _buildSlidingInboxStructuredToggle(Color accent) {
    final isInbox = widget.mailViewMode == 'inbox';

    return Container(
      height: 42.0,
      padding: const EdgeInsets.all(3.0),
      decoration: BoxDecoration(
        color: const Color(0xFF141720),
        borderRadius: BorderRadius.circular(999.0),
        border: Border.all(
          color: const Color(0xFF252B3B),
          width: 1.0,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Left Option: Inbox (`✉️` + expands `"Inbox"` when active)
          GestureDetector(
            onTap: () => widget.onMailViewModeChanged?.call('inbox'),
            behavior: HitTestBehavior.opaque,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              height: 34.0,
              padding: EdgeInsets.symmetric(
                horizontal: isInbox ? 11.0 : 9.0,
              ),
              decoration: BoxDecoration(
                gradient: isInbox
                    ? LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Color.lerp(accent, Colors.white, 0.14)!,
                          accent,
                        ],
                      )
                    : null,
                borderRadius: BorderRadius.circular(999.0),
                boxShadow: isInbox
                    ? [
                        BoxShadow(
                          color: accent.withOpacity(0.38),
                          blurRadius: 8.0,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.inbox_rounded,
                    size: 15.5,
                    color: isInbox ? Colors.white : const Color(0xFF94A3B8),
                  ),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    child: isInbox
                        ? const Padding(
                            padding: EdgeInsets.only(left: 5.0),
                            child: Text(
                              'Inbox',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.2,
                              ),
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(width: 2.0),

          // Right Option: Structured (`⊞` + expands `"Structured"` when active)
          GestureDetector(
            onTap: () => widget.onMailViewModeChanged?.call('structured'),
            behavior: HitTestBehavior.opaque,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              height: 34.0,
              padding: EdgeInsets.symmetric(
                horizontal: !isInbox ? 11.0 : 9.0,
              ),
              decoration: BoxDecoration(
                gradient: !isInbox
                    ? LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Color.lerp(accent, Colors.white, 0.14)!,
                          accent,
                        ],
                      )
                    : null,
                borderRadius: BorderRadius.circular(999.0),
                boxShadow: !isInbox
                    ? [
                        BoxShadow(
                          color: accent.withOpacity(0.38),
                          blurRadius: 8.0,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.grid_view_rounded,
                    size: 15.5,
                    color: !isInbox ? Colors.white : const Color(0xFF94A3B8),
                  ),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    child: !isInbox
                        ? const Padding(
                            padding: EdgeInsets.only(left: 5.0),
                            child: Text(
                              'Structured',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.2,
                              ),
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Tab descriptor for the Contextual Liquid Bottom Navigation Bar (`ContextBottomNavBar`).
class QuantContextNavItem {
  final String id;
  final String label;
  final IconData? icon;
  final bool isQuantyLogoOnly;
  final bool isProfileAvatar;
  final String profileInitials;
  final int badgeCount;

  const QuantContextNavItem({
    required this.id,
    required this.label,
    this.icon,
    this.isQuantyLogoOnly = false,
    this.isProfileAvatar = false,
    this.profileInitials = 'QM',
    this.badgeCount = 0,
  });
}

/// Connected Liquid Contextual Bottom Navigation Bar matching `ContextBottomNavBar.tsx` 1:1.
class QuantContextBottomBar extends StatelessWidget {
  final List<QuantContextNavItem> items;
  final int activeIndex;
  final Color accentColor;
  final ValueChanged<int> onTap;

  const QuantContextBottomBar({
    super.key,
    required this.items,
    required this.activeIndex,
    required this.accentColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final safeIndex = activeIndex.clamp(0, math.max(0, items.length - 1));

    return Container(
      color: const Color(0xFF090A0E),
      padding: const EdgeInsets.fromLTRB(10.0, 2.0, 10.0, 6.0),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 60.0,
          child: TweenAnimationBuilder<double>(
            tween: Tween<double>(end: safeIndex.toDouble()),
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            builder: (context, animIndex, child) {
              return CustomPaint(
                painter: LiquidTrackPainter(
                  count: items.length,
                  animatedIndex: animIndex,
                  accentColor: accentColor,
                  radius: 22.0,
                  lift: 6.0,
                  pad: 5.0,
                ),
                child: child,
              );
            },
            child: Padding(
              padding: const EdgeInsets.only(left: 5.0, right: 5.0, top: 4.0),
              child: Row(
                children: List.generate(items.length, (idx) {
                  final item = items[idx];
                  final isSelected = idx == safeIndex;

                  return Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => onTap(idx),
                      child: item.isQuantyLogoOnly
                          ? Center(
                              child: Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  Container(
                                    width: 34.0,
                                    height: 34.0,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: accentColor.withOpacity(0.55),
                                        width: 1.2,
                                      ),
                                    ),
                                    child: ClipOval(
                                      child: Image.asset(
                                        'assets/mascots/ember.webp',
                                        fit: BoxFit.cover,
                                        filterQuality: FilterQuality.high,
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    top: -1.0,
                                    right: -1.0,
                                    child: Container(
                                      width: 8.0,
                                      height: 8.0,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: accentColor,
                                        border: Border.all(
                                          color: const Color(0xFF14161D),
                                          width: 1.5,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : item.isProfileAvatar
                              ? Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Container(
                                      width: 22.0,
                                      height: 22.0,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        gradient: LinearGradient(
                                          begin: Alignment.topLeft,
                                          end: Alignment.bottomRight,
                                          colors: isSelected
                                              ? [
                                                  Colors.white,
                                                  Color.lerp(
                                                    accentColor,
                                                    Colors.white,
                                                    0.6,
                                                  )!,
                                                ]
                                              : [
                                                  accentColor.withOpacity(0.28),
                                                  const Color(0xFF1E2230),
                                                ],
                                        ),
                                        border: Border.all(
                                          color: isSelected
                                              ? Colors.white
                                              : accentColor.withOpacity(0.65),
                                          width: 1.2,
                                        ),
                                      ),
                                      alignment: Alignment.center,
                                      child: Icon(
                                        Icons.person_rounded,
                                        size: 13.5,
                                        color: isSelected
                                            ? const Color(0xFF090A0E)
                                            : Colors.white,
                                      ),
                                    ),
                                    const SizedBox(height: 2.5),
                                    Text(
                                      item.label,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.white
                                            : const Color(0xFF94A3B8),
                                        fontSize: 10.5,
                                        fontWeight: isSelected
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                )
                              : Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      item.icon,
                                      size: 19.0,
                                      color: isSelected
                                          ? Colors.white
                                          : const Color(0xFF94A3B8),
                                    ),
                                    const SizedBox(height: 3.0),
                                    Text(
                                      item.label,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.white
                                            : const Color(0xFF94A3B8),
                                        fontSize: 10.5,
                                        fontWeight: isSelected
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
