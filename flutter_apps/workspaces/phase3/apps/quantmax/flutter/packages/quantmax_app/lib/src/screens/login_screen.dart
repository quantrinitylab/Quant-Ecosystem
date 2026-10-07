// ============================================================================
// quantmax_app - QuantMail SSO login screen (Phase 3b, Shift 1)
// ============================================================================
//
// QuantMax's D1 sign-in: dark, feed-style hero with the single
// "Continue with QuantMail" OAuth2+PKCE entry point. Driven by
// [authStateProvider] from `package:quantmax_core/quantmax_core.dart`
// ([QuantMaxAuthSessionNotifier]):
//
//   AuthInitial          -> hero + SSO button
//   AuthLoading          -> hero + spinning SSO button
//   AuthFailure          -> hero + SSO button + error banner
//   AuthConsentRequired  -> browser-consent handoff card
//   AuthAuthenticated    -> nothing (the router owns the hop to the feed)
//
// Wiring:
//   - tap button -> `QuantMaxAuthSessionNotifier.startBrowserSignIn()`
//   - consent    -> [BrowserAuthLauncher.openAuthorizeUrl]
// QA lesson F1 respected: state constructors are positional, e.g.
// `AuthFailure(this.message)` — no named args anywhere.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantmax_core/quantmax_core.dart';

import '../auth/browser_launcher.dart';
import '../widgets/auth_fields.dart';

/// Sign-in screen: the OAuth2+PKCE entry point of the QuantMax app.
class LoginScreen extends ConsumerStatefulWidget {
  /// Creates the login screen.
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  /// Spinner on the consent button while the OS browser opens.
  bool _openingBrowser = false;

  /// Starts the "Continue with QuantMail" OAuth2+PKCE flow.
  ///
  /// Wired to [QuantMaxAuthSessionNotifier.startBrowserSignIn] (quantmax_core):
  /// lands on [AuthConsentRequired] carrying the authorize URL, which the
  /// consent view opens in the system browser.
  Future<void> _startSso() async {
    FocusScope.of(context).unfocus();
    await ref.read(authStateProvider.notifier).startBrowserSignIn();
  }

  /// Opens the OAuth2 consent URL in the system browser.
  Future<void> _openConsentUrl(Uri url) async {
    setState(() => _openingBrowser = true);
    try {
      final bool opened =
          await ref.read(browserLauncherProvider).openAuthorizeUrl(url);
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
    final AsyncValue<AuthSessionState> session = ref.watch(authStateProvider);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: session.when(
                data: _buildStateBody,
                loading: () => const _BootstrappingView(),
                error: (Object error, StackTrace stackTrace) =>
                    _ProviderErrorView(
                  onRetry: () => ref.invalidate(authStateProvider),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Maps the auth state to its view.
  Widget _buildStateBody(AuthSessionState state) {
    return switch (state) {
      AuthAuthenticated() =>
        // W6's router redirect owns the hop to the feed; render nothing.
        const SizedBox.shrink(),
      AuthConsentRequired() => _buildConsentView(state),
      AuthFailure() => _buildSsoView(errorMessage: state.message),
      AuthLoading() => _buildSsoView(loading: true),
      AuthInitial() => _buildSsoView(),
    };
  }

  /// Dark, feed-style branding hero shared by the SSO and consent views.
  Widget _buildBrandingHero() {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        // Feed-style hero tile: vertical-video motif, dark gradient.
        Semantics(
          label: 'QuantMax logo',
          image: true,
          child: Container(
            width: 120,
            height: 160,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: <Color>[
                  scheme.primary,
                  scheme.tertiary,
                  Colors.black,
                ],
              ),
            ),
            child: const Icon(
              Icons.play_circle_fill_outlined,
              size: 64,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 20),
        Semantics(
          header: true,
          child: Text('QuantMax', style: textTheme.headlineMedium),
        ),
        const SizedBox(height: 4),
        Text(
          'Short videos. Endless discovery.',
          style: textTheme.bodyMedium
              ?.copyWith(color: scheme.onSurfaceVariant),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  /// SSO view: hero, "Continue with QuantMail" button, error banner, note.
  Widget _buildSsoView({String? errorMessage, bool loading = false}) {
    final ThemeData theme = Theme.of(context);
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _buildBrandingHero(),
        const SizedBox(height: 40),
        if (errorMessage != null) ...<Widget>[
          _ErrorBanner(message: errorMessage),
          const SizedBox(height: 16),
        ],
        ContinueWithQuantMailButton(
          loading: loading,
          onPressed: loading ? null : _startSso,
        ),
        const SizedBox(height: 12),
        Text(
          'Secured with OAuth2 + PKCE via your QuantMail account',
          style: textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  /// Consent handoff view for [AuthConsentRequired]: explains the one-time
  /// browser approval and opens [AuthConsentRequired.authorizeUrl].
  Widget _buildConsentView(AuthConsentRequired state) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _buildBrandingHero(),
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
        ContinueWithQuantMailButton(
          loading: _openingBrowser,
          label: 'Continue in browser',
          onPressed: _openingBrowser
              ? null
              : () => _openConsentUrl(state.authorizeUrl),
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

/// Error banner for sign-in failures, announced to screen readers.
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

/// Brief splash while the auth provider is still bootstrapping.
class _BootstrappingView extends StatelessWidget {
  const _BootstrappingView();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 64),
      child: Center(
        child: Semantics(
          label: 'Loading sign-in state',
          child: CircularProgressIndicator(),
        ),
      ),
    );
  }
}

/// Fallback when the auth provider itself fails (AsyncError branch).
class _ProviderErrorView extends StatelessWidget {
  const _ProviderErrorView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(Icons.cloud_off_outlined, size: 48, color: scheme.error),
          const SizedBox(height: 16),
          Text('Something went wrong', style: textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            'The sign-in state could not be loaded.',
            style: textTheme.bodyMedium
                ?.copyWith(color: scheme.onSurfaceVariant),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
