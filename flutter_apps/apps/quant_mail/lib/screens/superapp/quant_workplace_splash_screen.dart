import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:quant_ui/quant_ui.dart';
import 'quantmail_superapp_bar.dart';
import '../../services/quant_auth_controller.dart';
import '../auth/quant_login_screen.dart';
import 'superapp_home_screen.dart';

// ============================================================================
// QUANTWORKPLACE — REVOLVING 5-APP CONNECTED LOADING & BEFORE-LOGIN SCREEN
// ============================================================================
// Designed from the founder's hand-drawn architecture & 5 visual references:
// 1. Center Core: Relativistic Gargantua-class Quantrinity Black Hole logo
//    (tilted accretion disk, gravitational lensing dome + under-arc, photon
//    sphere, equatorial front band).
// 2. Connected 5-App Orbital Metaball Bridge ("Connected feel"):
//    Instead of harsh chalky flat white, uses a Smoked Liquid Pearl-Titanium
//    Glass metaball hub with luminous starlight-silver concave rims and subtle
//    per-pillar color refraction flowing into the 5 app rings:
//    - Top: QuantMail (#FF6B35)
//    - Top-Right: QuantCalendar (#4285F4)
//    - Bottom-Right: QuantDrive (#34A853)
//    - Bottom-Left: QuantContacts (#F59E0B)
//    - Top-Left: QuantGit (#8B5CF6)
//    Revolves smoothly clockwise while keeping all 5 3D mascots upright.
// 3. Brand Wordmark:
//    `Q-u-a-n-t` (5 letters colored in the 5 app accents) + `Workplace`
//    in brushed platinum-white.
// 4. Footer Hierarchy:
//    `by`
//    [ Deeply Designed Quantrinity Black Hole Logo ]
//    `quantrinity` (futuristic wide-tracked metallic lowercase with warm glints)
// ============================================================================

class QuantWorkplaceSplashScreen extends StatefulWidget {
  final Widget? child;
  final Duration initialSplashDuration;

  const QuantWorkplaceSplashScreen({
    super.key,
    this.child,
    this.initialSplashDuration = const Duration(milliseconds: 4000),
  });

  static void showPreview(BuildContext context) {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'QuantWorkplaceSplash',
      barrierColor: Colors.black.withValues(alpha: 0.95),
      pageBuilder: (ctx, anim1, anim2) {
        return const Scaffold(
          backgroundColor: Color(0xFF040508),
          body: QuantWorkplaceSplashScreen(
            initialSplashDuration: Duration(hours: 1),
            child: SizedBox.shrink(),
          ),
        );
      },
    );
  }

  @override
  State<QuantWorkplaceSplashScreen> createState() =>
      _QuantWorkplaceSplashScreenState();
}

class _QuantWorkplaceSplashScreenState extends State<QuantWorkplaceSplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _orbitController;
  late final AnimationController _pulseController;
  late final AnimationController _fadeController;
  Timer? _dismissTimer;
  bool _showSplash = true;

  @override
  void initState() {
    super.initState();
    _orbitController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 9000),
    )..repeat();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    )..repeat(reverse: true);

    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 550),
      value: 1.0,
    );

    _dismissTimer = Timer(widget.initialSplashDuration, () {
      if (!mounted) return;
      _dismissSplash();
    });
  }

  void _dismissSplash() {
    if (!_showSplash) return;
    _fadeController.reverse().then((_) {
      if (!mounted) return;
      if (widget.child != null) {
        setState(() => _showSplash = false);
      } else {
        final destination = QuantAuthController.instance.isAuthenticated
            ? const SuperAppHomeScreen()
            : const QuantLoginScreen();
        Navigator.of(context).pushReplacement(
          PageRouteBuilder(
            transitionDuration: const Duration(milliseconds: 600),
            pageBuilder: (context, animation, secondaryAnimation) => destination,
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              return FadeTransition(opacity: animation, child: child);
            },
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    _dismissTimer?.cancel();
    _orbitController.dispose();
    _pulseController.dispose();
    _fadeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final splashContent = FadeTransition(
      opacity: CurvedAnimation(
        parent: _fadeController,
        curve: Curves.easeOutCubic,
      ),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _dismissSplash,
        child: Scaffold(
          backgroundColor: const Color(0xFF040508),
          body: SafeArea(
            child: Stack(
              children: [
                // Deep Cosmic Ambient Backdrop Glow
                Positioned.fill(
                  child: CustomPaint(
                    painter: _CosmicBackdropPainter(),
                  ),
                ),

                      // Main Vertical Layout
                      Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const SizedBox(height: 18),

                          // CENTER: Revolving 5-App Connected Orbital Hub + QuantWorkplace Wordmark
                          Expanded(
                            child: Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  // Revolving 5-App Connected Wheel around Central Black Hole
                                  SizedBox(
                                    width: 310,
                                    height: 310,
                                    child: AnimatedBuilder(
                                      animation: Listenable.merge([
                                        _orbitController,
                                        _pulseController,
                                      ]),
                                      builder: (context, _) {
                                        final angle =
                                            _orbitController.value * 2 * math.pi;
                                        final pulse = _pulseController.value;
                                        return _RevolvingWorkplaceConstellation(
                                          rotationAngle: angle,
                                          pulse: pulse,
                                        );
                                      },
                                    ),
                                  ),

                                  const SizedBox(height: 32),

                                  // Master Flowing Cursive QuantWorkplace Brand Wordmark
                                  Image.asset(
                                    'assets/quantworkplace_cursive_badge.png',
                                    height: 52,
                                    fit: BoxFit.contain,
                                  ),

                                  const SizedBox(height: 20),

                                  // Interactive Entry Pill Button
                                  InkWell(
                                    onTap: _dismissSplash,
                                    borderRadius: BorderRadius.circular(20),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 18,
                                        vertical: 9,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(alpha: 0.05),
                                        borderRadius: BorderRadius.circular(20),
                                        border: Border.all(
                                          color: const Color(0xFFFF7A00).withValues(alpha: 0.35),
                                          width: 1,
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            QuantAuthController.instance.isAuthenticated
                                                ? 'Enter Workspace'
                                                : 'Sign in to QuantWorkplace',
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.w600,
                                              letterSpacing: 0.3,
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          const Icon(
                                            Icons.arrow_forward_rounded,
                                            color: Color(0xFFFF7A00),
                                            size: 14,
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          // BOTTOM FOOTER: `by` -> [Black Hole Logo] -> `quantrinity`
                          Padding(
                            padding: const EdgeInsets.only(bottom: 26),
                            child: AnimatedBuilder(
                              animation: _pulseController,
                              builder: (context, _) {
                                return QuantrinityFooterLockup(
                                  pulse: _pulseController.value,
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );

    if (widget.child != null) {
      return Stack(
        children: [
          widget.child!,
          if (_showSplash) splashContent,
        ],
      );
    }

    return splashContent;
  }
}

// ============================================================================
// 1. REVOLVING 5-APP CONNECTED CONSTELLATION WIDGET
// ============================================================================

class _OrbitalPillarSpec {
  final QuantPillar pillar;
  final String label;
  final Color ringColor;
  final Color glowColor;

  const _OrbitalPillarSpec({
    required this.pillar,
    required this.label,
    required this.ringColor,
    required this.glowColor,
  });
}

const List<_OrbitalPillarSpec> _kOrbitalPillars = [
  _OrbitalPillarSpec(
    pillar: QuantPillar.quantGit,
    label: 'QuantGit',
    ringColor: Color(0xFF7C3AED), // Deeper royal violet
    glowColor: Color(0xFF6D28D9),
  ),
  _OrbitalPillarSpec(
    pillar: QuantPillar.mail,
    label: 'QuantMail',
    ringColor: Color(0xFFEA580C), // Deeper warm burnt orange
    glowColor: Color(0xFFC2410C),
  ),
  _OrbitalPillarSpec(
    pillar: QuantPillar.calendar,
    label: 'QuantCalendar',
    ringColor: Color(0xFF2563EB), // Deeper sapphire blue
    glowColor: Color(0xFF1D4ED8),
  ),
  _OrbitalPillarSpec(
    pillar: QuantPillar.drive,
    label: 'QuantDrive',
    ringColor: Color(0xFF16A34A), // Deeper jewel emerald
    glowColor: Color(0xFF15803D),
  ),
  _OrbitalPillarSpec(
    pillar: QuantPillar.contacts,
    label: 'QuantContacts',
    ringColor: Color(0xFFD97706), // Deeper warm amber-gold
    glowColor: Color(0xFFB45309),
  ),
];

class _RevolvingWorkplaceConstellation extends StatelessWidget {
  final double rotationAngle;
  final double pulse;

  const _RevolvingWorkplaceConstellation({
    required this.rotationAngle,
    required this.pulse,
  });

  @override
  Widget build(BuildContext context) {
    const double size = 310.0;
    const double center = size / 2;
    const double orbitRadius = 102.0;
    const double nodeRadius = 37.0;

    return Stack(
      alignment: Alignment.center,
      children: [
        // 1. Smoked Glass Organic Liquid Metaball Bridge + Calibrated Node Rings
        CustomPaint(
          size: const Size(size, size),
          painter: _ConnectedMetaballHubPainter(
            rotationAngle: rotationAngle,
            pulse: pulse,
            orbitRadius: orbitRadius,
            nodeRadius: nodeRadius,
          ),
        ),

        // 2. Center Singularity: Photorealistic Gargantua Black Hole Logo
        Container(
          width: 100,
          height: 100,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: Color(0xFF000000),
          ),
          child: Image.asset(
            'assets/gargantua_master.png',
            width: 132,
            height: 64,
            fit: BoxFit.contain,
          ),
        ),

        // 3. The 5 Revolving App Mascots (Upright inside their revolving colored rings)
        for (int i = 0; i < _kOrbitalPillars.length; i++)
          Builder(
            builder: (context) {
              final spec = _kOrbitalPillars[i];
              final theta =
                  -math.pi / 2 + rotationAngle + (i * 2 * math.pi / 5);
              final dx = center + orbitRadius * math.cos(theta) - nodeRadius;
              final dy = center + orbitRadius * math.sin(theta) - nodeRadius;

              return Positioned(
                left: dx,
                top: dy,
                width: nodeRadius * 2,
                height: nodeRadius * 2,
                child: Center(
                  child: Image.asset(
                    PillarVisuals.mascotMdFor(spec.pillar),
                    width: 36,
                    height: 36,
                    fit: BoxFit.contain,
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

// ============================================================================
// 2. SMOKED LIQUID PEARL-SILVER METABALL BRIDGE PAINTER ("Connected feel")
// ============================================================================
// Instead of harsh flat #FFFFFF white, we render a multi-layered Smoked
// Pearl-Titanium & Starlight Glass metaball web that connects the center
// Black Hole ring to all 5 colored app rings with organic concave cutouts.
// ============================================================================

class _ConnectedMetaballHubPainter extends CustomPainter {
  final double rotationAngle;
  final double pulse;
  final double orbitRadius;
  final double nodeRadius;

  _ConnectedMetaballHubPainter({
    required this.rotationAngle,
    required this.pulse,
    required this.orbitRadius,
    required this.nodeRadius,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final Offset center = Offset(size.width / 2, size.height / 2);
    const int count = 5;

    // Build the mathematically smooth 5-lobed organic glass bridge (Zero spikes, continuous tangent fillets)
    final double rNode = nodeRadius - 3.5;
    const double waistR = 64.0;
    const double innerCoreR = 50.0;
    const double halfAngle = math.pi / 5; // 36 deg

    final double k = waistR - rNode;
    final double cxRel = orbitRadius * math.cos(halfAngle);
    final double dCutout = (orbitRadius * orbitRadius - k * k) / (2 * (cxRel - k));
    final double rFillet = dCutout - waistR;

    final List<Offset> perimeterPoints = [];
    for (int i = 0; i < count; i++) {
      final double thI =
          -math.pi / 2 + rotationAngle + (i * 2 * math.pi / count);
      final double thNext =
          -math.pi / 2 + rotationAngle + ((i + 1) * 2 * math.pi / count);
      final double thMid =
          -math.pi / 2 + rotationAngle + ((i + 0.5) * 2 * math.pi / count);

      final Offset cI = Offset(
        center.dx + orbitRadius * math.cos(thI),
        center.dy + orbitRadius * math.sin(thI),
      );
      final Offset cNext = Offset(
        center.dx + orbitRadius * math.cos(thNext),
        center.dy + orbitRadius * math.sin(thNext),
      );
      final Offset cCut = Offset(
        center.dx + dCutout * math.cos(thMid),
        center.dy + dCutout * math.sin(thMid),
      );

      final Offset t1 = Offset(
        cI.dx + (cCut.dx - cI.dx) * (rNode / (rNode + rFillet)),
        cI.dy + (cCut.dy - cI.dy) * (rNode / (rNode + rFillet)),
      );
      final Offset t2 = Offset(
        cNext.dx + (cCut.dx - cNext.dx) * (rNode / (rNode + rFillet)),
        cNext.dy + (cCut.dy - cNext.dy) * (rNode / (rNode + rFillet)),
      );

      final double angCutT1 = math.atan2(t1.dy - cCut.dy, t1.dx - cCut.dx);
      final double angCutT2 = math.atan2(t2.dy - cCut.dy, t2.dx - cCut.dx);

      double diffCut = (angCutT2 - angCutT1) % (2 * math.pi);
      if (diffCut > math.pi) diffCut -= 2 * math.pi;
      final double midArc = (angCutT1 + diffCut / 2) % (2 * math.pi);
      final double targetMid = (thMid + math.pi) % (2 * math.pi);
      if ((midArc - targetMid).abs() > 0.1 &&
          ((midArc - targetMid).abs() - 2 * math.pi).abs() > 0.1) {
        if (diffCut > 0) diffCut -= 2 * math.pi; else diffCut += 2 * math.pi;
      }

      const int filletSteps = 16;
      for (int s = 0; s < filletSteps; s++) {
        final double frac = s / (filletSteps - 1);
        final double a = angCutT1 + diffCut * frac;
        perimeterPoints.add(
            Offset(cCut.dx + rFillet * math.cos(a), cCut.dy + rFillet * math.sin(a)));
      }

      // Convex arc around Node i+1
      final double thMidNext =
          -math.pi / 2 + rotationAngle + ((i + 1.5) * 2 * math.pi / count);
      final Offset cCutNext = Offset(
        center.dx + dCutout * math.cos(thMidNext),
        center.dy + dCutout * math.sin(thMidNext),
      );
      final Offset tNext = Offset(
        cNext.dx + (cCutNext.dx - cNext.dx) * (rNode / (rNode + rFillet)),
        cNext.dy + (cCutNext.dy - cNext.dy) * (rNode / (rNode + rFillet)),
      );

      final double angNodeStart = math.atan2(t2.dy - cNext.dy, t2.dx - cNext.dx);
      final double angNodeEnd =
          math.atan2(tNext.dy - cNext.dy, tNext.dx - cNext.dx);

      double diffNode = (angNodeEnd - angNodeStart) % (2 * math.pi);
      final double midNode = (angNodeStart + diffNode / 2) % (2 * math.pi);
      final double targetNode = thNext % (2 * math.pi);
      if ((midNode - targetNode).abs() > 0.5 &&
          ((midNode - targetNode).abs() - 2 * math.pi).abs() > 0.5) {
        if (diffNode > 0) diffNode -= 2 * math.pi; else diffNode += 2 * math.pi;
      }

      const int nodeSteps = 16;
      for (int s = 0; s < nodeSteps; s++) {
        final double frac = s / (nodeSteps - 1);
        final double a = angNodeStart + diffNode * frac;
        perimeterPoints.add(
            Offset(cNext.dx + rNode * math.cos(a), cNext.dy + rNode * math.sin(a)));
      }
    }

    final Path outerPerimeter = Path()
      ..moveTo(perimeterPoints[0].dx, perimeterPoints[0].dy);
    for (int p = 1; p < perimeterPoints.length; p++) {
      outerPerimeter.lineTo(perimeterPoints[p].dx, perimeterPoints[p].dy);
    }
    outerPerimeter.close();

    final Path centerHole = Path()
      ..addOval(Rect.fromCircle(center: center, radius: innerCoreR));
    final Path bridgeBody =
        Path.combine(PathOperation.difference, outerPerimeter, centerHole);

    // 1. Soft Ambient Starlight Glow behind the Metaball Bridge
    canvas.drawPath(
      bridgeBody,
      Paint()
        ..color = const Color(0xFFD4AF37).withValues(alpha: 0.10 + 0.04 * pulse)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );

    // 2. Main Metaball Fill: Deep Smoked Obsidian Glass (Comfortable, Non-Piercing)
    final Paint bridgeFillPaint = Paint()
      ..shader = ui.Gradient.radial(
        center,
        orbitRadius,
        [
          const Color(0xFF1E2538).withValues(alpha: 0.42),
          const Color(0xFF131826).withValues(alpha: 0.32),
          const Color(0xFF0B0E17).withValues(alpha: 0.22),
          const Color(0xFF05070B).withValues(alpha: 0.12),
        ],
        const [0.0, 0.45, 0.75, 1.0],
      );
    canvas.drawPath(bridgeBody, bridgeFillPaint);

    // 3. Subtle Per-Pillar Color Refraction on Each Arm
    canvas.save();
    canvas.clipPath(bridgeBody);
    for (int i = 0; i < count; i++) {
      final spec = _kOrbitalPillars[i];
      final double theta =
          -math.pi / 2 + rotationAngle + (i * 2 * math.pi / count);
      final Offset armPoint = Offset(
        center.dx + (orbitRadius * 0.72) * math.cos(theta),
        center.dy + (orbitRadius * 0.72) * math.sin(theta),
      );
      final Paint refractionPaint = Paint()
        ..shader = ui.Gradient.radial(
          armPoint,
          44.0,
          [
            spec.ringColor.withValues(alpha: 0.25),
            spec.ringColor.withValues(alpha: 0.0),
          ],
        );
      canvas.drawCircle(armPoint, 44.0, refractionPaint);
    }
    canvas.restore();

    // 4. Warm Amber-Titanium Specular Rim on the Organic Bridge Perimeter (Smooth, Zero Spikes)
    final Paint bridgeRimPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.3
      ..color = const Color(0xFFE2C499).withValues(alpha: 0.65);
    canvas.drawPath(outerPerimeter, bridgeRimPaint);

    // 5. Draw the 5 Calibrated Pillar Rings & Deep Obsidian App Interiors
    for (int i = 0; i < count; i++) {
      final spec = _kOrbitalPillars[i];
      final double theta =
          -math.pi / 2 + rotationAngle + (i * 2 * math.pi / count);
      final Offset nodeCenter = Offset(
        center.dx + orbitRadius * math.cos(theta),
        center.dy + orbitRadius * math.sin(theta),
      );

      // Outer colored glow (Comfortable, eye-pleasing)
      canvas.drawCircle(
        nodeCenter,
        nodeRadius,
        Paint()
          ..color = spec.ringColor.withValues(alpha: 0.18 + 0.08 * pulse)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
      );

      // Dark obsidian interior disc
      canvas.drawCircle(
        nodeCenter,
        nodeRadius - 3.5,
        Paint()..color = const Color(0xFF07090E),
      );

      // Deep 5-Pillar Colored Ring
      final Rect ringRect =
          Rect.fromCircle(center: nodeCenter, radius: nodeRadius - 3.5);
      final Paint ringPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5.2
        ..shader = ui.Gradient.linear(
          Offset(ringRect.left, ringRect.top),
          Offset(ringRect.right, ringRect.bottom),
          [
            spec.glowColor,
            spec.ringColor,
          ],
        );
      canvas.drawCircle(nodeCenter, nodeRadius - 3.5, ringPaint);

      // Inner specular glass rim inside each app circle
      canvas.drawCircle(
        nodeCenter,
        nodeRadius - 6.8,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.8
          ..color = Colors.white.withValues(alpha: 0.18),
      );
    }

    // 6. Warm Golden Collar around the Central Gargantua Black Hole
    canvas.drawCircle(
      center,
      innerCoreR,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8
        ..color = const Color(0xFFE5A85A).withValues(alpha: 0.85),
    );
  }

  @override
  bool shouldRepaint(covariant _ConnectedMetaballHubPainter oldDelegate) {
    return oldDelegate.rotationAngle != rotationAngle ||
        oldDelegate.pulse != pulse;
  }
}

// ============================================================================
// 3. DEEPLY DESIGNED QUANTRINITY BLACK HOLE PAINTER (References 4 & 5)
// ============================================================================
// Renders the iconic relativistic Gargantua Black Hole:
// - Upper gravitational-lensed light dome
// - Lower secondary lensed photon arc
// - Tilted (-17 deg) multi-ring relativistic accretion disk with warm amber,
//   ice-silver, and incandescent white-gold filaments
// - Pitch-black event horizon singularity + razor-sharp photon sphere
// - Equatorial accretion bridge passing in front of the event horizon
// ============================================================================

class QuantrinityBlackHolePainter extends CustomPainter {
  final double pulse;
  final bool compact;

  QuantrinityBlackHolePainter({
    this.pulse = 0.5,
    this.compact = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double r = size.width * 0.23; // Event horizon radius
    const double tiltAngle = -17.0 * math.pi / 180.0;

    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(tiltAngle);

    // 1. Ambient Cosmic Corona
    final Paint coronaPaint = Paint()
      ..shader = ui.Gradient.radial(
        Offset.zero,
        r * 2.2,
        [
          const Color(0xFFFFFBEB).withValues(alpha: 0.28 + 0.08 * pulse),
          const Color(0xFFF59E0B).withValues(alpha: 0.16),
          const Color(0xFF38BDF8).withValues(alpha: 0.06),
          Colors.transparent,
        ],
        const [0.0, 0.38, 0.70, 1.0],
      );
    canvas.drawCircle(Offset.zero, r * 2.2, coronaPaint);

    // 2. Upper Gravitational Lensing Dome (Light bent over top of Black Hole)
    final Rect upperDomeRect = Rect.fromCenter(
      center: Offset(0, -r * 0.10),
      width: r * 2.25,
      height: r * 2.18,
    );
    canvas.drawArc(
      upperDomeRect,
      math.pi * 1.04,
      math.pi * 0.92,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.34
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4.5)
        ..shader = ui.Gradient.linear(
          Offset(-r, -r),
          Offset(r, -r * 0.2),
          [
            const Color(0xFFD97706).withValues(alpha: 0.65),
            const Color(0xFFFFFBEB).withValues(alpha: 0.98),
            const Color(0xFFE0F2FE).withValues(alpha: 0.90),
            const Color(0xFFD97706).withValues(alpha: 0.60),
          ],
          const [0.0, 0.38, 0.72, 1.0],
        ),
    );

    // Crisp inner white-hot core of the upper lensed dome
    canvas.drawArc(
      upperDomeRect.deflate(r * 0.06),
      math.pi * 1.08,
      math.pi * 0.84,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.14
        ..strokeCap = StrokeCap.round
        ..color = Colors.white.withValues(alpha: 0.95),
    );

    // 3. Lower Secondary Gravitational Lensed Under-Arc (Reference 4 & 5 signature)
    final Rect lowerArcRect = Rect.fromCenter(
      center: Offset(0, r * 0.08),
      width: r * 2.12,
      height: r * 2.05,
    );
    canvas.drawArc(
      lowerArcRect,
      math.pi * 0.14,
      math.pi * 0.72,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.22
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.0)
        ..shader = ui.Gradient.linear(
          Offset(-r, r),
          Offset(r, r),
          [
            const Color(0xFFD97706).withValues(alpha: 0.45),
            const Color(0xFFFFFFFF).withValues(alpha: 0.92),
            const Color(0xFFD97706).withValues(alpha: 0.45),
          ],
          const [0.0, 0.5, 1.0],
        ),
    );

    canvas.drawArc(
      lowerArcRect,
      math.pi * 0.20,
      math.pi * 0.60,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.09
        ..strokeCap = StrokeCap.round
        ..color = Colors.white.withValues(alpha: 0.92),
    );

    // 4. Back Half of the Tilted Accretion Disk
    final Rect outerDiskRect = Rect.fromCenter(
      center: Offset.zero,
      width: r * 4.25,
      height: r * 0.82,
    );
    canvas.drawArc(
      outerDiskRect,
      math.pi,
      math.pi,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.28
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.5)
        ..shader = ui.Gradient.linear(
          Offset(-r * 2.1, 0),
          Offset(r * 2.1, 0),
          [
            const Color(0xFF9A3412).withValues(alpha: 0.25),
            const Color(0xFFF59E0B).withValues(alpha: 0.80),
            const Color(0xFFFFFFFF).withValues(alpha: 0.95),
            const Color(0xFFBAE6FD).withValues(alpha: 0.80),
            const Color(0xFF9A3412).withValues(alpha: 0.25),
          ],
          const [0.0, 0.25, 0.50, 0.75, 1.0],
        ),
    );

    // 5. Pitch-Black Event Horizon Singularity Core
    canvas.drawCircle(
      Offset.zero,
      r * 0.92,
      Paint()..color = const Color(0xFF000000),
    );

    // Razor-thin relativistic photon ring hugging the black hole shadow
    canvas.drawCircle(
      Offset.zero,
      r * 0.92,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = compact ? 1.0 : 1.4
        ..color = const Color(0xFFFFFBEB).withValues(alpha: 0.88),
    );

    // 6. Front Equatorial Accretion Disk Sweeping Across the Black Hole Shadow
    // Outer warm amber-orange filament
    final Rect frontDiskOuter = Rect.fromCenter(
      center: Offset(0, r * 0.06),
      width: r * 4.35,
      height: r * 0.76,
    );
    canvas.drawArc(
      frontDiskOuter,
      -0.08,
      math.pi + 0.16,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.30
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.2)
        ..shader = ui.Gradient.linear(
          Offset(-r * 2.15, 0),
          Offset(r * 2.15, 0),
          [
            const Color(0xFF7C2D12).withValues(alpha: 0.0),
            const Color(0xFFEA580C).withValues(alpha: 0.78),
            const Color(0xFFFDE68A).withValues(alpha: 0.96),
            const Color(0xFFE0F2FE).withValues(alpha: 0.92),
            const Color(0xFFD97706).withValues(alpha: 0.72),
            const Color(0xFF7C2D12).withValues(alpha: 0.0),
          ],
          const [0.0, 0.18, 0.44, 0.62, 0.84, 1.0],
        ),
    );

    // Inner blazing starlight-white equatorial stream
    final Rect frontDiskInner = Rect.fromCenter(
      center: Offset(0, r * 0.05),
      width: r * 3.55,
      height: r * 0.48,
    );
    canvas.drawArc(
      frontDiskInner,
      0.02,
      math.pi - 0.04,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.13
        ..strokeCap = StrokeCap.round
        ..shader = ui.Gradient.linear(
          Offset(-r * 1.75, 0),
          Offset(r * 1.75, 0),
          [
            Colors.white.withValues(alpha: 0.0),
            const Color(0xFFFFFBEB).withValues(alpha: 0.96),
            const Color(0xFFFFFFFF),
            const Color(0xFFE0F2FE).withValues(alpha: 0.94),
            Colors.white.withValues(alpha: 0.0),
          ],
          const [0.0, 0.24, 0.50, 0.76, 1.0],
        ),
    );

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant QuantrinityBlackHolePainter oldDelegate) {
    return oldDelegate.pulse != pulse || oldDelegate.compact != compact;
  }
}

// ============================================================================
// 4. 5-COLOR `Q-u-a-n-t` + BRUSHED PLATINUM `Workplace` WORDMARK
// ============================================================================
// Q = QuantMail (#FF6B35)
// u = QuantCalendar (#4285F4)
// a = QuantDrive (#34A853)
// n = QuantContacts (#F59E0B)
// t = QuantGit (#8B5CF6)
// Workplace = Brushed Platinum-Silver (#F8FAFC -> #CBD5E1)
// ============================================================================

class QuantWorkplaceWordmark extends StatelessWidget {
  final double fontSize;

  const QuantWorkplaceWordmark({
    super.key,
    this.fontSize = 32,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        _buildColoredLetter('Q', const Color(0xFFFF6B35), fontSize),
        _buildColoredLetter('u', const Color(0xFF4285F4), fontSize),
        _buildColoredLetter('a', const Color(0xFF34A853), fontSize),
        _buildColoredLetter('n', const Color(0xFFF59E0B), fontSize),
        _buildColoredLetter('t', const Color(0xFF8B5CF6), fontSize),
        const SizedBox(width: 2),
        ShaderMask(
          shaderCallback: (bounds) => const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFFFFFFFF),
              Color(0xFFE2E8F0),
              Color(0xFF94A3B8),
            ],
            stops: [0.0, 0.65, 1.0],
          ).createShader(bounds),
          child: Text(
            'Workplace',
            style: TextStyle(
              color: Colors.white,
              fontSize: fontSize,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.6,
              height: 1.05,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildColoredLetter(String char, Color color, double size) {
    return Text(
      char,
      style: TextStyle(
        color: color,
        fontSize: size,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.5,
        height: 1.05,
        shadows: [
          Shadow(
            color: color.withValues(alpha: 0.35),
            blurRadius: 10,
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// 5. FOOTER LOCKUP: `by` -> [Black Hole Logo] -> `quantrinity` (Reference 4)
// ============================================================================

class QuantrinityFooterLockup extends StatelessWidget {
  final double pulse;

  const QuantrinityFooterLockup({
    super.key,
    this.pulse = 0.5,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 1. "by"
        Text(
          'by',
          style: TextStyle(
            color: const Color(0xFF94A3B8).withValues(alpha: 0.85),
            fontSize: 12.0,
            fontWeight: FontWeight.w500,
            letterSpacing: 2.0,
          ),
        ),
        const SizedBox(height: 7),

        // 2. Photorealistic Gargantua Black Hole Mark
        Image.asset(
          'assets/gargantua_master.png',
          width: 58,
          height: 25,
          fit: BoxFit.contain,
        ),
        const SizedBox(height: 6),

        // 3. Flowing Cursive quantrinity Calligraphic Badge
        Image.asset(
          'assets/quantrinity_cursive_badge.png',
          height: 23,
          fit: BoxFit.contain,
        ),
      ],
    );
  }
}

class _CosmicBackdropPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final Offset center = Offset(size.width / 2, size.height * 0.43);
    final Paint glow = Paint()
      ..shader = ui.Gradient.radial(
        center,
        size.width * 0.65,
        [
          const Color(0xFF1E293B).withValues(alpha: 0.28),
          const Color(0xFF0F172A).withValues(alpha: 0.12),
          Colors.transparent,
        ],
        const [0.0, 0.55, 1.0],
      );
    canvas.drawCircle(center, size.width * 0.65, glow);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
