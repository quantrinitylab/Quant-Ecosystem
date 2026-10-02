import 'package:flutter/material.dart';

/// Sovereign Obsidian Luxury Theme Tokens for Quant Ecosystem
class QuantColors {
  QuantColors._();

  // Backgrounds & Surface Voids
  static const Color voidObsidian = Color(0xFF090A0E);
  static const Color obsidianVoid = Color(0xFF090A0E);
  static const Color darkSlateCard = Color(0xFF12151E);
  static const Color darkSlateSurface = Color(0xFF12151E);
  static const Color elevatedCard = Color(0xFF181B26);
  static const Color frostedGlass = Color(0xCC12151E);
  static const Color frostedObsidian = Color(0xE6090A0E);

  // Precision Hairline Borders & Dividers (#232938)
  static const Color hairlineBorder = Color(0xFF232938);
  static const Color activeBorder = Color(0xFF3B4254);
  static const Color subtleDivider = Color(0xFF1F232D);

  // Signature 5-Pillar Accents
  static const Color moltenAmber = Color(0xFFFF8C42); // QuantMail (#FF8C42)
  static const Color moltenOrange = Color(0xFFFF8C42); // Backwards compatibility
  static const Color sunsetGold = Color(0xFFF59E0B);   // QuantCalendar (#F59E0B)
  static const Color amberGold = Color(0xFFF59E0B);    // Backwards compatibility
  static const Color sovereignCyan = Color(0xFF38BDF8);// QuantDrive (#38BDF8)
  static const Color emeraldMatrix = Color(0xFF10B981);// QuantDex / Contacts (#10B981)
  static const Color cyberEmerald = Color(0xFF10B981); // Backwards compatibility
  static const Color obsidianPurple = Color(0xFFA78BFA);// QuantGit (#A78BFA)
  static const Color indigoViolet = Color(0xFFA78BFA); // Backwards compatibility

  // Extended Ecosystem Accents
  static const Color neonGreen = Color(0xFF059669);    // QuantChat
  static const Color sunriseRose = Color(0xFFE1306C);   // QuantGram
  static const Color crimsonRed = Color(0xFFEF4444);    // QuanTube
  static const Color cosmicCyan = Color(0xFF06B6D4);    // QuantAI

  // Typography Palette
  static const Color textPrimary = Color(0xFFF8FAFC);
  static const Color textSecondary = Color(0xFF94A3B8);
  static const Color textMuted = Color(0xFF64748B);
  static const Color textDisabled = Color(0xFF475569);

  // Status & Telemetry
  static const Color statusSuccess = Color(0xFF10B981);
  static const Color statusWarning = Color(0xFFF59E0B);
  static const Color statusError = Color(0xFFEF4444);
  static const Color statusInfo = Color(0xFF38BDF8);

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

/// Precision Typography Tokens
class QuantTypography {
  QuantTypography._();

  static const TextStyle displayLarge = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.8,
    color: QuantColors.textPrimary,
  );

  static const TextStyle displayMedium = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: QuantColors.textPrimary,
  );

  static const TextStyle titleLarge = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.4,
    color: QuantColors.textPrimary,
  );

  static const TextStyle titleMedium = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
    color: QuantColors.textPrimary,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: QuantColors.textPrimary,
    height: 1.5,
  );

  static const TextStyle bodySecondary = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: QuantColors.textSecondary,
    height: 1.45,
  );

  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: QuantColors.textMuted,
    height: 1.4,
  );

  static const TextStyle labelSpeed = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.5,
    fontFamily: 'monospace',
    color: QuantColors.statusSuccess,
  );

  static const TextStyle pillarLabel = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.3,
  );

  static const TextStyle microCapsule = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.6,
  );
}

/// Master Obsidian Theme Data (Zero clipPath)
class QuantTheme {
  QuantTheme._();

  static ThemeData get obsidianDarkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: QuantColors.voidObsidian,
      primaryColor: QuantColors.moltenAmber,
      colorScheme: const ColorScheme.dark(
        primary: QuantColors.moltenAmber,
        secondary: QuantColors.sovereignCyan,
        surface: QuantColors.darkSlateCard,
        error: QuantColors.statusError,
      ),
      cardTheme: CardTheme(
        color: QuantColors.darkSlateCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: QuantColors.voidObsidian,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: QuantTypography.titleLarge,
      ),
      dividerTheme: const DividerThemeData(
        color: QuantColors.hairlineBorder,
        thickness: 1,
        space: 1,
      ),
    );
  }
}
