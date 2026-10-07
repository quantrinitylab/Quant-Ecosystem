// ============================================================================
// quant_foundation - brand color tokens
// ============================================================================
//
// Dart port of `packages/brand/src/colors.ts` (SSOT) and the per-app color
// from `packages/brand/src/apps.ts` (QuantMail accent).
//
// Mapping rules (see ARCHITECTURE.md §3 "Design system"):
// - TS hex strings → `Color(0xFF…)` compile-time constants.
// - Naming: TS `primary.500` → `QuantColors.primary500`,
//   `semantic.info.500` → `QuantColors.info500`, `surface.dark` →
//   `QuantColors.surfaceDark`.
// - The full 50–950 ramps are preserved (all 11 stops per ramp) so Flutter
//   widgets can shade exactly like the web theme does with CSS variables.

import 'package:flutter/material.dart';

/// Brand color tokens, ported 1:1 from `packages/brand/src/colors.ts`.
///
/// All values are `const`, so they can be used in `const` widget trees.
abstract final class QuantColors {
  QuantColors._();

  // -- Primary (brand orange) ramp -----------------------------------------

  /// `primary.50`
  static const Color primary50 = Color(0xFFFFF7ED);

  /// `primary.100`
  static const Color primary100 = Color(0xFFFFEDD5);

  /// `primary.200`
  static const Color primary200 = Color(0xFFFED7AA);

  /// `primary.300`
  static const Color primary300 = Color(0xFFFFB875);

  /// `primary.400`
  static const Color primary400 = Color(0xFFFF9B5A);

  /// `primary.500` — primary brand orange.
  static const Color primary500 = Color(0xFFFF8C42);

  /// `primary.600` — pressed state.
  static const Color primary600 = Color(0xFFE8752F);

  /// `primary.700`
  static const Color primary700 = Color(0xFFC75D1E);

  /// `primary.800` — brand soft.
  static const Color primary800 = Color(0xFF2B1A11);

  /// `primary.900` — brand subtle.
  static const Color primary900 = Color(0xFF1D1410);

  /// `primary.950`
  static const Color primary950 = Color(0xFF110C0A);

  // -- Accent (amber) ramp --------------------------------------------------

  /// `accent.50`
  static const Color accent50 = Color(0xFFFFFBEB);

  /// `accent.100`
  static const Color accent100 = Color(0xFFFEF3C7);

  /// `accent.200`
  static const Color accent200 = Color(0xFFFDE68A);

  /// `accent.300`
  static const Color accent300 = Color(0xFFFCD34D);

  /// `accent.400`
  static const Color accent400 = Color(0xFFFBBF24);

  /// `accent.500`
  static const Color accent500 = Color(0xFFF59E0B);

  /// `accent.600`
  static const Color accent600 = Color(0xFFD97706);

  /// `accent.700`
  static const Color accent700 = Color(0xFFB45309);

  /// `accent.800`
  static const Color accent800 = Color(0xFF92400E);

  /// `accent.900`
  static const Color accent900 = Color(0xFF78350F);

  /// `accent.950`
  static const Color accent950 = Color(0xFF451A03);

  // -- QuantMail lava ramp (brand truth) --------------------------------------
  //
  // Design-atelier LAVA_TOKENS_SPEC.md (P2-24, 2026-10-04): QuantMail's
  // accent voice is lava — one hue family, tonal per-mode. Not a generic
  // orange ramp: these are the brand anchor values (mascot gradient,
  // dark accent, light accent, gradient highlights).

  /// QuantMail lava ramp — brand anchor (mascot gradient mid).
  static const Color lavaCore = Color(0xFFFF4500);

  /// QuantMail lava ramp — dark-mode accent (== primary500).
  static const Color lavaBright = Color(0xFFFF8C42);

  /// QuantMail lava ramp — light-mode accent (P2-24, 5.18:1 on white).
  static const Color lavaDeep = Color(0xFFC2410C);

  /// QuantMail lava ramp — gradient highlight (mascot rim).
  static const Color lavaGold = Color(0xFFFFC700);

  /// QuantMail lava ramp — gradient depth (mascot base).
  static const Color lavaCrimson = Color(0xFFD61800);

  // -- Neutral (slate) ramp -------------------------------------------------

  /// `neutral.50`
  static const Color neutral50 = Color(0xFFF5F5F5);

  /// `neutral.100`
  static const Color neutral100 = Color(0xFFE4E5E8);

  /// `neutral.200`
  static const Color neutral200 = Color(0xFFC5C7CD);

  /// `neutral.300`
  static const Color neutral300 = Color(0xFFA1A4AC);

  /// `neutral.400`
  static const Color neutral400 = Color(0xFF83868E);

  /// `neutral.500`
  static const Color neutral500 = Color(0xFF6B6E76);

  /// `neutral.600`
  static const Color neutral600 = Color(0xFF4A4D55);

  /// `neutral.700` — border default (dark theme).
  static const Color neutral700 = Color(0xFF282C35);

  /// `neutral.800` — elevated surface (dark theme).
  static const Color neutral800 = Color(0xFF16181D);

  /// `neutral.900` — primary surface (dark theme).
  static const Color neutral900 = Color(0xFF111318);

  /// `neutral.950` — canvas (dark theme background).
  static const Color neutral950 = Color(0xFF090A0C);

  // -- Semantic: error (red) ------------------------------------------------

  /// `semantic.error.50`
  static const Color error50 = Color(0xFFFEF2F2);

  /// `semantic.error.100`
  static const Color error100 = Color(0xFFFEE2E2);

  /// `semantic.error.200`
  static const Color error200 = Color(0xFFFECACA);

  /// `semantic.error.300`
  static const Color error300 = Color(0xFFFCA5A5);

  /// `semantic.error.400`
  static const Color error400 = Color(0xFFF87171);

  /// `semantic.error.500`
  static const Color error500 = Color(0xFFEF4444);

  /// `semantic.error.600` — destructive surface (meets AA with white label).
  static const Color error600 = Color(0xFFDC2626);

  /// `semantic.error.700`
  static const Color error700 = Color(0xFFB91C1C);

  /// `semantic.error.800`
  static const Color error800 = Color(0xFF991B1B);

  /// `semantic.error.900`
  static const Color error900 = Color(0xFF7F1D1D);

  /// `semantic.error.950`
  static const Color error950 = Color(0xFF450A0A);

  // -- Semantic: warning (amber) --------------------------------------------

  /// `semantic.warning.50`
  static const Color warning50 = Color(0xFFFFFBEB);

  /// `semantic.warning.100`
  static const Color warning100 = Color(0xFFFEF3C7);

  /// `semantic.warning.200`
  static const Color warning200 = Color(0xFFFDE68A);

  /// `semantic.warning.300`
  static const Color warning300 = Color(0xFFFCD34D);

  /// `semantic.warning.400`
  static const Color warning400 = Color(0xFFFBBF24);

  /// `semantic.warning.500`
  static const Color warning500 = Color(0xFFF59E0B);

  /// `semantic.warning.600`
  static const Color warning600 = Color(0xFFD97706);

  /// `semantic.warning.700`
  static const Color warning700 = Color(0xFFB45309);

  /// `semantic.warning.800`
  static const Color warning800 = Color(0xFF92400E);

  /// `semantic.warning.900`
  static const Color warning900 = Color(0xFF78350F);

  /// `semantic.warning.950`
  static const Color warning950 = Color(0xFF451A03);

  // -- Semantic: success (green) --------------------------------------------

  /// `semantic.success.50`
  static const Color success50 = Color(0xFFF0FDF4);

  /// `semantic.success.100`
  static const Color success100 = Color(0xFFDCFCE7);

  /// `semantic.success.200`
  static const Color success200 = Color(0xFFBBF7D0);

  /// `semantic.success.300`
  static const Color success300 = Color(0xFF86EFAC);

  /// `semantic.success.400`
  static const Color success400 = Color(0xFF4ADE80);

  /// `semantic.success.500`
  static const Color success500 = Color(0xFF22C55E);

  /// `semantic.success.600`
  static const Color success600 = Color(0xFF16A34A);

  /// `semantic.success.700`
  static const Color success700 = Color(0xFF15803D);

  /// `semantic.success.800`
  static const Color success800 = Color(0xFF166534);

  /// `semantic.success.900`
  static const Color success900 = Color(0xFF14532D);

  /// `semantic.success.950`
  static const Color success950 = Color(0xFF052E16);

  // -- Semantic: info (blue) ------------------------------------------------

  /// `semantic.info.50`
  static const Color info50 = Color(0xFFEFF6FF);

  /// `semantic.info.100`
  static const Color info100 = Color(0xFFDBEAFE);

  /// `semantic.info.200`
  static const Color info200 = Color(0xFFBFDBFE);

  /// `semantic.info.300`
  static const Color info300 = Color(0xFF93C5FD);

  /// `semantic.info.400`
  static const Color info400 = Color(0xFF60A5FA);

  /// `semantic.info.500` — also the QuantMail app accent (see
  /// [QuantAppColors.quantmail]).
  static const Color info500 = Color(0xFF3B82F6);

  /// `semantic.info.600`
  static const Color info600 = Color(0xFF2563EB);

  /// `semantic.info.700`
  static const Color info700 = Color(0xFF1D4ED8);

  /// `semantic.info.800`
  static const Color info800 = Color(0xFF1E40AF);

  /// `semantic.info.900`
  static const Color info900 = Color(0xFF1E3A8A);

  /// `semantic.info.950`
  static const Color info950 = Color(0xFF172554);

  // -- Surfaces --------------------------------------------------------------

  /// `surface.dark` — canvas, dark theme background.
  static const Color surfaceDark = Color(0xFF090A0C);

  /// `surface.darkElevated` — primary surface, dark theme.
  static const Color surfaceDarkElevated = Color(0xFF111318);

  /// `surface.darkOverlay` — elevated surface, dark theme.
  static const Color surfaceDarkOverlay = Color(0xFF16181D);

  /// `surface.light` — canvas, light theme background.
  static const Color surfaceLight = Color(0xFFFFFFFF);

  /// `surface.lightElevated` — primary surface, light theme.
  static const Color surfaceLightElevated = Color(0xFFF8F9FA);

  /// `surface.lightOverlay` — elevated surface, light theme.
  static const Color surfaceLightOverlay = Color(0xFFF1F3F5);
}

/// Per-app brand accent colors, ported 1:1 from `packages/brand/src/apps.ts`.
///
/// QuantMail's accent is the blue used for the QuantMail app theme
/// ([QuantTheme.quantMailDark] / [QuantTheme.quantMailLight]).
abstract final class QuantAppColors {
  QuantAppColors._();

  /// QuantMail — email with AI-powered organization.
  static const Color quantmail = Color(0xFF3B82F6);

  /// QuantChat — real-time messaging and collaboration.
  static const Color quantchat = Color(0xFF10B981);

  /// QuantAI — intelligent assistant.
  static const Color quantai = Color(0xFF8B5CF6);

  /// QuantCalendar — smart scheduling and time management.
  static const Color quantcalendar = Color(0xFFF97316);

  /// QuantDocs — collaborative document editing.
  static const Color quantdocs = Color(0xFF14B8A6);

  /// QuantDrive — cloud storage and file management.
  static const Color quantdrive = Color(0xFF6366F1);

  /// QuantMeet — video conferencing and virtual meetings.
  static const Color quantmeet = Color(0xFFEF4444);

  /// QuantNeon — creative design and visual workspace.
  static const Color quantneon = Color(0xFFEC4899);

  /// QuantSync — cross-device synchronization and backup.
  static const Color quantsync = Color(0xFF06B6D4);

  /// QuanTube — video hosting and streaming platform.
  static const Color quantube = Color(0xFFF43F5E);

  /// QuantMax — productivity optimization and automation.
  static const Color quantmax = Color(0xFFF59E0B);

  /// QuantEdits — photo and video editing suite.
  static const Color quantedits = Color(0xFF7C3AED);

  /// QuantAds — advertising and marketing campaigns.
  static const Color quantads = Color(0xFF059669);

  /// Marketing — marketing analytics and insights.
  static const Color marketing = Color(0xFF64748B);

  /// QuantMaps — navigation and location services.
  static const Color quantmaps = Color(0xFF22C55E);

  /// QuantPhotos — photo management and memories.
  static const Color quantphotos = Color(0xFFA855F7);
}
