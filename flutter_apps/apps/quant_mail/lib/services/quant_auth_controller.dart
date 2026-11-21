// Sovereign Quant Ecosystem - Unified Auth Controller
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath method invocations (120Hz Impeller & Skia safe).
//
// Fail-closed sign-in. A session is created only from a successful response of
// the QuantMail backend. A failing or unreachable backend, an unexpected
// response or any exception leaves the user signed out with a clear message.
// There is no offline, demo or debug sign-in path in this file.

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../config/quant_api_config.dart';
import 'quant_auth_service.dart';

enum LoginStatus {
  signedIn,
  twoFactorRequired,
  failed,
}

class QuantLoginOutcome {
  final LoginStatus status;
  final String? errorMessage;
  final String? challenge;
  final int expiresIn;
  final QuantUserProfile? user;

  const QuantLoginOutcome._({
    required this.status,
    this.errorMessage,
    this.challenge,
    this.expiresIn = 300,
    this.user,
  });

  factory QuantLoginOutcome.signedIn(QuantUserProfile user) {
    return QuantLoginOutcome._(
      status: LoginStatus.signedIn,
      user: user,
    );
  }

  factory QuantLoginOutcome.twoFactorRequired({
    required String challenge,
    int expiresIn = 300,
  }) {
    return QuantLoginOutcome._(
      status: LoginStatus.twoFactorRequired,
      challenge: challenge,
      expiresIn: expiresIn,
    );
  }

  factory QuantLoginOutcome.failed(String message) {
    return QuantLoginOutcome._(
      status: LoginStatus.failed,
      errorMessage: message,
    );
  }
}

class QuantAuthController {
  static final QuantAuthController instance = QuantAuthController._();

  /// The backend keeps the refresh credential in an HttpOnly cookie and never
  /// puts it in the JSON body, so the app holds no refresh token yet. This
  /// marker only satisfies the session store. It is not a credential.
  static const String _noRefreshTokenMarker = 'rf_sovereign';

  static const String _unexpectedResponseMessage =
      'The server sent an unexpected response. Please try again.';

  final QuantAuthService _authService;
  final Dio _dio;
  final String _baseUrl;
  bool _initialized = false;

  /// Production by default; see [QuantApiConfig] for the --dart-define overrides.
  QuantAuthController._()
      : this._create(
          authService: QuantAuthService(),
          baseUrl: QuantApiConfig.baseUrl,
          origin: QuantApiConfig.origin,
        );

  QuantAuthController._create({
    required QuantAuthService authService,
    required String baseUrl,
    required String origin,
    HttpClientAdapter? httpClientAdapter,
  })  : _authService = authService,
        _baseUrl = baseUrl,
        _dio = Dio(
          BaseOptions(
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 15),
            headers: {
              'Accept': 'application/json',
              // The backend only accepts auth requests from a trusted origin.
              'Origin': origin,
            },
          ),
        ) {
    if (httpClientAdapter != null) {
      _dio.httpClientAdapter = httpClientAdapter;
    }
  }

  @visibleForTesting
  factory QuantAuthController.forTesting({
    required QuantAuthService authService,
    required String baseUrl,
    required String origin,
    required HttpClientAdapter httpClientAdapter,
  }) {
    return QuantAuthController._create(
      authService: authService,
      baseUrl: baseUrl,
      origin: origin,
      httpClientAdapter: httpClientAdapter,
    );
  }

  QuantAuthService get authService => _authService;
  ValueNotifier<QuantAuthSession?> get sessionNotifier => _authService.sessionNotifier;
  bool get isAuthenticated => _authService.isAuthenticated;
  QuantUserProfile? get currentUser => _authService.currentUser;

  String get _host => Uri.parse(_baseUrl).host;

  Future<void> init() async {
    if (_initialized) return;
    try {
      await _authService.init();
      _initialized = true;
      debugPrint('[QuantAuthController] Initialized. Authenticated: $isAuthenticated');
    } catch (e) {
      debugPrint('[QuantAuthController] Initialization error: $e');
      _initialized = true;
    }
  }

  /// Normalizes sovereign email addresses by auto-completing domain
  static String normalizeAddress(String input) {
    final trimmed = input.trim().toLowerCase();
    if (trimmed.isEmpty) return '';
    if (trimmed.contains('@')) return trimmed;
    return '$trimmed@quantmail.in';
  }

  /// Authenticate with sovereign credentials. Never throws: every failure is
  /// returned as [LoginStatus.failed] and leaves the user signed out.
  Future<QuantLoginOutcome> login({
    required String email,
    required String password,
  }) async {
    final normalized = normalizeAddress(email);
    if (normalized.isEmpty || password.isEmpty) {
      return QuantLoginOutcome.failed('Email address and password are required.');
    }

    try {
      debugPrint('[QuantAuthController] Attempting login via $_baseUrl/auth/login');
      final response = await _dio.post(
        '$_baseUrl/auth/login',
        data: {
          'email': normalized,
          'password': password,
        },
        options: Options(contentType: Headers.jsonContentType),
      );
      return await _outcomeFromResponse(
        response.data,
        fallbackEmail: normalized,
        allowTwoFactorChallenge: true,
      );
    } on DioException catch (dioErr) {
      debugPrint('[QuantAuthController] Login rejected: ${dioErr.type} status=${dioErr.response?.statusCode}');
      return QuantLoginOutcome.failed(_messageForDioException(dioErr));
    } catch (e) {
      debugPrint('[QuantAuthController] Unexpected login error: ${e.runtimeType}');
      return QuantLoginOutcome.failed('Sign-in could not be completed. Please try again.');
    }
  }

  /// Complete 2FA verification with TOTP code or backup code. Never throws:
  /// a code is accepted only when the backend accepts it.
  Future<QuantLoginOutcome> completeTwoFactor({
    required String challenge,
    required String code,
    String? email,
  }) async {
    final cleanCode = code.trim().replaceAll('-', '');
    if (cleanCode.isEmpty) {
      return QuantLoginOutcome.failed('Enter the 6-digit verification code.');
    }
    if (challenge.isEmpty) {
      return QuantLoginOutcome.failed('This sign-in attempt is no longer valid. Enter your password again.');
    }

    try {
      final response = await _dio.post(
        '$_baseUrl/auth/2fa/verify',
        data: {
          'challenge': challenge,
          'code': cleanCode,
        },
        options: Options(contentType: Headers.jsonContentType),
      );
      return await _outcomeFromResponse(
        response.data,
        fallbackEmail: email ?? '',
        allowTwoFactorChallenge: false,
      );
    } on DioException catch (dioErr) {
      debugPrint('[QuantAuthController] 2FA rejected: ${dioErr.type} status=${dioErr.response?.statusCode}');
      return QuantLoginOutcome.failed(_messageForDioException(dioErr));
    } catch (e) {
      debugPrint('[QuantAuthController] Unexpected 2FA error: ${e.runtimeType}');
      return QuantLoginOutcome.failed('Verification could not be completed. Please try again.');
    }
  }

  /// Signs out on this device first, then tells the backend on a best-effort
  /// basis, so a dead network can never leave credentials behind.
  Future<void> logout() async {
    await _authService.logout();
    try {
      await _dio.post('$_baseUrl/auth/logout');
    } catch (_) {
      // Already signed out locally; nothing else to do.
    }
  }

  /// Turns a successful backend response into a stored session, a 2FA
  /// challenge or a failure. Only a response that carries a real access token
  /// and user can sign the user in.
  Future<QuantLoginOutcome> _outcomeFromResponse(
    Object? body, {
    required String fallbackEmail,
    required bool allowTwoFactorChallenge,
  }) async {
    if (body is! Map || body['success'] != true || body['data'] is! Map) {
      return QuantLoginOutcome.failed(_unexpectedResponseMessage);
    }
    final data = Map<String, dynamic>.from(body['data'] as Map);

    if (allowTwoFactorChallenge && data['twoFactorRequired'] == true) {
      final challenge = data['challenge'];
      if (challenge is! String || challenge.isEmpty) {
        return QuantLoginOutcome.failed(_unexpectedResponseMessage);
      }
      final expiresIn = data['expiresIn'];
      return QuantLoginOutcome.twoFactorRequired(
        challenge: challenge,
        expiresIn: expiresIn is num && expiresIn > 0 ? expiresIn.toInt() : 300,
      );
    }

    final accessToken = data['accessToken'];
    final userJson = data['user'] is Map ? Map<String, dynamic>.from(data['user'] as Map) : <String, dynamic>{};
    final userId = userJson['id'] ?? data['userId'];
    if (accessToken is! String || accessToken.isEmpty || userId is! String || userId.isEmpty) {
      return QuantLoginOutcome.failed(_unexpectedResponseMessage);
    }

    final accountEmail = userJson['email'] is String ? userJson['email'] as String : fallbackEmail;
    final refreshToken = data['refreshToken'];
    final profile = QuantUserProfile.fromJson({
      'id': userId,
      'email': accountEmail,
      'name': userJson['displayName'] ?? userJson['username'] ?? _extractNameFromEmail(accountEmail),
      'role': userJson['role'] ?? 'Executive Operator',
      'tier': 'Sovereign Enterprise',
    });

    try {
      await _authService.saveSession(
        accessToken: accessToken,
        refreshToken: refreshToken is String && refreshToken.isNotEmpty ? refreshToken : _noRefreshTokenMarker,
        user: profile,
      );
    } catch (e) {
      debugPrint('[QuantAuthController] Could not store session: ${e.runtimeType}');
      // Wipe anything that was written before the failure, so the next launch
      // cannot restore half a session.
      await _authService.logout();
      return QuantLoginOutcome.failed('Your session could not be stored securely on this device. Please try again.');
    }

    return QuantLoginOutcome.signedIn(profile);
  }

  /// A clear, user-facing reason for a failed request. The server's own
  /// message wins when it sent one (for example "Invalid email or password.").
  String _messageForDioException(DioException error) {
    final data = error.response?.data;
    final status = error.response?.statusCode;

    if (data is Map) {
      final err = data['error'];
      if (err is Map && err['code'] == 'UNTRUSTED_ORIGIN') {
        return 'This app build is not allowed to sign in to $_host (untrusted origin). '
            'Check the API_ORIGIN build setting.';
      }
      final serverMessage = (err is Map ? err['message'] : null) ?? data['message'];
      if (serverMessage is String && serverMessage.trim().isNotEmpty) {
        return serverMessage.trim();
      }
    }

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'The server took too long to respond. Check your connection and try again.';
      case DioExceptionType.connectionError:
        return 'Cannot reach $_host. Check your internet connection and try again.';
      case DioExceptionType.badCertificate:
        return 'A secure connection to $_host could not be verified, so sign-in was blocked.';
      case DioExceptionType.cancel:
        return 'Sign-in was cancelled.';
      case DioExceptionType.badResponse:
        if (status == 429) return 'Too many attempts. Wait a minute and try again.';
        return 'The server sent an unexpected response${status == null ? '' : ' (HTTP $status)'}. Please try again later.';
      default:
        // Includes DioExceptionType.unknown and any type a newer Dio adds.
        return 'Sign-in could not be completed. Check your connection and try again.';
    }
  }

  static String _extractNameFromEmail(String email) {
    final prefix = email.split('@').first;
    if (prefix.isEmpty) return 'Quant Operator';
    final parts = prefix.split(RegExp(r'[\._\-]'));
    return parts.map((p) => p.isEmpty ? '' : '${p[0].toUpperCase()}${p.substring(1)}').join(' ').trim();
  }
}
