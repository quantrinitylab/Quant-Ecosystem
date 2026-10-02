// ============================================================================
// gram_app - root application widget
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:gram_core/gram_core.dart';

/// Root widget for the QuantGram Flutter client.
///
/// A [ConsumerWidget] so downstream shifts can read theme/router providers
/// from the container. Takes the [GoRouter] instance as a constructor
/// parameter so tests can inject a stub router and the app never rebuilds the
/// router on widget rebuilds (single router per app lifetime).
///
/// Theme: `themeMode` follows the system; light/dark [ThemeData] comes from
/// [GramTheme.buildGramTheme] in `gram_core`. Do NOT fall back to
/// `ThemeData.light()` / `ThemeData.dark()`.
class GramApp extends ConsumerWidget {
  /// The app's router. W4 wires the real `GoRouter` (splash → login → feed).
  const GramApp({super.key, required this.router});

  /// GoRouter driving the app (splash / login / feed routes, W4).
  final GoRouter router;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuantGram',
      routerConfig: router,
      // W2 theme landed: GramTheme.buildGramTheme(Brightness).
      theme: GramTheme.buildGramTheme(Brightness.light),
      darkTheme: GramTheme.buildGramTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      debugShowCheckedModeBanner: false,
    );
  }
}
