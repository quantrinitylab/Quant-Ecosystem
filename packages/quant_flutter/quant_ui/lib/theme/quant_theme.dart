import 'package:flutter/material.dart';
import 'quant_colors.dart';
import 'quant_typography.dart';

/// Master Obsidian Luxury Theme for Quant Sovereign Ecosystem.
///
/// Designed strictly with zero clipPath calls for hardware-accelerated Skia
/// and Impeller rendering with maximum 120Hz frame budget.
class QuantTheme {
  QuantTheme._();

  /// Default Master Obsidian Dark Theme
  static ThemeData get obsidianDarkTheme => pillarTheme(QuantColors.moltenAmber);

  /// Pillar-tailored Dark Theme with dynamic brand accent
  static ThemeData pillarTheme(Color accentColor) {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: QuantColors.voidObsidian,
      primaryColor: accentColor,
      canvasColor: QuantColors.voidObsidian,
      colorScheme: ColorScheme.dark(
        primary: accentColor,
        secondary: QuantColors.sovereignCyan,
        surface: QuantColors.darkSlateCard,
        error: QuantColors.statusError,
        onPrimary: Colors.white,
        onSurface: QuantColors.textPrimary,
        onError: Colors.white,
      ),
      cardTheme: CardTheme(
        color: QuantColors.darkSlateCard,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(
            color: QuantColors.hairlineBorder,
            width: 1,
          ),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: QuantColors.voidObsidian,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: QuantColors.textPrimary),
        titleTextStyle: QuantTypography.titleLarge,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: QuantColors.darkSlateCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: QuantColors.darkSlateCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
        titleTextStyle: QuantTypography.titleLarge,
        contentTextStyle: QuantTypography.bodyMedium,
      ),
      dividerTheme: const DividerThemeData(
        color: QuantColors.hairlineBorder,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: QuantColors.darkSlateCard,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: QuantTypography.bodySecondary.copyWith(color: QuantColors.textMuted),
        labelStyle: QuantTypography.bodySecondary,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: accentColor, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: QuantColors.statusError, width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accentColor,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: QuantTypography.titleMedium.copyWith(color: Colors.white),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: QuantColors.textPrimary,
          elevation: 0,
          side: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: QuantTypography.titleMedium,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: accentColor,
          textStyle: QuantTypography.titleMedium.copyWith(color: accentColor),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: QuantColors.elevatedCard,
        contentTextStyle: QuantTypography.bodyMedium,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
