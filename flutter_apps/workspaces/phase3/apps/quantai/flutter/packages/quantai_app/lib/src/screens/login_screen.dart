// ============================================================================
// quantai_app - OAuth2+PKCE login screen, QuantMail SSO (Shift 1)
// ============================================================================
//
// Pattern adapted from quant_app's login screen (Phase 1, M2); driven by
// [authSessionProvider] from quantai_core (W1's auth contract, used
// verbatim — positional sealed constructors only):
//
//   AuthInitial / AuthFailure -> email + password form (+ error banner)
//   AuthLoading               -> form with disabled fields, spinner on button
//   AuthTwoFactorRequired     -> 6-digit TOTP screen
//   AuthConsentRequired       -> system-browser consent handoff card
//   AuthAuthenticated         -> nothing (the router redirect owns the hop)
//
// D1: QuantAI invents no new auth endpoint — this is the existing QuantMail
// OAuth2+PKCE flow. No fake auth anywhere: the buttons call the real
// [AuthSessionNotifier] methods. The theme comes from the ambient [Theme]
// ([QuantAiTheme] is wired in `src/app.dart`).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';
import 'package:quantai_core/quantai_core.dart';

import '../auth/browser_launcher.dart';
import '../widgets/auth_fields.dart';

/// Sign-in screen: the OAuth2+PKCE entry point, via the user's QuantMail
/// account (QuantMail SSO).
///
/// Renders per [AuthSessionState]. On narrow screens the form is full-width;
/// on wide screens (>= 640 logical px) it sits in a centered card, max
/// 420 px wide.
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

  ProviderSubscription<AsyncValue<AuthSessionState>>? _sessionSubscription;

  @override
  void initState() {
    super.initState();
    // Phase-1 lesson: keep the state->view wiring in initState rather than
    // re-subscribing inside build.
    _sessionSubscription = ref.listenManual<AsyncValue<AuthSessionState>>(
      authSessionProvider,
      (
        AsyncValue<AuthSessionState>? previous,
        AsyncValue<AuthSessionState> next,
      ) {
        final AuthSessionState? prevState = previous?.valueOrNull;
        final AuthSessionState? nextState = next.valueOrNull;
        if (!mounted) {
          return;
        }
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
  }

  @override
  void dispose() {
    _sessionSubscription?.close();
    _emailController.dispose();
    _passwordController.dispose();
    _totpController.dispose();
    super.dispose();
  }

  /// Submits the email + password form to the auth notifier.
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
    await ref
        .read(authSessionProvider.notifier)
        .submitTotp(_totpController.text.trim());
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

  /// QuantAI branding header shared by the sign-in and consent views.
  Widget _buildBrandingHeader() {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Semantics(
          label: 'QuantAI logo',
          image: true,
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: <Color>[
                  scheme.primary,
                  QuantAiTheme.identityViolet,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: const BorderRadius.all(Radius.circular(20)),
            ),
            child: const Icon(
              Icons.auto_awesome,
              size: 36,
              color: scheme.onPrimary,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Semantics(
          header: true,
          child: Text('QuantAI', style: textTheme.headlineMedium),
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

  /// Email + password form. [errorMessage] renders an error banner (from
  /// [AuthFailure]); [loading] disables the fields and spins the button.
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
                    : const Text('Sign in'),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Secured with QuantMail OAuth2 + PKCE',
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
            style:
                textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
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
            onPressed:
                _verifyingTotp ? null : () => setState(() => _showTotpView = false),
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
                    'Browser me QuantAI consent approve karo',
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
            onPressed:
                _openingBrowser ? null : () => _openConsentUrl(state.authorizeUrl),
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
          style:
              textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
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
            Icon(Icons.error_outline,
                color: scheme.onErrorContainer, size: 20),
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
            style:
                textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
