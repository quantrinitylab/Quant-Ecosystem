// Quant Mail "Obsidian" design tokens (design-spec section 3.1).
//
// Mail owns these tokens as a ThemeExtension so the shared quant_theme package
// (used by every Quant app) is not restyled. Values marked "derived" in the
// spec are derived from the brief colours.

import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Spacing scale (4 dp base) and layout constants.
class QmSpace {
  const QmSpace._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;

  /// Screen gutter.
  static const double gutter = 16;

  /// Minimum touch target edge.
  static const double minTarget = 48;
}

/// Corner radii (design-spec section 3.1, "Shape").
class QmRadius {
  const QmRadius._();

  static const double field = 14;
  static const double button = 14;
  static const double chip = 999;
  static const double card = 20;
  static const double sheetTop = 24;
  static const double thumb = 10;
}

/// Eight tint pairs for deterministic initials avatars (dark tint background,
/// bright initials, contrast >= 4.5:1).
class QmAvatarTint {
  const QmAvatarTint(this.background, this.foreground);

  final Color background;
  final Color foreground;
}

@immutable
class QuantMailTokens extends ThemeExtension<QuantMailTokens> {
  const QuantMailTokens({
    required this.canvas,
    required this.panel,
    required this.panelRaised,
    required this.hairline,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.accent,
    required this.accentSoft,
    required this.onAccent,
    required this.accentText,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.scrim,
    required this.avatarTints,
  });

  static const String fontFamily = 'Inter';

  final Color canvas;
  final Color panel;
  final Color panelRaised;
  final Color hairline;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color accent;
  final Color accentSoft;
  final Color onAccent;
  final Color accentText;
  final Color success;
  final Color warning;
  final Color danger;
  final Color info;
  final Color scrim;
  final List<QmAvatarTint> avatarTints;

  /// The one and only Obsidian palette.
  static const QuantMailTokens obsidian = QuantMailTokens(
    canvas: Color(0xFF040508),
    panel: Color(0xFF0A0C13),
    panelRaised: Color(0xFF10131C),
    hairline: Color(0x14FFFFFF), // rgba(255,255,255,0.08)
    textPrimary: Color(0xFFF5F5F5),
    textSecondary: Color(0xFFA1A1AA),
    textMuted: Color(0xFF8B8B96),
    accent: Color(0xFFFF7A00),
    accentSoft: Color(0xFFFF9E40),
    onAccent: Color(0xFF111111),
    accentText: Color(0xFFFF9E40),
    success: Color(0xFF3DDC97),
    warning: Color(0xFFFFC857),
    danger: Color(0xFFFF5A5F),
    info: Color(0xFF6AA8FF),
    scrim: Color(0x99000000), // rgba(0,0,0,0.60)
    avatarTints: _avatarTints,
  );

  // Background = bright colour at 22 percent over the canvas, precomputed so
  // the list can stay const. Contrast is checked in test/design_tokens_test.
  static const List<QmAvatarTint> _avatarTints = <QmAvatarTint>[
    QmAvatarTint(Color(0xFF3A2410), Color(0xFFFFB26B)), // amber
    QmAvatarTint(Color(0xFF0E2E24), Color(0xFF5FE3A8)), // mint
    QmAvatarTint(Color(0xFF14233F), Color(0xFF8DBBFF)), // sky
    QmAvatarTint(Color(0xFF2E1A3D), Color(0xFFD3A3FF)), // violet
    QmAvatarTint(Color(0xFF3B1A22), Color(0xFFFF8E95)), // rose
    QmAvatarTint(Color(0xFF0F2F33), Color(0xFF6FDDE8)), // teal
    QmAvatarTint(Color(0xFF332F10), Color(0xFFEBDB66)), // olive
    QmAvatarTint(Color(0xFF2A2A33), Color(0xFFC4C4D6)), // slate
  ];

  /// 135 degree primary gradient.
  LinearGradient get accentGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[accent, accentSoft],
      );

  // Type scale (spec "Type"). Heights are line-height / font-size.
  TextStyle get display => _style(24, 32, FontWeight.w600);
  TextStyle get title => _style(20, 28, FontWeight.w600);
  TextStyle get subject => _style(16, 24, FontWeight.w600);
  TextStyle get body => _style(14, 20, FontWeight.w400);
  TextStyle rowSender({required bool unread}) =>
      _style(15, 20, unread ? FontWeight.w600 : FontWeight.w400);
  TextStyle get snippet => _style(13, 18, FontWeight.w400, color: textSecondary);
  TextStyle get label => _style(13, 20, FontWeight.w500, color: const Color(0xFFD4D4D8));
  TextStyle get caption => _style(12, 16, FontWeight.w500, color: textSecondary);
  TextStyle get overline =>
      _style(11, 16, FontWeight.w500, color: textMuted).copyWith(letterSpacing: 11 * 0.12);

  TextStyle _style(double size, double lineHeight, FontWeight weight, {Color? color}) {
    return TextStyle(
      fontFamily: fontFamily,
      fontSize: size,
      height: lineHeight / size,
      fontWeight: weight,
      color: color ?? textPrimary,
    );
  }

  /// Tokens of the closest theme, falling back to [obsidian] so a widget
  /// pumped without the extension (for example in a test) still renders.
  static QuantMailTokens of(BuildContext context) =>
      Theme.of(context).extension<QuantMailTokens>() ?? obsidian;

  /// WCAG contrast ratio between two opaque colours.
  static double contrast(Color a, Color b) {
    final double la = a.computeLuminance();
    final double lb = b.computeLuminance();
    final double hi = math.max(la, lb);
    final double lo = math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  @override
  QuantMailTokens copyWith({
    Color? canvas,
    Color? panel,
    Color? panelRaised,
    Color? hairline,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? accent,
    Color? accentSoft,
    Color? onAccent,
    Color? accentText,
    Color? success,
    Color? warning,
    Color? danger,
    Color? info,
    Color? scrim,
    List<QmAvatarTint>? avatarTints,
  }) {
    return QuantMailTokens(
      canvas: canvas ?? this.canvas,
      panel: panel ?? this.panel,
      panelRaised: panelRaised ?? this.panelRaised,
      hairline: hairline ?? this.hairline,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      accent: accent ?? this.accent,
      accentSoft: accentSoft ?? this.accentSoft,
      onAccent: onAccent ?? this.onAccent,
      accentText: accentText ?? this.accentText,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      info: info ?? this.info,
      scrim: scrim ?? this.scrim,
      avatarTints: avatarTints ?? this.avatarTints,
    );
  }

  @override
  QuantMailTokens lerp(ThemeExtension<QuantMailTokens>? other, double t) {
    if (other is! QuantMailTokens) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t) ?? a;
    return QuantMailTokens(
      canvas: mix(canvas, other.canvas),
      panel: mix(panel, other.panel),
      panelRaised: mix(panelRaised, other.panelRaised),
      hairline: mix(hairline, other.hairline),
      textPrimary: mix(textPrimary, other.textPrimary),
      textSecondary: mix(textSecondary, other.textSecondary),
      textMuted: mix(textMuted, other.textMuted),
      accent: mix(accent, other.accent),
      accentSoft: mix(accentSoft, other.accentSoft),
      onAccent: mix(onAccent, other.onAccent),
      accentText: mix(accentText, other.accentText),
      success: mix(success, other.success),
      warning: mix(warning, other.warning),
      danger: mix(danger, other.danger),
      info: mix(info, other.info),
      scrim: mix(scrim, other.scrim),
      avatarTints: t < 0.5 ? avatarTints : other.avatarTints,
    );
  }
}
