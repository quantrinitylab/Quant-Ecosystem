// ============================================================================
// quantmax_app - shared auth widgets (Phase 3b, Shift 1)
// ============================================================================
//
// Copy-adapted from phase1 quant_app's `src/widgets/auth_fields.dart`
// (read-only pattern — not edited). Styled for the QuantMax dark,
// feed-forward brand; they read the ambient [Theme], so W2's design-token
// theme applies automatically once it lands.
//
// Provided: [AuthEmailField], [AuthPasswordField] (visibility toggle) and
// [ContinueWithQuantMailButton] (the D1 SSO entry point). Validation rules
// live on the fields themselves so future screens cannot drift apart.
//
// NOTE: the QuantMax login screen is SSO-only this shift (no TOTP view —
// the QuantMail SSO browser flow handles second factors server-side), so
// [AuthTotpField] is intentionally NOT included. If the email/password
// flow ever gains 2FA, copy-adapt the phase1 TOTP field.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Email address field for the QuantMax auth forms.
///
/// Keyboard, autofill hints and validation are tuned for email entry.
class AuthEmailField extends StatelessWidget {
  /// Creates an email field bound to [controller].
  const AuthEmailField({
    super.key,
    required this.controller,
    this.enabled = true,
    this.autofocus = false,
    this.onFieldSubmitted,
  });

  /// Controller for the entered email address.
  final TextEditingController controller;

  /// Whether the field accepts input.
  final bool enabled;

  /// Whether the field grabs focus when first built.
  final bool autofocus;

  /// Called when the user submits from the keyboard.
  final ValueChanged<String>? onFieldSubmitted;

  /// Validates an email value: non-empty and containing `@`.
  static String? validate(String? value) {
    final String email = (value ?? '').trim();
    if (email.isEmpty) {
      return 'Email address is required';
    }
    if (!email.contains('@')) {
      return 'Enter a valid email address';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Email address',
      textField: true,
      child: TextFormField(
        controller: controller,
        enabled: enabled,
        autofocus: autofocus,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const <String>[AutofillHints.email],
        textInputAction: TextInputAction.next,
        autocorrect: false,
        enableSuggestions: false,
        decoration: const InputDecoration(
          labelText: 'Email',
          hintText: 'you@example.com',
          prefixIcon: Icon(Icons.alternate_email_outlined),
        ),
        validator: validate,
        onFieldSubmitted: onFieldSubmitted,
      ),
    );
  }
}

/// Password field for the QuantMax auth forms.
///
/// Obscured by default with an accessible visibility toggle.
class AuthPasswordField extends StatefulWidget {
  /// Creates a password field bound to [controller].
  const AuthPasswordField({
    super.key,
    required this.controller,
    this.enabled = true,
    this.onFieldSubmitted,
  });

  /// Controller for the entered password.
  final TextEditingController controller;

  /// Whether the field accepts input.
  final bool enabled;

  /// Called when the user submits from the keyboard.
  final ValueChanged<String>? onFieldSubmitted;

  /// Validates a password value: non-empty.
  static String? validate(String? value) {
    if ((value ?? '').isEmpty) {
      return 'Password is required';
    }
    return null;
  }

  @override
  State<AuthPasswordField> createState() => _AuthPasswordFieldState();
}

class _AuthPasswordFieldState extends State<AuthPasswordField> {
  bool _obscured = true;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Password',
      textField: true,
      child: TextFormField(
        controller: widget.controller,
        enabled: widget.enabled,
        obscureText: _obscured,
        keyboardType: TextInputType.visiblePassword,
        autofillHints: const <String>[AutofillHints.password],
        textInputAction: TextInputAction.done,
        autocorrect: false,
        enableSuggestions: false,
        decoration: InputDecoration(
          labelText: 'Password',
          prefixIcon: const Icon(Icons.lock_outline),
          suffixIcon: Semantics(
            button: true,
            label: _obscured ? 'Show password' : 'Hide password',
            child: IconButton(
              icon: Icon(
                _obscured
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
              onPressed: widget.enabled
                  ? () => setState(() => _obscured = !_obscured)
                  : null,
            ),
          ),
        ),
        validator: AuthPasswordField.validate,
        onFieldSubmitted: widget.onFieldSubmitted,
      ),
    );
  }
}

/// The D1 sign-in entry: "Continue with QuantMail" OAuth2+PKCE button.
///
/// QuantMax-branded: filled with the theme's primary color, QuantMail glyph
/// prefix, and a spinner when the SSO flow is starting. The parent screen
/// owns the actual flow (it calls `QuantMaxAuthSessionNotifier.startBrowserSignIn()`).
/// [label] allows rewording for the consent step ("Continue in browser").
class ContinueWithQuantMailButton extends StatelessWidget {
  /// Creates the SSO button.
  const ContinueWithQuantMailButton({
    super.key,
    required this.onPressed,
    this.loading = false,
    this.label = 'Continue with QuantMail',
  });

  /// Called when the user taps the button. `null` disables it.
  final VoidCallback? onPressed;

  /// Whether the SSO flow is starting (spinner on the button).
  final bool loading;

  /// Button text; defaults to the D1 SSO wording.
  final String label;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ElevatedButton.icon(
        onPressed: loading ? null : onPressed,
        icon: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.mark_email_read_outlined),
        label: Text(label),
      ),
    );
  }
}
