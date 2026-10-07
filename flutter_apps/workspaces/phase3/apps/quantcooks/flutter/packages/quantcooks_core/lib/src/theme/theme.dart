// ============================================================================
// quantcooks_core - theme barrel
// ============================================================================
//
// Public theme surface of the QuantCooks editor: brand color tokens,
// typography, motion, and the Material 3 light/dark themes built from them.
//
// Usage:
//   import 'package:quantcooks_core/src/theme/theme.dart';
//
//   MaterialApp(
//     theme: CooksTheme.light,
//     darkTheme: CooksTheme.dark,
//     themeMode: ThemeMode.dark, // dark-first editor
//   );
//
// Canvas-specific colors/gradients (playhead, timeline surfaces, creative
// CTA gradient) live in [CooksCanvasExtension]:
//   Theme.of(context).extension<CooksCanvasExtension>()!.playhead;

library quantcooks_core.theme;

export 'cooks_colors.dart';
export 'cooks_motion.dart';
export 'cooks_theme.dart';
export 'cooks_typography.dart';
