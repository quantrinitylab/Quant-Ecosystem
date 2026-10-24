// Sovereign Quant Ecosystem - QuantWorkplace Sign-In Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath method invocations (120Hz Impeller & Skia safe).

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import '../../services/quant_auth_controller.dart';
import '../../features/shell/mail_shell.dart';
import 'auth_widgets.dart';
import 'quant_forgot_password_screen.dart';
import 'quant_register_screen.dart';

class QuantLoginScreen extends StatefulWidget {
  final VoidCallback? onAuthenticated;

  /// Why the user is here again, for example "Your session ended. Sign in again."
  final String? initialNotice;

  const QuantLoginScreen({
    super.key,
    this.onAuthenticated,
    this.initialNotice,
  });

  @override
  State<QuantLoginScreen> createState() => _QuantLoginScreenState();
}

class _QuantLoginScreenState extends State<QuantLoginScreen>
    with SingleTickerProviderStateMixin {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _codeController = TextEditingController();

  final FocusNode _emailFocus = FocusNode();
  final FocusNode _passwordFocus = FocusNode();
  final FocusNode _codeFocus = FocusNode();

  bool _showPassword = false;
  bool _isLoading = false;
  String? _errorMessage;
  String? _noticeMessage;
  String? _emailFieldError;
  String? _passwordFieldError;

  // 2FA state
  bool _isTwoFactor = false;
  bool _isBackupCodeMode = false;
  String _twoFactorChallenge = '';
  int _secondsLeft = 300;
  Timer? _countdownTimer;

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _noticeMessage = widget.initialNotice;
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2500),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.85, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _pulseController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _codeController.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  void _startCountdown(int seconds) {
    _countdownTimer?.cancel();
    setState(() => _secondsLeft = seconds);
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_secondsLeft <= 1) {
        timer.cancel();
        _backToCredentials('That sign-in attempt expired. Enter your password again.');
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  void _backToCredentials([String? message]) {
    _countdownTimer?.cancel();
    setState(() {
      _isTwoFactor = false;
      _isBackupCodeMode = false;
      _twoFactorChallenge = '';
      _codeController.clear();
      _errorMessage = message;
    });
  }

  String _formatCountdown(int seconds) {
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _handleLogin() async {
    setState(() {
      _errorMessage = null;
      _emailFieldError = null;
      _passwordFieldError = null;
    });

    final rawEmail = _emailController.text.trim();
    final rawPassword = _passwordController.text;

    if (rawEmail.isEmpty) {
      setState(() => _emailFieldError = 'Enter your email address.');
      _emailFocus.requestFocus();
      return;
    }
    if (rawPassword.isEmpty) {
      setState(() => _passwordFieldError = 'Enter your password.');
      _passwordFocus.requestFocus();
      return;
    }

    setState(() => _isLoading = true);
    HapticFeedback.lightImpact();

    try {
      final outcome = await QuantAuthController.instance.login(
        email: rawEmail,
        password: rawPassword,
      );

      if (!mounted) return;

      if (outcome.status == LoginStatus.signedIn) {
        _onLoginSuccess();
      } else if (outcome.status == LoginStatus.twoFactorRequired) {
        setState(() {
          _isTwoFactor = true;
          _twoFactorChallenge = outcome.challenge ?? '';
          _passwordController.clear();
          _isLoading = false;
        });
        _startCountdown(outcome.expiresIn);
        Future.delayed(const Duration(milliseconds: 150), () {
          _codeFocus.requestFocus();
        });
      } else {
        setState(() {
          _isLoading = false;
          _errorMessage = outcome.errorMessage ?? 'Sign-in failed. Please try again.';
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = 'Sign-in could not be completed. Please try again.';
      });
    }
  }

  Future<void> _handleTwoFactorSubmit() async {
    final rawCode = _codeController.text.trim();
    if (rawCode.isEmpty) {
      setState(() {
        _errorMessage = _isBackupCodeMode
            ? 'Enter one of your recovery codes.'
            : 'Enter the 6-digit code from your authenticator app.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    HapticFeedback.lightImpact();

    try {
      final outcome = await QuantAuthController.instance.completeTwoFactor(
        challenge: _twoFactorChallenge,
        code: rawCode,
        email: _emailController.text.trim(),
      );

      if (!mounted) return;

      if (outcome.status == LoginStatus.signedIn) {
        _countdownTimer?.cancel();
        _onLoginSuccess();
      } else {
        setState(() {
          _isLoading = false;
          _errorMessage = outcome.errorMessage ?? 'That code was not accepted.';
          _codeController.clear();
        });
        _codeFocus.requestFocus();
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = 'Verification could not be completed. Please try again.';
      });
    }
  }

  Future<void> _openRegister() async {
    final address = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QuantRegisterScreen()),
    );
    if (!mounted || address == null) return;
    setState(() {
      _emailController.text = address;
      _passwordController.clear();
      _errorMessage = null;
      _noticeMessage = 'Welcome to QuantWorkplace. Sign in as $address';
    });
    _passwordFocus.requestFocus();
  }

  Future<void> _openForgotPassword() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const QuantForgotPasswordScreen()),
    );
    if (!mounted || changed != true) return;
    setState(() {
      _passwordController.clear();
      _errorMessage = null;
      _noticeMessage = 'Password updated. Sign in with your new password.';
    });
  }

  void _onLoginSuccess() {
    HapticFeedback.mediumImpact();
    if (widget.onAuthenticated != null) {
      widget.onAuthenticated!();
    } else {
      Navigator.of(context).pushReplacement(
        PageRouteBuilder(
          transitionDuration: const Duration(milliseconds: 600),
          pageBuilder: (context, animation, secondaryAnimation) => const MailShell(),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: const Color(0xFF040508),
      body: Stack(
        children: [
          // Ambient Radial Nebula Glows
          Positioned(
            top: -80,
            left: size.width * 0.2,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFFFF7A00).withOpacity(0.12),
                    Colors.transparent,
                  ],
                ),
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
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF22C55E).withOpacity(0.08),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          // Main Form Content
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 12),

                      // Central Brand Emblem (Gargantua Singularity + Cursive Badge)
                      _buildHeaderBrandLockup(),

                      const SizedBox(height: 28),

                      // Executive Sign-In Card
                      _buildAuthCard(),

                      const SizedBox(height: 24),

                      // Sovereign Footer Signature
                      _buildFooterSignature(),

                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderBrandLockup() {
    return Column(
      children: [
        // Pulsing Gargantua Singularity
        AnimatedBuilder(
          animation: _pulseAnimation,
          builder: (context, child) {
            return Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFF7A00).withOpacity(0.35 * _pulseAnimation.value),
                    blurRadius: 28,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: child,
            );
          },
          child: Image.asset(
            'assets/gargantua_master.png',
            fit: BoxFit.contain,
          ),
        ),
        const SizedBox(height: 14),

        // Cursive QuantWorkplace Badge
        Image.asset(
          'assets/quantworkplace_cursive_badge.png',
          height: 38,
          fit: BoxFit.contain,
        ),
      ],
    );
  }

  Widget _buildAuthCard() {
    return Container(
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0C13).withOpacity(0.95),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: const Color(0xFF1E2230),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.6),
            blurRadius: 32,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Heading & Subtitle
          Text(
            _isTwoFactor ? 'Confirm your identity' : 'Sign in to QuantWorkplace',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _isTwoFactor
                ? (_isBackupCodeMode
                    ? 'Enter one of the recovery codes saved during setup.'
                    : 'Open your authenticator app and enter the 6-digit code.')
                : 'Enter your sovereign email address and password.',
            style: const TextStyle(
              color: Color(0xFF94A3B8),
              fontSize: 13,
              height: 1.4,
            ),
          ),

          const SizedBox(height: 22),

          if (_noticeMessage != null && _errorMessage == null && !_isTwoFactor)
            AuthBanner(_noticeMessage!, isSuccess: true),

          // Error Alert Banner
          if (_errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withOpacity(0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: const Color(0xFFEF4444).withOpacity(0.35),
                  width: 1,
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.error_outline_rounded,
                    color: Color(0xFFF87171),
                    size: 18,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(
                        color: Color(0xFFFCA5A5),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Form Fields: Credentials or 2FA
          if (!_isTwoFactor) _buildCredentialsFields() else _buildTwoFactorFields(),

          const SizedBox(height: 22),

          // Primary Sign In Button
          _buildPrimarySubmitButton(),

          if (!_isTwoFactor) ...[
            const SizedBox(height: 20),
            Center(
              child: Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const Text(
                    'New to QuantWorkplace? ',
                    style: TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 13,
                    ),
                  ),
                  GestureDetector(
                    onTap: _openRegister,
                    child: const Text(
                      'Create an address',
                      style: TextStyle(
                        color: Color(0xFFFF7A00),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                        decorationColor: Color(0xFFFF7A00),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCredentialsFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Email Field Label
        const Text(
          'Email address',
          style: TextStyle(
            color: Color(0xFFCBD5E1),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),

        // Email Text Field
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF111420),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _emailFieldError != null
                  ? const Color(0xFFEF4444)
                  : const Color(0xFF222838),
              width: 1.2,
            ),
          ),
          child: TextField(
            controller: _emailController,
            focusNode: _emailFocus,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontFamily: 'monospace',
            ),
            decoration: InputDecoration(
              isDense: true,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              hintText: 'you@quantmail.in',
              hintStyle: TextStyle(
                color: Colors.white.withOpacity(0.25),
                fontSize: 14,
                fontFamily: 'monospace',
              ),
              prefixIcon: const Icon(
                Icons.alternate_email_rounded,
                color: Color(0xFF64748B),
                size: 18,
              ),
            ),
          ),
        ),
        if (_emailFieldError != null) ...[
          const SizedBox(height: 5),
          Text(
            _emailFieldError!,
            style: const TextStyle(color: Color(0xFFF87171), fontSize: 11.5),
          ),
        ],

        const SizedBox(height: 18),

        // Password Field Label + Forgot Password link
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Password',
              style: TextStyle(
                color: Color(0xFFCBD5E1),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            GestureDetector(
              onTap: _openForgotPassword,
              child: const Text(
                'Forgot password?',
                style: TextStyle(
                  color: Color(0xFFFF7A00),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  decoration: TextDecoration.underline,
                  decorationColor: Color(0xFFFF7A00),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),

        // Password Text Field
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF111420),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _passwordFieldError != null
                  ? const Color(0xFFEF4444)
                  : const Color(0xFF222838),
              width: 1.2,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _passwordController,
                  focusNode: _passwordFocus,
                  obscureText: !_showPassword,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _handleLogin(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                  ),
                  decoration: InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    hintText: 'Enter your password',
                    hintStyle: TextStyle(
                      color: Colors.white.withOpacity(0.25),
                      fontSize: 14,
                    ),
                    prefixIcon: const Icon(
                      Icons.lock_outline_rounded,
                      color: Color(0xFF64748B),
                      size: 18,
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: () => setState(() => _showPassword = !_showPassword),
                icon: Icon(
                  _showPassword ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                  color: const Color(0xFF64748B),
                  size: 20,
                ),
                tooltip: _showPassword ? 'Hide password' : 'Show password',
              ),
            ],
          ),
        ),
        if (_passwordFieldError != null) ...[
          const SizedBox(height: 5),
          Text(
            _passwordFieldError!,
            style: const TextStyle(color: Color(0xFFF87171), fontSize: 11.5),
          ),
        ],
      ],
    );
  }

  Widget _buildTwoFactorFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              _isBackupCodeMode ? 'Recovery code' : 'Authenticator code',
              style: const TextStyle(
                color: Color(0xFFCBD5E1),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (_secondsLeft > 0)
              Text(
                'Expires in ${_formatCountdown(_secondsLeft)}',
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),

        // Code Input Field
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF111420),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: const Color(0xFFFF7A00).withOpacity(0.5),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFF7A00).withOpacity(0.12),
                blurRadius: 16,
              ),
            ],
          ),
          child: TextField(
            controller: _codeController,
            focusNode: _codeFocus,
            textAlign: TextAlign.center,
            keyboardType: _isBackupCodeMode ? TextInputType.text : TextInputType.number,
            maxLength: _isBackupCodeMode ? 11 : 6,
            textCapitalization: TextCapitalization.characters,
            onSubmitted: (_) => _handleTwoFactorSubmit(),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: 8,
              fontFamily: 'monospace',
            ),
            decoration: InputDecoration(
              counterText: '',
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              hintText: _isBackupCodeMode ? 'ABCDE-FGHJK' : '123456',
              hintStyle: TextStyle(
                color: Colors.white.withOpacity(0.2),
                fontSize: 20,
                letterSpacing: 6,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _isBackupCodeMode
              ? 'One of your saved emergency recovery codes.'
              : 'Six digits, refreshed every 30 seconds in your authenticator.',
          style: const TextStyle(
            color: Color(0xFF64748B),
            fontSize: 11.5,
          ),
        ),

        const SizedBox(height: 14),

        // Toggle Backup Code Mode
        Center(
          child: TextButton(
            onPressed: () {
              setState(() {
                _isBackupCodeMode = !_isBackupCodeMode;
                _codeController.clear();
                _errorMessage = null;
              });
              _codeFocus.requestFocus();
            },
            child: Text(
              _isBackupCodeMode
                  ? 'Use authenticator app instead'
                  : 'Use a recovery code instead',
              style: const TextStyle(
                color: Color(0xFFFF7A00),
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),

        // Back to Credentials
        Center(
          child: TextButton(
            onPressed: () => _backToCredentials(),
            child: const Text(
              'Sign in as someone else',
              style: TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 12,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPrimarySubmitButton() {
    return Container(
      width: double.infinity,
      height: 48,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          colors: [
            Color(0xFFFF7A00),
            Color(0xFFFF9E40),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFF7A00).withOpacity(0.35),
            blurRadius: 18,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _isLoading
              ? null
              : (_isTwoFactor ? _handleTwoFactorSubmit : _handleLogin),
          borderRadius: BorderRadius.circular(14),
          child: Center(
            child: _isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : Text(
                    _isTwoFactor ? 'Verify and sign in' : 'Sign in',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.2,
                    ),
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildFooterSignature() {
    return Column(
      children: [
        // Brand Signature: by -> Gargantua -> quantrinity
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'by',
              style: TextStyle(
                color: Color(0xFF71717A),
                fontSize: 13,
                fontWeight: FontWeight.w400,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(width: 8),
            Image.asset(
              'assets/gargantua_master.png',
              width: 20,
              height: 20,
              fit: BoxFit.contain,
            ),
            const SizedBox(width: 8),
            Image.asset(
              'assets/quantrinity_cursive_badge.png',
              height: 18,
              fit: BoxFit.contain,
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Legal Links: Help · Privacy · Terms
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _buildLegalLink('Help'),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('·', style: TextStyle(color: Color(0xFF475569))),
            ),
            _buildLegalLink('Privacy'),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('·', style: TextStyle(color: Color(0xFF475569))),
            ),
            _buildLegalLink('Terms'),
          ],
        ),
      ],
    );
  }

  Widget _buildLegalLink(String title) {
    return GestureDetector(
      onTap: () {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF111420),
            content: Text(
              'Sovereign $title documentation.',
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
          ),
        );
      },
      child: Text(
        title,
        style: const TextStyle(
          color: Color(0xFF64748B),
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
