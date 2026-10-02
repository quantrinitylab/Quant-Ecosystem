// ============================================================================
// ads_app - shared auth form fields (Shift 1)
// ============================================================================
//
// Copy-adapted from phase1 quant_app's `src/widgets/auth_fields.dart`
// (QuantMail → QuantAds, otherwise verbatim).
//
// Small, reusable form fields for the sign-in and two-factor screens:
// [AuthEmailField], [AuthPasswordField] (with a visibility toggle) and
// [AuthTotpField]. Validation rules live on the fields themselves so the
// login and TOTP screens cannot drift apart.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Email address field used on the sign-in form.
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

/// Password field used on the sign-in form.
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

/// 6-digit TOTP field used on the two-factor screen.
///
/// Numeric keyboard, digit-only input, and one-time-code autofill so the OS
/// can offer codes from SMS / authenticator apps.
class AuthTotpField extends StatelessWidget {
  /// Creates a TOTP field bound to [controller].
  const AuthTotpField({
    super.key,
    required this.controller,
    this.enabled = true,
    this.autofocus = false,
    this.onFieldSubmitted,
  });

  /// Controller for the entered code.
  final TextEditingController controller;

  /// Whether the field accepts input.
  final bool enabled;

  /// Whether the field grabs focus when first built.
  final bool autofocus;

  /// Called when the user submits from the keyboard.
  final ValueChanged<String>? onFieldSubmitted;

  /// Validates a TOTP value: exactly 6 digits.
  static String? validate(String? value) {
    final String code = (value ?? '').trim();
    if (code.isEmpty) {
      return 'Enter the 6-digit code';
    }
    if (code.length != 6 || int.tryParse(code) == null) {
      return 'Code must be 6 digits';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Semantics(
      label: 'Two-factor authentication code',
      textField: true,
      child: TextFormField(
        controller: controller,
        enabled: enabled,
        autofocus: autofocus,
        keyboardType: TextInputType.number,
        autofillHints: const <String>[AutofillHints.oneTimeCode],
        textInputAction: TextInputAction.done,
        maxLength: 6,
        inputFormatters: <TextInputFormatter>[
          FilteringTextInputFormatter.digitsOnly,
        ],
        textAlign: TextAlign.center,
        style: theme.textTheme.headlineSmall
            ?.copyWith(letterSpacing: 6, fontFeatures: const <FontFeature>[
          FontFeature.tabularFigures(),
        ]),
        decoration: const InputDecoration(
          labelText: '6-digit code',
          counterText: '',
          prefixIcon: Icon(Icons.key_outlined),
        ),
        validator: validate,
        onFieldSubmitted: onFieldSubmitted,
      ),
    );
  }
}
