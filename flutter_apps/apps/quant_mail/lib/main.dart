import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'screens/superapp/superapp_home_screen.dart';
import 'screens/mail/mail_inbox_screen.dart';

void main() {
  runApp(const QuantMailApp());
}

/// Sovereign QuantMail Flutter Application
///
/// Features Impeller 120Hz zero-allocation rendering, sub-5ms local FTS5 search,
/// quantum-resistant E2EE envelope security, Superhuman keyboard workflow,
/// and unified 5-pillar enterprise productivity super-app orchestration.
class QuantMailApp extends StatelessWidget {
  const QuantMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantMail',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme.copyWith(
        primaryColor: QuantColors.moltenAmber,
        colorScheme: QuantTheme.obsidianDarkTheme.colorScheme.copyWith(
          primary: QuantColors.moltenAmber,
        ),
      ),
      home: const SuperAppHomeScreen(),
    );
  }
}

// Backward compatibility aliases
typedef QuantMailInboxScreen = MailInboxScreen;
typedef QuantSuperAppHomeScreen = SuperAppHomeScreen;
