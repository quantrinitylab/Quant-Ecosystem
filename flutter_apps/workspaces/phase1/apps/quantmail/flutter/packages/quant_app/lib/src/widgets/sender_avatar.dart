import 'package:flutter/material.dart';

/// Per-sender avatar with a deterministic, brand-derived hue (VQA-P2-02).
///
/// The theme primary's hue is rotated across 6 stops, hashed from [seed],
/// so avatars vary per sender (Gmail/Superhuman scanning aid) instead of
/// forming one orange wall. FNV-1a keeps the seed -> hue mapping
/// deterministic across runs (golden-safe; `String.hashCode` is not stable
/// across executions).
///
/// Moved here from `inbox_screen.dart` (VQA-P2-21) so thread message cards
/// share the exact same palette — one palette authority, no drift.
class SenderAvatar extends StatelessWidget {
  const SenderAvatar({
    super.key,
    required this.seed,
    required this.initial,
    this.radius = 20,
    this.semanticsLabel,
    this.textStyle,
  });

  /// Stable hash input (thread id, sender email, ...). Must be non-empty;
  /// an empty seed hashes to a valid hue anyway, but callers should pass
  /// a stable identifier.
  final String seed;

  /// The glyph rendered inside the avatar (typically one uppercased
  /// character, already computed by the caller).
  final String initial;

  final double radius;

  /// Optional semantics label for the initial glyph.
  final String? semanticsLabel;

  /// Optional text style override; defaults to the theme's titleMedium
  /// tinted with the avatar foreground color.
  final TextStyle? textStyle;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return CircleAvatar(
      radius: radius,
      backgroundColor: avatarBackground(seed, scheme),
      child: Text(
        initial,
        semanticsLabel: semanticsLabel,
        style: (textStyle ?? textTheme.titleMedium)
            ?.copyWith(color: avatarForeground(seed, scheme)),
      ),
    );
  }
}

/// Brand-derived avatar palette. The theme primary's hue is rotated across
/// 6 stops, so per-sender avatars vary while staying on-brand.
double avatarHue(String seed, ColorScheme scheme) {
  final double baseHue = HSLColor.fromColor(scheme.primary).hue;
  return (baseHue + (fnv1a32(seed) % 6) * 60.0) % 360.0;
}

/// Muted container tint for the avatar at the seed's hue.
Color avatarBackground(String seed, ColorScheme scheme) {
  final bool isDark = scheme.brightness == Brightness.dark;
  return HSLColor.fromAHSL(
    1,
    avatarHue(seed, scheme),
    isDark ? 0.45 : 0.55,
    isDark ? 0.30 : 0.86,
  ).toColor();
}

/// Legible initial color on [avatarBackground] at the same hue.
Color avatarForeground(String seed, ColorScheme scheme) {
  final bool isDark = scheme.brightness == Brightness.dark;
  return HSLColor.fromAHSL(
    1,
    avatarHue(seed, scheme),
    isDark ? 0.50 : 0.45,
    isDark ? 0.90 : 0.25,
  ).toColor();
}

/// FNV-1a 32-bit: tiny, dependency-free, deterministic string hash.
int fnv1a32(String s) {
  int hash = 0x811C9DC5;
  for (int i = 0; i < s.length; i++) {
    hash ^= s.codeUnitAt(i);
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return hash;
}
