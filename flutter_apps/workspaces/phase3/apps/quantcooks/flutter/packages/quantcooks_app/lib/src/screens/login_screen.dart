// ============================================================================
// quantcooks_app - OAuth2+PKCE SSO login screen (Phase 3b, Shift 1)
// ============================================================================
//
// QuantCooks is SSO-only: one "Sign in with Quant" button starts the Quant
// SSO PKCE flow through the auth notifier owned by W3 (from
// `quantcooks_core`, conceptually mirroring quant_app's auth contract):
//
//   CooksAuthInitial / CooksAuthFailure -> branded SSO button (+ error banner)
//   CooksAuthLoading                    -> button with spinner
//   CooksAuthConsentRequired             -> system-browser consent handoff card
//   CooksAuthAuthenticated               -> nothing (the router redirect owns
//                                           the hop to /)
//
// No fake auth anywhere: the button calls the real auth-notifier method.
// The theme comes from the ambient [Theme] (CooksTheme is wired in
// `src/app.dart`).
//
// The auth API contract is delivered: `cooksAuthSessionProvider` with
// `startSsoLogin()` / `completeOAuthCallback()` (see quantcooks_core's
// auth providers). No endpoints or client identifiers are invented here;
// the OAuth client_id is still a TODO(UNVERIFIED) placeholder in
// `CooksConfig` until backend provisioning.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantcooks_core/quantcooks_core.dart';

import '../auth/browser_launcher.dart';

/// Sign-in screen: the Quant SSO (OAuth2+PKCE) entry point for QuantCooks.
///
/// Renders per [CooksAuthSessionState]. On narrow screens the content is
/// full-width; on wide screens (>= 640 logical px) it sits in a centered
/// card, max 420 px wide.
class LoginScreen extends ConsumerStatefulWidget {
  /// Creates the login screen.
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  /// Spinner on the SSO button while the notifier starts the flow.
  bool _startingSso = false;

  /// Spinner on the consent button while the OS browser opens.
  bool _openingBrowser = false;

  /// Starts the Quant SSO login via the auth notifier.
  Future<void> _startSso() async {
    setState(() => _startingSso = true);
    try {
      // Contract-verified against W3's notifier API (`startSsoLogin`).
      await ref.read(cooksAuthSessionProvider.notifier).startSsoLogin();
    } finally {
      if (mounted) {
        setState(() => _startingSso = false);
      }
    }
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
    final AsyncValue<CooksAuthSessionState> session =
        ref.watch(cooksAuthSessionProvider);

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
                    loading: () => const _BootstrappingView(),
                    error: (Object error, StackTrace stackTrace) =>
                        _ProviderErrorView(
                      onRetry: () => ref.invalidate(cooksAuthSessionProvider),
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

  /// Maps the auth session data state to its view.
  Widget _buildStateBody(CooksAuthSessionState state) {
    return switch (state) {
      CooksAuthAuthenticated() =>
        // The router redirect owns the hop to /; render nothing.
        const SizedBox.shrink(),
      CooksAuthConsentRequired() => _buildConsentView(state),
      // TOTP challenge pending (2FA): placeholder until the TOTP entry
      // form lands (W2 owns 2FA UI).
      CooksAuthTwoFactorRequired() => const _TwoFactorPlaceholderView(),
      CooksAuthFailure() => _buildSignIn(errorMessage: state.message),
      CooksAuthLoading() => _buildSignIn(loading: true),
      CooksAuthInitial() => _buildSignIn(),
    };
  }

  /// QuantCooks branding header: creator/editor identity, dark-first.
  Widget _buildBrandingHeader() {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Semantics(
          label: 'QuantCooks logo',
          image: true,
          child: Icon(
            Icons.movie_creation_outlined,
            size: 56,
            color: scheme.primary,
          ),
        ),
        const SizedBox(height: 16),
        Semantics(
          header: true,
          child: Text('QuantCooks', style: textTheme.headlineMedium),
        ),
        const SizedBox(height: 4),
        Text(
          'Create. Edit. Share.',
          style: textTheme.bodyMedium
              ?.copyWith(color: scheme.onSurfaceVariant),
        ),
      ],
    );
  }

  /// SSO sign-in view. [errorMessage] renders an error banner (from
  /// [CooksAuthFailure]); [loading] spins the button.
  Widget _buildSignIn({String? errorMessage, bool loading = false}) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final bool busy = loading || _startingSso;
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
          height: 48,
          child: ElevatedButton(
            onPressed: busy ? null : _startSso,
            child: busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Sign in with Quant'),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Secured with OAuth2 + PKCE',
          style: textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  /// Consent handoff view for [CooksAuthConsentRequired]: explains the
  /// one-time browser approval and opens [CooksAuthConsentRequired.authorizeUrl].
  Widget _buildConsentView(CooksAuthConsentRequired state) {
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
                  'Continue dabane par Quant ka consent page khulega.',
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
                : () => _openConsentUrl(state.authorizeUrl),
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

/// Placeholder for the TOTP challenge entry view (2FA). W2 owns the real
/// form that calls `submitTotp` on the session notifier; this keeps the
/// sealed-state switch exhaustive in the meantime.
class _TwoFactorPlaceholderView extends StatelessWidget {
  const _TwoFactorPlaceholderView();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 64),
      child: Center(
        child: Text(
          'Two-factor authentication — code entry coming soon',
          textAlign: TextAlign.center,
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 64),
      child: Center(
        child: Semantics(
          label: 'Loading sign-in state',
          child: const CircularProgressIndicator(),
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
