// ============================================================================
// gram_app - branded splash screen (bootstrap / auth-restore ke dauraan)
// (QuantGram Shift 1, W4: router + screens)
// ============================================================================
//
// Static splash: auth hydration ke dauraan dikhta hai (router ka redirect
// AsyncLoading par position hold karta hai — app_router.dart dekho).
// Koi API call nahi, koi navigation logic nahi — sirf branding.

import 'package:flutter/material.dart';

/// Splash screen: QuantGram wordmark + gradient accent.
///
/// Router ka initial location `/splash` hai. Auth state resolve hote hi
/// redirect hook `/login` ya `/home` par le jata hai (W3-sync ke baad).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[
              scheme.primaryContainer,
              scheme.surface,
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              // Wordmark: abhi text-based hai; W2 ke design tokens / logo
              // asset aane par yahan swap hoga (theatre nahi — asset invent
              // nahi kiya).
              Semantics(
                header: true,
                label: 'QuantGram',
                child: Text(
                  'QuantGram',
                  style: textTheme.displaySmall?.copyWith(
                    color: scheme.primary,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Moments, beautifully shared',
                style: textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 48),
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
