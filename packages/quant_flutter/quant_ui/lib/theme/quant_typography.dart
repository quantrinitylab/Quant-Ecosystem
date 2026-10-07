import 'package:flutter/material.dart';
import 'quant_colors.dart';

/// Precision Typography Hierarchy for Quant Obsidian Luxury Experience.
///
/// Optimized for ultra-high PPI mobile OLED panels and desktop displays.
class QuantTypography {
  QuantTypography._();

  /// 32sp Bold Display
  static const TextStyle displayLarge = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.8,
    color: QuantColors.textPrimary,
    height: 1.2,
  );

  /// 24sp Bold Heading
  static const TextStyle displayMedium = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: QuantColors.textPrimary,
    height: 1.25,
  );

  /// 20sp Title Large
  static const TextStyle titleLarge = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.4,
    color: QuantColors.textPrimary,
    height: 1.3,
  );

  /// 16sp Title Medium (Squircle headers & top bar active states)
  static const TextStyle titleMedium = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
    color: QuantColors.textPrimary,
    height: 1.35,
  );

  /// 14sp Body Medium (Crisp readable thread content)
  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.1,
    color: QuantColors.textPrimary,
    height: 1.5,
  );

  /// 13sp Body Secondary (Metadata, timestamps, preview snippets)
  static const TextStyle bodySecondary = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.0,
    color: QuantColors.textSecondary,
    height: 1.45,
  );

  /// 12sp Body Small
  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.0,
    color: QuantColors.textMuted,
    height: 1.4,
  );

  /// 11sp Monospace Telemetry / Latency Badge
  static const TextStyle labelSpeed = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.5,
    fontFamily: 'monospace',
    color: QuantColors.statusSuccess,
  );

  /// 11sp Pillar Mode Pill Label
  static const TextStyle pillarLabel = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.3,
  );

  /// 10sp Micro Status Indicator Label
  static const TextStyle microCapsule = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.6,
  );
}
