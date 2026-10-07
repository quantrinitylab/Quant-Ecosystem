import 'package:flutter/material.dart';

/// Sovereign Obsidian Luxury Color Palette & Brand Tokens for Quant Ecosystem.
///
/// Designed for Skia and Impeller hardware rendering pipelines with deep
/// contrast, sub-hairline borders, and jewel-tone brand pillar accents.
class QuantColors {
  QuantColors._();

  // Core Obsidian Surfaces
  /// Void Obsidian base canvas (#090A0E)
  static const Color voidObsidian = Color(0xFF090A0E);

  /// Alias for voidObsidian
  static const Color obsidianVoid = Color(0xFF090A0E);

  /// Dark Slate Card container surface (#12151E)
  static const Color darkSlateCard = Color(0xFF12151E);

  /// Alias for darkSlateCard
  static const Color darkSlateSurface = Color(0xFF12151E);

  /// Elevated card container for modals, flyouts, and floating panels (#181B26)
  static const Color elevatedCard = Color(0xFF181B26);

  /// Frosted obsidian overlay for dynamic island capsule and sheets
  static const Color frostedObsidian = Color(0xE6090A0E);

  /// Frosted glass overlay
  static const Color frostedGlass = Color(0xCC12151E);

  // Hairline Borders & Dividers
  /// Precision hairline border (#232938)
  static const Color hairlineBorder = Color(0xFF232938);

  /// Active focused border highlight (#3B4254)
  static const Color activeBorder = Color(0xFF3B4254);

  /// Subtle inner divider
  static const Color subtleDivider = Color(0xFF1F232D);

  // Top 5-Pillar Signature Accents
  /// Molten Amber - QuantMail signature accent (#FF8C42)
  static const Color moltenAmber = Color(0xFFFF8C42);

  /// Legacy alias for mail orange accent
  static const Color moltenOrange = Color(0xFFFF8C42);

  /// Sunset Gold - QuantCalendar signature accent (#F59E0B)
  static const Color sunsetGold = Color(0xFFF59E0B);

  /// Sovereign Cyan - QuantDrive signature accent (#38BDF8)
  static const Color sovereignCyan = Color(0xFF38BDF8);

  /// Emerald Matrix - QuantDex / Contacts signature accent (#10B981)
  static const Color emeraldMatrix = Color(0xFF10B981);

  /// Obsidian Purple - QuantGit / CodeHub signature accent (#A78BFA)
  static const Color obsidianPurple = Color(0xFFA78BFA);

  // Extended Ecosystem Accents
  /// Neon Green - QuantChat / WhatsApp parity (#059669)
  static const Color neonGreen = Color(0xFF059669);

  /// Sunrise Rose - QuantGram / Instagram parity (#E1306C)
  static const Color sunriseRose = Color(0xFFE1306C);

  /// Crimson Red - QuanTube / YouTube parity (#EF4444)
  static const Color crimsonRed = Color(0xFFEF4444);

  /// Cosmic Cyan - QuantAI / Agent OS (#06B6D4)
  static const Color cosmicCyan = Color(0xFF06B6D4);

  // High-Legibility Typography
  /// Primary high-contrast text (#F8FAFC)
  static const Color textPrimary = Color(0xFFF8FAFC);

  /// Secondary muted text (#94A3B8)
  static const Color textSecondary = Color(0xFF94A3B8);

  /// Low-contrast tertiary text (#64748B)
  static const Color textMuted = Color(0xFF64748B);

  /// Disabled element text (#475569)
  static const Color textDisabled = Color(0xFF475569);

  // Telemetry & Status Badges
  /// Sub-5ms latency and healthy status indicator (#10B981)
  static const Color statusSuccess = Color(0xFF10B981);

  /// Degraded or pending warning status (#F59E0B)
  static const Color statusWarning = Color(0xFFF59E0B);

  /// Error or critical alert status (#EF4444)
  static const Color statusError = Color(0xFFEF4444);

  /// Informational status (#38BDF8)
  static const Color statusInfo = Color(0xFF38BDF8);

  // Pillar Color Resolver Helper
  /// Resolves the signature accent color by pillar key name
  static Color forPillar(String pillarKey) {
    switch (pillarKey.toLowerCase().trim()) {
      case 'mail':
      case 'quantmail':
        return moltenAmber;
      case 'calendar':
      case 'quantcalendar':
        return sunsetGold;
      case 'drive':
      case 'quantdrive':
        return sovereignCyan;
      case 'contacts':
      case 'quantdex':
        return emeraldMatrix;
      case 'git':
      case 'quantgit':
      case 'codehub':
        return obsidianPurple;
      case 'chat':
      case 'quantchat':
        return neonGreen;
      case 'gram':
      case 'quantgram':
        return sunriseRose;
      case 'tube':
      case 'quantube':
        return crimsonRed;
      case 'ai':
      case 'quantai':
        return cosmicCyan;
      default:
        return moltenAmber;
    }
  }
}
