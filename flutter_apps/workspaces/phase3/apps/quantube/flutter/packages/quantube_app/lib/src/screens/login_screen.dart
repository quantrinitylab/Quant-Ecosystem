// ============================================================================
// quantube_app - OAuth2+PKCE login screen (QuanTube, QuantMail SSO)
// ============================================================================
//
// Copy-adapt of phase1 `quant_app`'s login screen, re-branded for QuanTube:
//
// - Same SSO session backend: [authSessionProvider] from `quant_core`
//   (QuantMail SSO — the same identity signs into every app). The notifier's
//   public methods are the only auth entry points; no fake auth anywhere.
// - Per [AuthSessionState]:
//     AuthInitial / AuthFailure -> email + password form (+ error banner)
//     AuthLoading               -> form with disabled fields, spinner
//     AuthTwoFactorRequired     -> 6-digit TOTP screen
//     AuthConsentRequired       -> system-browser consent handoff card
//     AuthAuthenticated         -> nothing (router redirect owns the hop)
// - The big CTA reads "Continue with QuantMail" — it signs the user in with
//   their QuantMail account (same SSO session as the mail app).
//
// Naming note (board QA): `quant_core`'s auth-exception constructors are
// POSITIONAL (e.g. `AuthFailure(this.message)`,
// `AuthConsentRequired(this.authorizeUrl)`, `AuthTwoFactorRequired(this.challenge)`).
// This file only *reads* those fields (never constructs them with named
// args), so nothing here can break on that contract.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantube_core/quantube_core.dart';

import '../auth/browser_launcher.dart';
import '../widgets/auth_fields.dart';

/// QuanTube sign-in screen: the OAuth2+PKCE entry point.
///
/// Renders per [AuthSessionState]. On narrow screens the form is full-width;
/// on wide screens (>= 640 logical px) it sits in a centered card, max
/// 420 px wide. QuanTube dark theme with the red accent comes from the
/// ambient [Theme] (wired in `src/app.dart` via `quantube_core`).
class LoginScreen extends ConsumerStatefulWidget {
  /// Creates the login screen.
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final GlobalKey<FormState> _totpFormKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _totpController = TextEditingController();

  /// Local view override: the Back button on the TOTP screen returns to the
  /// sign-in form without touching the provider (there is no reset method;
  /// the next login attempt overwrites the state).
  bool _showTotpView = true;

  /// Spinner on the Verify button while the notifier processes the TOTP.
  bool _verifyingTotp = false;

  /// Spinner on the consent button while the OS browser opens.
  bool _openingBrowser = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _totpController.dispose();
    super.dispose();
  }

  /// Submits the email + password form to the auth notifier ("Continue with
  /// QuantMail": the QuantMail SSO backend authenticates and upgrades to
  /// OAuth tokens via PKCE).
  Future<void> _submitLogin() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    await ref.read(authSessionProvider.notifier).login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
  }

  /// Submits the 6-digit TOTP code to the auth notifier.
  Future<void> _submitTotp() async {
    FocusScope.of(context).unfocus();
    if (!(_totpFormKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _verifyingTotp = true);
    await ref.read(authSessionProvider.notifier).submitTotp(
          _totpController.text.trim(),
        );
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
    ref.listen<AsyncValue<AuthSessionState>>(
      authSessionProvider,
      (
        AsyncValue<AuthSessionState>? previous,
        AsyncValue<AuthSessionState> next,
      ) {
        final AuthSessionState? prevState = previous?.valueOrNull;
        final AuthSessionState? nextState = next.valueOrNull;
        if (nextState is AuthTwoFactorRequired &&
            prevState is! AuthTwoFactorRequired) {
          // Freshly entered 2FA: show the TOTP screen, clear the spinner.
          setState(() {
            _showTotpView = true;
            _verifyingTotp = false;
          });
        } else if (prevState is AuthTwoFactorRequired &&
            nextState is! AuthTwoFactorRequired) {
          // Left 2FA (verified / failed / consent): stop the spinner.
          setState(() => _verifyingTotp = false);
        }
      },
    );

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
                    loading: () => const _BootstrappingView(),
                    error: (Object error, StackTrace stackTrace) =>
                        _ProviderErrorView(
                      onRetry: () => ref.invalidate(authSessionProvider),
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
  Widget _buildStateBody(AuthSessionState state) {
    return switch (state) {
      AuthAuthenticated() =>
        // The router redirect owns the hop to /home; render nothing.
        const SizedBox.shrink(),
      AuthConsentRequired() => _buildConsentView(state),
      AuthTwoFactorRequired() =>
        _showTotpView ? _buildTotpView() : _buildSignInForm(),
      AuthFailure() => _buildSignInForm(errorMessage: state.message),
      AuthLoading() => _buildSignInForm(loading: true),
      AuthInitial() => _buildSignInForm(),
    };
  }

  /// QuanTube branding header shared by the sign-in and consent views.
  ///
  /// Play-button logo + QuanTube wordmark in the red accent
  /// (`QuantAppColors.quantube`, `#F43F5E`), with the QuantMail SSO subtitle.
  Widget _buildBrandingHeader() {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Semantics(
          label: 'QuanTube logo',
          image: true,
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: scheme.primary,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(
              Icons.play_arrow_rounded,
              size: 48,
              color: scheme.onPrimary,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Semantics(
          header: true,
          child: Text('QuanTube', style: textTheme.headlineMedium),
        ),
        const SizedBox(height: 4),
        Text(
          'Sign in with your QuantMail account',
          style: textTheme.bodyMedium
              ?.copyWith(color: scheme.onSurfaceVariant),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  /// Email + password form. [errorMessage] renders an error banner (from
  /// [AuthFailure]); [loading] disables the fields and spins the button.
  /// The primary CTA is "Continue with QuantMail" — one SSO identity across
  /// the Quant ecosystem.
  Widget _buildSignInForm({String? errorMessage, bool loading = false}) {
    final ThemeData theme = Theme.of(context);
    final TextTheme textTheme = theme.textTheme;
    return AutofillGroup(
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            _buildBrandingHeader(),
            const SizedBox(height: 32),
            if (errorMessage != null) ...<Widget>[
              _ErrorBanner(message: errorMessage),
              const SizedBox(height: 16),
            ],
            AuthEmailField(
              controller: _emailController,
              enabled: !loading,
              autofocus: true,
              onFieldSubmitted: (_) => _submitLogin(),
            ),
            const SizedBox(height: 12),
            AuthPasswordField(
              controller: _passwordController,
              enabled: !loading,
              onFieldSubmitted: (_) => _submitLogin(),
            ),
            const SizedBox(height: 24),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: loading ? null : _submitLogin,
                child: loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Continue with QuantMail'),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Secured with OAuth2 + PKCE',
              style: textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  /// 6-digit TOTP view for [AuthTwoFactorRequired].
  Widget _buildTotpView() {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Form(
      key: _totpFormKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              'Two-step verification',
              style: textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Enter the 6-digit code from your authenticator app.',
            style: textTheme.bodyMedium
                ?.copyWith(color: scheme.onSurfaceVariant),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          AuthTotpField(
            controller: _totpController,
            enabled: !_verifyingTotp,
            autofocus: true,
            onFieldSubmitted: (_) => _submitTotp(),
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _verifyingTotp ? null : _submitTotp,
              child: _verifyingTotp
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Verify'),
            ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _verifyingTotp
                ? null : () => setState(() => _showTotpView = false),
            child: const Text('Back'),
          ),
        ],
      ),
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
