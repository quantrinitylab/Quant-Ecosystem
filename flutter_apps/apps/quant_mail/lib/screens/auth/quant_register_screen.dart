// QuantWorkplace - Create account screen. Mirrors the website's /register:
// handle (+ fixed @quantmail.in), password, confirm password, terms.
// After success it returns the new address to the login screen (the website
// also sends the user to sign in; no session is created here).

import 'package:flutter/material.dart';
import '../../services/quant_account_service.dart';
import 'auth_widgets.dart';

class QuantRegisterScreen extends StatefulWidget {
  final QuantAccountService? service;
  const QuantRegisterScreen({super.key, this.service});

  @override
  State<QuantRegisterScreen> createState() => _QuantRegisterScreenState();
}

class _QuantRegisterScreenState extends State<QuantRegisterScreen> {
  final _handle = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  bool _show = false;
  bool _terms = false;
  bool _submitting = false;
  bool _attempted = false;
  String? _banner;
  String? _handleServerError;
  String? _passwordServerError;

  QuantAccountService get _service => widget.service ?? QuantAccountService.instance;

  @override
  void dispose() {
    _handle.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? get _handleError {
    if (_handleServerError != null) return _handleServerError;
    if (_handle.text.isEmpty && !_attempted) return null;
    return QuantAccountRules.handleError(_handle.text);
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

  String? get _termsError =>
      _attempted && !_terms ? 'Acknowledge the required terms to continue.' : null;

  bool get _valid =>
      QuantAccountRules.handleError(_handle.text) == null &&
      QuantAccountRules.passwordError(_password.text) == null &&
      QuantAccountRules.confirmError(_password.text, _confirm.text) == null &&
      _terms;

  void _edited([String _ = '']) => setState(() {
        _handleServerError = null;
        _passwordServerError = null;
      });

  Future<void> _submit() async {
    // Synchronous guard first: a fast double tap must send exactly one request.
    if (_submitting) return;
    setState(() {
      _attempted = true;
      _banner = null;
    });
    if (!_valid) return;

    setState(() => _submitting = true);
    final handle = QuantAccountRules.normalizeHandle(_handle.text);
    final result = await _service.register(
      handle: handle,
      password: _password.text,
      acceptTerms: _terms,
    );
    if (!mounted) return;

    if (result.ok) {
      Navigator.of(context).pop(QuantAccountRules.addressFor(handle));
      return;
    }
    setState(() {
      _submitting = false;
      switch (result.failure) {
        case AccountFailure.handleTaken:
          _handleServerError = 'That handle is already taken. Try another one.';
          _banner = result.message;
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
    final handle = QuantAccountRules.normalizeHandle(_handle.text);
    return AuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AuthHeading(
            eyebrow: 'New account',
            title: 'Create your QuantMail address',
            subtitle: 'Pick the handle for your QuantMail address.',
          ),
          if (_banner != null) AuthBanner(_banner!),
          const AuthLabel('Account handle'),
          AuthFieldBox(
            fieldKey: const Key('register-handle'),
            controller: _handle,
            hint: 'yourname',
            hasError: _handleError != null,
            enabled: !_submitting,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            onChanged: _edited,
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: const BoxDecoration(
                color: Color(0xFF0D101A),
                border: Border(left: BorderSide(color: Color(0xFF222838))),
                borderRadius: BorderRadius.only(topRight: Radius.circular(14), bottomRight: Radius.circular(14)),
              ),
              child: const Text('@$kQuantMailDomain', style: TextStyle(color: kAuthMuted, fontSize: 12)),
            ),
          ),
          if (_handleError != null)
            AuthHelpText(_handleError!, isError: true)
          else
            AuthHelpText(handle.isNotEmpty
                ? 'Your address will be ${QuantAccountRules.addressFor(handle)}'
                : '3-30 characters: lowercase letters, numbers, dots, dashes, underscores.'),
          const SizedBox(height: 16),
          const AuthLabel('Password'),
          AuthFieldBox(
            fieldKey: const Key('register-password'),
            controller: _password,
            hint: 'Choose a password',
            hasError: _passwordError != null,
            obscure: !_show,
            enabled: !_submitting,
            textInputAction: TextInputAction.next,
            onChanged: _edited,
            trailing: AuthShowHideButton(shown: _show, onTap: () => setState(() => _show = !_show)),
          ),
          AuthHelpText(_passwordError ?? 'Use $kMinPasswordLength or more characters.', isError: _passwordError != null),
          const SizedBox(height: 16),
          const AuthLabel('Confirm password'),
          AuthFieldBox(
            fieldKey: const Key('register-confirm'),
            controller: _confirm,
            hint: 'Re-enter your password',
            hasError: _confirmError != null,
            obscure: !_show,
            enabled: !_submitting,
            textInputAction: TextInputAction.done,
            onChanged: _edited,
            onSubmitted: (_) => _submit(),
          ),
          if (_confirmError != null)
            AuthHelpText(_confirmError!, isError: true)
          else if (_confirm.text.isNotEmpty && _confirm.text == _password.text)
            const AuthHelpText('Passwords match', isSuccess: true),
          const SizedBox(height: 12),
          InkWell(
            key: const Key('register-terms'),
            borderRadius: BorderRadius.circular(8),
            onTap: _submitting ? null : () => setState(() => _terms = !_terms),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: Checkbox(
                      value: _terms,
                      onChanged: _submitting ? null : (v) => setState(() => _terms = v ?? false),
                      activeColor: kAuthOrange,
                      side: const BorderSide(color: Color(0xFF3A4254), width: 1.4),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text.rich(
                        TextSpan(
                          style: TextStyle(color: kAuthMuted, fontSize: 12, height: 1.45),
                          children: [
                            TextSpan(text: 'I acknowledge the '),
                            TextSpan(
                              text: 'terms',
                              style: TextStyle(
                                  color: kAuthOrange, fontWeight: FontWeight.w600, decoration: TextDecoration.underline),
                            ),
                            TextSpan(text: ' required to create an account.'),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_termsError != null) AuthHelpText(_termsError!, isError: true),
          const SizedBox(height: 16),
          AuthPrimaryButton(
            label: 'Create QuantMail account',
            loading: _submitting,
            onPressed: _submit,
          ),
          const SizedBox(height: 10),
          AuthTextLink(
            prefix: 'Already have an account?',
            link: 'Sign in',
            onTap: () => Navigator.of(context).maybePop(),
          ),
        ],
      ),
    );
  }
}
