import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_theme/quant_theme.dart';
import 'screens/superapp/quant_workplace_splash_screen.dart';
import 'design/quant_mail_theme.dart';
import 'services/quant_auth_controller.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await QuantAuthController.instance.init();
  runApp(const ProviderScope(child: QuantMailApp()));
}

/// Sovereign QuantWorkplace Flutter Application (by Quantrinity)
///
/// Features Impeller 120Hz zero-allocation rendering, local FTS5 search,
/// Superhuman keyboard workflow, and unified 5-pillar enterprise productivity
/// super-app orchestration (QuantMail, QuantCalendar, QuantDrive,
/// QuantContacts, QuantGit).
class QuantMailApp extends StatelessWidget {
  const QuantMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantWorkplace',
      debugShowCheckedModeBanner: false,
      theme: buildQuantMailTheme(QuantTheme.obsidianDarkTheme.copyWith(
        primaryColor: QuantColors.moltenAmber,
        colorScheme: QuantTheme.obsidianDarkTheme.colorScheme.copyWith(
          primary: QuantColors.moltenAmber,
        ),
      )),
      home: const QuantWorkplaceSplashScreen(
        initialSplashDuration: Duration(milliseconds: 3200),
      ),
    );
  }
}
