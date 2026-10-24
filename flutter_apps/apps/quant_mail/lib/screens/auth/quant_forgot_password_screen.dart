// QuantWorkplace - Forgot password + reset screens. Mirrors the website:
// /forgot-password sends a reset link to the account's email (generic answer),
// /reset-password?token=... sets the new password. The app cannot receive the
// emailed link directly, so the user pastes the link (or token) here.

import 'package:flutter/material.dart';
import '../../services/quant_account_service.dart';
import 'auth_widgets.dart';

class QuantForgotPasswordScreen extends StatefulWidget {
  final QuantAccountService? service;
  const QuantForgotPasswordScreen({super.key, this.service});

  @override
  State<QuantForgotPasswordScreen> createState() => _QuantForgotPasswordScreenState();
}

class _QuantForgotPasswordScreenState extends State<QuantForgotPasswordScreen> {
  final _email = TextEditingController();
  bool _submitting = false;
  bool _sent = false;
  String? _fieldError;
  String? _banner;

  QuantAccountService get _service => widget.service ?? QuantAccountService.instance;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final address = _email.text.trim();
    setState(() {
      _fieldError = address.isEmpty ? 'Enter your QuantMail address.' : null;
      _banner = null;
    });
    if (address.isEmpty) return;

    setState(() => _submitting = true);
    final result = await _service.requestPasswordReset(address);
    if (!mounted) return;

    // Like the website: only a network failure is shown. Any answer from the
    // backend leads to the same generic "check your email" state, so the app
    // never reveals whether an account exists.
    if (!result.ok && result.failure == AccountFailure.network) {
      setState(() {
        _submitting = false;
        _banner = result.message;
      });
      return;
    }
    if (!result.ok && result.failure == AccountFailure.rateLimited) {
      setState(() {
        _submitting = false;
        _banner = result.message;
      });
      return;
    }
    setState(() {
      _submitting = false;
      _sent = true;
    });
  }

  Future<void> _openReset() async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => QuantResetPasswordScreen(service: widget.service)),
    );
    if (done == true && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AuthHeading(
            eyebrow: 'Account recovery',
            title: 'Reset your password',
            subtitle: "Enter your full QuantMail address to request reset instructions. The link goes to the account's email.",
          ),
          if (_sent) ...[
            Container(
              key: const Key('forgot-sent'),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: kAuthSuccess.withOpacity(0.10),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: kAuthSuccess.withOpacity(0.3)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Check your email',
                      style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                  SizedBox(height: 8),
                  Text(
                    'If an eligible account matches that address, password reset instructions were sent to its email. '
                    'We do not confirm whether an account exists. The link works once and expires in 60 minutes.',
                    style: TextStyle(color: kAuthMuted, fontSize: 13, height: 1.45),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            AuthPrimaryButton(label: 'I have my reset link', loading: false, onPressed: _openReset),
            const SizedBox(height: 10),
            AuthTextLink(prefix: '', link: 'Return to sign in', onTap: () => Navigator.of(context).maybePop()),
          ] else ...[
            if (_banner != null) AuthBanner(_banner!),
            const AuthLabel('QuantMail address'),
            AuthFieldBox(
              fieldKey: const Key('forgot-email'),
              controller: _email,
              hint: 'you@$kQuantMailDomain',
              hasError: _fieldError != null,
              enabled: !_submitting,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.done,
              onChanged: (_) => setState(() => _fieldError = null),
              onSubmitted: (_) => _submit(),
            ),
            AuthHelpText(_fieldError ?? 'Use the full address associated with your account.',
                isError: _fieldError != null),
            const SizedBox(height: 20),
            AuthPrimaryButton(label: 'Request reset instructions', loading: _submitting, onPressed: _submit),
            const SizedBox(height: 10),
            AuthTextLink(prefix: 'Already have a reset link?', link: 'Enter it', onTap: _openReset),
            AuthTextLink(prefix: 'Remember your password?', link: 'Sign in', onTap: () => Navigator.of(context).maybePop()),
          ],
        ],
      ),
    );
  }
}

class QuantResetPasswordScreen extends StatefulWidget {
  final QuantAccountService? service;
  const QuantResetPasswordScreen({super.key, this.service});

  @override
  State<QuantResetPasswordScreen> createState() => _QuantResetPasswordScreenState();
}

class _QuantResetPasswordScreenState extends State<QuantResetPasswordScreen> {
  final _link = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _show = false;
  bool _submitting = false;
  bool _attempted = false;
  bool _done = false;
  String? _banner;
  String? _linkError;
  String? _passwordServerError;

  QuantAccountService get _service => widget.service ?? QuantAccountService.instance;

  @override
  void dispose() {
    _link.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? get _passwordError {
    if (_passwordServerError != null) return _passwordServerError;
    if (_password.text.isEmpty && !_attempted) return null;
    return QuantAccountRules.passwordError(_password.text);
  }

  String? get _confirmError {
    if (_confirm.text.isEmpty && !_attempted) return null;
    return QuantAccountRules.confirmError(_password.text, _confirm.text);
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final token = QuantAccountRules.extractResetToken(_link.text);
    setState(() {
      _attempted = true;
      _banner = null;
      _linkError = token == null ? 'Paste the reset link from your email.' : null;
    });
    if (token == null ||
        QuantAccountRules.passwordError(_password.text) != null ||
        QuantAccountRules.confirmError(_password.text, _confirm.text) != null) {
      return;
    }

    setState(() => _submitting = true);
    final result = await _service.confirmPasswordReset(token: token, newPassword: _password.text);
    if (!mounted) return;

    if (result.ok) {
      _password.clear();
      _confirm.clear();
      setState(() {
        _submitting = false;
        _done = true;
      });
      return;
    }
    setState(() {
      _submitting = false;
      switch (result.failure) {
        case AccountFailure.invalidLink:
          _linkError = '${result.message} Reset links work once. Request a new one.';
          break;
        case AccountFailure.weakPassword:
          _passwordServerError = result.message;
          break;
        default:
          _banner = result.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_done) {
      return AuthScaffold(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AuthHeading(
              eyebrow: 'Account recovery',
              title: 'Password updated',
              subtitle: 'Sign in with your new password. Every other session has been signed out.',
            ),
            const AuthBanner('Your password has been changed and the reset link is spent.', isSuccess: true),
            AuthPrimaryButton(
              label: 'Continue to sign in',
              loading: false,
              onPressed: () => Navigator.of(context).pop(true),
            ),
          ],
        ),
      );
    }
    return AuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AuthHeading(
            eyebrow: 'Account recovery',
            title: 'Set a new password',
            subtitle: 'Paste the link from the reset email, then choose a password of at least 8 characters.',
          ),
          if (_banner != null) AuthBanner(_banner!),
          const AuthLabel('Reset link'),
          AuthFieldBox(
            fieldKey: const Key('reset-link'),
            controller: _link,
            hint: 'https://quantmail.in/reset-password?token=...',
            hasError: _linkError != null,
            enabled: !_submitting,
            keyboardType: TextInputType.url,
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() => _linkError = null),
          ),
          if (_linkError != null) AuthHelpText(_linkError!, isError: true),
          const SizedBox(height: 16),
          const AuthLabel('New password'),
          AuthFieldBox(
            fieldKey: const Key('reset-password'),
            controller: _password,
            hint: 'At least 8 characters',
            hasError: _passwordError != null,
            obscure: !_show,
            enabled: !_submitting,
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() => _passwordServerError = null),
            trailing: AuthShowHideButton(shown: _show, onTap: () => setState(() => _show = !_show)),
          ),
          AuthHelpText(_passwordError ?? 'Length beats punctuation.', isError: _passwordError != null),
          const SizedBox(height: 16),
          const AuthLabel('Confirm new password'),
          AuthFieldBox(
            fieldKey: const Key('reset-confirm'),
            controller: _confirm,
            hint: 'Re-enter your new password',
            hasError: _confirmError != null,
            obscure: !_show,
            enabled: !_submitting,
            textInputAction: TextInputAction.done,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _submit(),
          ),
          if (_confirmError != null) AuthHelpText(_confirmError!, isError: true),
          const SizedBox(height: 20),
          AuthPrimaryButton(label: 'Set new password', loading: _submitting, onPressed: _submit),
          const SizedBox(height: 10),
          AuthTextLink(prefix: 'Remembered it?', link: 'Sign in', onTap: () => Navigator.of(context).maybePop()),
        ],
      ),
    );
  }
}
