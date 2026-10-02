// ============================================================================
// gram_app - SSO-only login screen (OAuth2 + PKCE, QuantMail SSO)
// (QuantGram Shift 1, W4: router + screens)
// ============================================================================
//
// Phase1 `quant_app/lib/src/screens/login_screen.dart` se copy-adapt
// (read-only reference; phase1 file NOT modified). Farq: QuantGram me
// username/password fields NAHI hain — SSO only (D1: existing OAuth2,
// koi naya endpoint nahi). Ek hi button: "Continue with QuantMail".
//
// Flow:
//   1. Button dabao -> auth notifier PKCE flow start karta hai
//      (verifier + state gram_core ke paas; authorize URL milti hai).
//   2. `AuthConsentRequired(authorizeUrl)` state par screen authorize URL ko
//      system browser me kholti hai ([BrowserAuthLauncher]).
//   3. Backend se wapas deep link (`quantgram://oauth/callback?code=…`)
//      `/oauth/callback` route pakadta hai -> notifier code exchange karta
//      hai -> `AuthAuthenticated` -> router `/home` bhejta hai.
//
// W3-sync (Shift 1, coordinator reconcile): gram_core publish ho gaya.
// Actual API surface (phase1 `quant_core` ke shape ko mirror karta hai):
//   - `authSessionProvider` : AsyncNotifierProvider<AuthSessionNotifier, AuthSessionState>
//   - `AuthSessionState` (sealed, positional ctors): AuthInitial | AuthLoading |
//       AuthConsentRequired(authorizeUrl) | AuthAuthenticated | AuthFailure(message)
//   - `AuthSessionNotifier.beginSsoLogin()`: PKCE flow initiate karta hai;
//       consent chahiye to AuthConsentRequired state me authorizeUrl deta hai
// Neeche wali gram_core import W3 ke final API se wired hai.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gram_core/gram_core.dart';

import '../providers/app_providers.dart';

/// Sign-in screen: QuantMail SSO ka OAuth2+PKCE entry point.
///
/// [AuthState] ke hisaab se render karti hai:
///   AuthInitial / AuthFailure -> SSO button (+ error banner on failure)
///   AuthLoading               -> disabled button par spinner
///   AuthConsentRequired       -> browser-consent handoff card
///   AuthAuthenticated         -> kuch nahi (router redirect hop own karta hai)
///
/// Koi fake auth nahi: button real auth notifier methods call karte hain.
/// Theme ambient [Theme] se aata hai (W2 ke design tokens `src/app.dart` me
/// wire honge — W1 ki ownership).
class LoginScreen extends ConsumerStatefulWidget {
  /// Creates the login screen.
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  /// Browser khulne ke dauraan consent button par spinner.
  bool _openingBrowser = false;

  /// SSO flow start karta hai: notifier PKCE pair banata hai aur authorize
  /// URL deta hai (state -> AuthConsentRequired ya AuthAuthenticated).
  Future<void> _startSso() async {
    // W3-sync: actual method `beginSsoLogin()` hai (not `startSsoLogin`).
    await ref.read(authSessionProvider.notifier).beginSsoLogin();
  }

  /// OAuth2 authorize URL ko system browser me kholta hai.
  Future<void> _openAuthorizeUrl(Uri url) async {
    setState(() => _openingBrowser = true);
    try {
      final bool opened =
          await ref.read(browserLauncherProvider).launchAuthorizeUrl(url);
      if (!mounted) {
        return;
      }
      if (!opened) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Browser nahi khul paya — dobara try karo.'),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _openingBrowser = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // W3-sync: real session wiring (gram_core `authSessionProvider`).
    final AsyncValue<AuthSessionState> session =
        ref.watch(authSessionProvider);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final bool wide = constraints.maxWidth >= 640;
              final Widget content = ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: session.when(
                    data: _buildStateBody,
                    loading: () => _buildSsoView(loading: true),
                    error: (Object error, StackTrace _) => _buildSsoView(
                      errorMessage: 'Sign-in failed: $error',
                    ),
                  ),
                ),
              );
              if (!wide) {
                return content;
              }
              return Card(
                margin: const EdgeInsets.all(24),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: content,
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  /// Auth state ko uske view se map karta hai. (W3-sync: activated.)
  Widget _buildStateBody(AuthSessionState state) {
    return switch (state) {
      AuthAuthenticated() =>
        // Router redirect /home hop own karta hai; kuch render nahi.
        const SizedBox.shrink(),
      AuthConsentRequired() => _buildConsentView(state),
      AuthFailure() => _buildSsoView(errorMessage: state.message),
      AuthLoading() => _buildSsoView(loading: true),
      AuthInitial() => _buildSsoView(),
    };
  }

  /// QuantGram branding header.
  Widget _buildBrandingHeader() {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Semantics(
          label: 'QuantGram logo',
          image: true,
          child: Icon(
            Icons.camera_alt_outlined,
            size: 56,
            color: scheme.primary,
          ),
        ),
        const SizedBox(height: 16),
        Semantics(
          header: true,
          child: Text('QuantGram', style: textTheme.headlineMedium),
        ),
        const SizedBox(height: 4),
        Text(
          'Sign in with your QuantMail account',
          style:
              textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
      ],
    );
  }

  /// SSO view: branding + "Continue with QuantMail" button.
  ///
  /// [errorMessage] ([AuthFailure.message]) error banner render karta hai;
  /// [loading] button disable karke spinner dikhata hai.
  Widget _buildSsoView({String? errorMessage, bool loading = false}) {
    final ThemeData theme = Theme.of(context);
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _buildBrandingHeader(),
        const SizedBox(height: 32),
        if (errorMessage != null) ...<Widget>[
          _ErrorBanner(message: errorMessage),
          const SizedBox(height: 16),
        ],
        SizedBox(
          height: 52,
          child: ElevatedButton.icon(
            onPressed: loading ? null : _startSso,
            icon: loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.mark_email_unread_outlined),
            label: Text(
              loading ? 'Connecting…' : 'Continue with QuantMail',
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Secured with OAuth2 + PKCE — koi naya password nahi.',
          style: textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  /// Consent handoff view [AuthConsentRequired] ke liye (W3-sync: activated):
  /// one-time browser approval explain karta hai aur
  /// [AuthConsentRequired.authorizeUrl] kholta hai.
  Widget _buildConsentView(AuthConsentRequired state) {
  final ThemeData theme = Theme.of(context);
  final ColorScheme scheme = theme.colorScheme;
  final TextTheme textTheme = theme.textTheme;
  return Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: <Widget>[
      _buildBrandingHeader(),
      const SizedBox(height: 24),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                Icons.open_in_browser_outlined,
                size: 40,
                color: scheme.secondary,
              ),
              const SizedBox(height: 12),
              Semantics(
                header: true,
                child: Text(
                  'Browser me permission do',
                  style: textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Pehli baar browser me permission approve karni hogi. '
                'Continue dabane par QuantMail ka consent page khulega.',
                style: textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 24),
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: _openingBrowser
                ? null
                : () => _openAuthorizeUrl(state.authorizeUrl),
            child: _openingBrowser
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Continue in browser'),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Approve karne ke baad app par wapas aa jao.',
          style: textTheme.bodySmall
              ?.copyWith(color: scheme.onSurfaceVariant),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

/// Error banner for sign-in failures, screen readers ko announce hota hai.
class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    return Semantics(
      liveRegion: true,
      label: 'Sign-in error: $message',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: scheme.errorContainer,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: scheme.error.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: <Widget>[
            Icon(Icons.error_outline, color: scheme.onErrorContainer, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: scheme.onErrorContainer),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
