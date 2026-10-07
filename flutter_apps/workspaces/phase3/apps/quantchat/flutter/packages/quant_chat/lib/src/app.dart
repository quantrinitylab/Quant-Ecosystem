// ============================================================================
// quant_chat - root application widget
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router/app_router.dart';
import 'theme/quant_chat_theme.dart';

/// Root widget for the QuantChat Flutter client.
///
/// A [ConsumerWidget] so the [GoRouter] instance comes from
/// [appRouterProvider] (owned by W4): exactly one router per container,
/// rebuilt only if the provider is overridden (tests) — never on widget
/// rebuilds.
///
/// Theme comes from [QuantChatTheme] (owned by W2), adapted from the
/// `@quant/brand` design tokens — chat-first tweaks on top of the shared
/// Material 3 palette. Dark is the default per the brand tokens SSOT.
class QuantChatApp extends ConsumerWidget {
  const QuantChatApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuantChat',
      routerConfig: ref.watch(appRouterProvider),
      theme: QuantChatTheme.quantChatLight,
      darkTheme: QuantChatTheme.quantChatDark,
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
    );
  }
}
