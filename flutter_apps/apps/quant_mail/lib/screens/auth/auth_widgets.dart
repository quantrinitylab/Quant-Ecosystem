// QuantWorkplace - shared pieces of the auth screens (register, forgot
// password, reset). Same look as quant_login_screen.dart: Obsidian background,
// card, 14 px field radius, orange gradient button.

import 'package:flutter/material.dart';

const Color kAuthOrange = Color(0xFFFF7A00);
const Color kAuthMuted = Color(0xFF94A3B8);
const Color kAuthLabel = Color(0xFFCBD5E1);
const Color kAuthError = Color(0xFFF87171);
const Color kAuthSuccess = Color(0xFF22C55E);

/// Page frame: dark background, ambient glows, logo lockup, centred card that
/// scrolls when the keyboard is open.
class AuthScaffold extends StatelessWidget {
  final Widget child;
  final bool showBack;

  const AuthScaffold({super.key, required this.child, this.showBack = true});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Scaffold(
      backgroundColor: const Color(0xFF040508),
      body: Stack(
        children: [
          Positioned(
            top: -80,
            left: size.width * 0.2,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [kAuthOrange.withOpacity(0.12), Colors.transparent]),
              ),
            ),
          ),
          Positioned(
            bottom: -60,
            right: -40,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [kAuthSuccess.withOpacity(0.08), Colors.transparent]),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: kAuthOrange.withOpacity(0.35), blurRadius: 24, spreadRadius: 1)],
                        ),
                        child: Image.asset('assets/gargantua_master.png', fit: BoxFit.contain),
                      ),
                      const SizedBox(height: 12),
                      Image.asset('assets/quantworkplace_cursive_badge.png', height: 34, fit: BoxFit.contain),
                      const SizedBox(height: 22),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0A0C13).withOpacity(0.95),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: const Color(0xFF1E2230), width: 1.2),
                          boxShadow: [
                            BoxShadow(color: Colors.black.withOpacity(0.6), blurRadius: 32, offset: const Offset(0, 16)),
                          ],
                        ),
                        child: child,
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (showBack)
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: IconButton(
                  tooltip: 'Back',
                  icon: const Icon(Icons.arrow_back_rounded, color: kAuthMuted),
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class AuthHeading extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String subtitle;

  const AuthHeading({super.key, required this.eyebrow, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow.toUpperCase(),
          style: const TextStyle(color: kAuthOrange, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 2),
        ),
        const SizedBox(height: 10),
        Text(
          title,
          style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.5),
        ),
        const SizedBox(height: 6),
        Text(subtitle, style: const TextStyle(color: kAuthMuted, fontSize: 13, height: 1.4)),
        const SizedBox(height: 20),
      ],
    );
  }
}

class AuthLabel extends StatelessWidget {
  final String text;
  const AuthLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(color: kAuthLabel, fontSize: 13, fontWeight: FontWeight.w600)),
      );
}

/// Rounded field shell (14 px radius, red border on error) around a TextField
/// plus an optional trailing widget (suffix text, show/hide button).
class AuthFieldBox extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final bool hasError;
  final bool obscure;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Widget? trailing;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String>? autofillHints;
  final bool enabled;
  final Key? fieldKey;

  const AuthFieldBox({
    super.key,
    required this.controller,
    required this.hint,
    this.hasError = false,
    this.obscure = false,
    this.keyboardType,
    this.textInputAction,
    this.trailing,
    this.onChanged,
    this.onSubmitted,
    this.autofillHints,
    this.enabled = true,
    this.fieldKey,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF111420),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: hasError ? const Color(0xFFEF4444) : const Color(0xFF222838), width: 1.2),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              key: fieldKey,
              controller: controller,
              enabled: enabled,
              obscureText: obscure,
              keyboardType: keyboardType,
              textInputAction: textInputAction,
              onChanged: onChanged,
              onSubmitted: onSubmitted,
              autofillHints: autofillHints,
              autocorrect: false,
              enableSuggestions: !obscure,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                hintText: hint,
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.25), fontSize: 14),
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class AuthHelpText extends StatelessWidget {
  final String text;
  final bool isError;
  final bool isSuccess;
  const AuthHelpText(this.text, {super.key, this.isError = false, this.isSuccess = false});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(
          text,
          style: TextStyle(
            color: isError ? kAuthError : (isSuccess ? kAuthSuccess : const Color(0xFF64748B)),
            fontSize: 11.5,
            height: 1.35,
          ),
        ),
      );
}

class AuthBanner extends StatelessWidget {
  final String message;
  final bool isSuccess;
  const AuthBanner(this.message, {super.key, this.isSuccess = false});

  @override
  Widget build(BuildContext context) {
    final color = isSuccess ? kAuthSuccess : const Color(0xFFEF4444);
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(isSuccess ? Icons.check_circle_outline_rounded : Icons.error_outline_rounded,
              color: isSuccess ? kAuthSuccess : kAuthError, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: isSuccess ? const Color(0xFF86EFAC) : const Color(0xFFFCA5A5),
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AuthPrimaryButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback? onPressed;
  const AuthPrimaryButton({super.key, required this.label, required this.loading, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final disabled = loading || onPressed == null;
    return Opacity(
      opacity: disabled && !loading ? 0.6 : 1,
      child: Container(
        width: double.infinity,
        height: 48,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: const LinearGradient(
            colors: [Color(0xFFFF7A00), Color(0xFFFF9E40)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          boxShadow: [BoxShadow(color: kAuthOrange.withOpacity(0.35), blurRadius: 18, offset: const Offset(0, 4))],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: loading ? null : onPressed,
            borderRadius: BorderRadius.circular(14),
            child: Center(
              child: loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : Text(label,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
            ),
          ),
        ),
      ),
    );
  }
}

class AuthTextLink extends StatelessWidget {
  final String prefix;
  final String link;
  final VoidCallback onTap;
  const AuthTextLink({super.key, required this.prefix, required this.link, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (prefix.isNotEmpty) Text('$prefix ', style: const TextStyle(color: kAuthMuted, fontSize: 13)),
          InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
              child: Text(link,
                  style: const TextStyle(
                    color: kAuthOrange,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    decoration: TextDecoration.underline,
                    decorationColor: kAuthOrange,
                  )),
            ),
          ),
        ],
      ),
    );
  }
}

class AuthShowHideButton extends StatelessWidget {
  final bool shown;
  final VoidCallback onTap;
  const AuthShowHideButton({super.key, required this.shown, required this.onTap});

  @override
  Widget build(BuildContext context) => IconButton(
        onPressed: onTap,
        tooltip: shown ? 'Hide passwords' : 'Show passwords',
        icon: Icon(shown ? Icons.visibility_off_rounded : Icons.visibility_rounded,
            color: const Color(0xFF64748B), size: 20),
      );
}
