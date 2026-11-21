// QuantWorkplace - account creation and password recovery against the
// production QuantMail backend (same endpoints and payloads as the website).
//
// Fail-closed: none of these calls ever creates a session. A success is only
// reported when the backend answers with success: true. Network or server
// problems come back as a failure with a readable message.

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../config/quant_api_config.dart';

const String kQuantMailDomain = 'quantmail.in';
const int kMinPasswordLength = 8;
const int kMaxPasswordLength = 200;

/// Validation rules, copied from the website (apps/quantmail identity.ts and
/// PasswordStrengthMeter.tsx) so the app and the site accept the same input.
class QuantAccountRules {
  const QuantAccountRules._();

  static final RegExp _usernameRe = RegExp(r'^[a-z0-9][a-z0-9._-]{2,29}$');

  static String normalizeHandle(String raw) =>
      raw.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9._-]'), '');

  static String addressFor(String handle) => '${normalizeHandle(handle)}@$kQuantMailDomain';

  /// Null when valid, otherwise the message to show under the field.
  static String? handleError(String raw) {
    final normalized = normalizeHandle(raw);
    if (normalized.isEmpty) return 'Choose a handle.';
    if (!_usernameRe.hasMatch(normalized)) {
      return 'Use 3-30 letters, numbers, dots, dashes, or underscores.';
    }
    return null;
  }

  static String? passwordError(String password) {
    if (password.isEmpty) return 'Enter a password.';
    if (password.length < kMinPasswordLength) return 'Use at least $kMinPasswordLength characters.';
    if (password.length > kMaxPasswordLength) return 'Use $kMaxPasswordLength characters or fewer.';
    if (password.runes.toSet().length == 1) return 'Use more than one repeated character.';
    return null;
  }

  static String? confirmError(String password, String confirm) {
    if (confirm.isEmpty) return 'Confirm your password.';
    if (confirm != password) return 'Passwords do not match.';
    return null;
  }

  /// Accepts a full reset link or a bare token and returns the token, or null.
  static String? extractResetToken(String input) {
    final text = input.trim();
    if (text.isEmpty) return null;
    final uri = Uri.tryParse(text);
    final fromQuery = uri?.queryParameters['token']?.trim();
    if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;
    if (RegExp(r'^[A-Za-z0-9._~-]{16,}$').hasMatch(text)) return text;
    return null;
  }
}

enum AccountFailure { none, handleTaken, weakPassword, rateLimited, network, server, invalidLink }

class QuantAccountResult {
  final bool ok;
  final AccountFailure failure;
  final String? message;
  final String? code;

  const QuantAccountResult._(this.ok, this.failure, this.message, this.code);

  const QuantAccountResult.success() : this._(true, AccountFailure.none, null, null);

  const QuantAccountResult.failure(AccountFailure failure, String message, {String? code})
      : this._(false, failure, message, code);
}

class QuantAccountService {
  static final QuantAccountService instance = QuantAccountService._(
    baseUrl: QuantApiConfig.baseUrl,
    origin: QuantApiConfig.origin,
  );

  final String _baseUrl;
  final Dio _dio;

  QuantAccountService._({
    required String baseUrl,
    required String origin,
    HttpClientAdapter? httpClientAdapter,
  })  : _baseUrl = baseUrl,
        _dio = Dio(
          BaseOptions(
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 15),
            headers: {'Accept': 'application/json', 'Origin': origin},
            // Handle every HTTP status ourselves so error bodies are readable.
            validateStatus: (_) => true,
          ),
        ) {
    if (httpClientAdapter != null) _dio.httpClientAdapter = httpClientAdapter;
  }

  @visibleForTesting
  factory QuantAccountService.forTesting({
    required String baseUrl,
    required String origin,
    required HttpClientAdapter httpClientAdapter,
  }) =>
      QuantAccountService._(baseUrl: baseUrl, origin: origin, httpClientAdapter: httpClientAdapter);

  String get _host => Uri.parse(_baseUrl).host;

  /// POST /auth/register. The session the backend issues is deliberately
  /// ignored (the website does the same): the user signs in afterwards.
  Future<QuantAccountResult> register({
    required String handle,
    required String password,
    required bool acceptTerms,
  }) {
    final username = QuantAccountRules.normalizeHandle(handle);
    return _post('/auth/register', {
      'email': QuantAccountRules.addressFor(username),
      'password': password,
      'username': username,
      'displayName': username,
      'acceptTerms': acceptTerms,
    }, fallback: 'Registration failed. Try again.');
  }

  /// POST /auth/password-reset. The backend answers generically on purpose.
  Future<QuantAccountResult> requestPasswordReset(String address) {
    return _post('/auth/password-reset', {'email': address.trim()},
        fallback: 'Something went wrong. Try again.');
  }

  /// POST /auth/password-reset/confirm.
  Future<QuantAccountResult> confirmPasswordReset({
    required String token,
    required String newPassword,
  }) {
    return _post('/auth/password-reset/confirm', {'token': token, 'newPassword': newPassword},
        fallback: 'Something went wrong. Request a new link and try again.');
  }

  Future<QuantAccountResult> _post(String path, Map<String, dynamic> body, {required String fallback}) async {
    try {
      final response = await _dio.post(
        '$_baseUrl$path',
        data: body,
        options: Options(contentType: Headers.jsonContentType),
      );
      final status = response.statusCode ?? 0;
      final data = response.data;
      if (status >= 200 && status < 300 && data is Map && data['success'] == true) {
        return const QuantAccountResult.success();
      }
      return _failureFrom(status, data, fallback);
    } on DioException catch (e) {
      debugPrint('[QuantAccountService] $path failed: ${e.type}');
      switch (e.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return const QuantAccountResult.failure(
              AccountFailure.network, 'The server took too long to respond. Check your connection and try again.');
        case DioExceptionType.badCertificate:
          return QuantAccountResult.failure(
              AccountFailure.network, 'A secure connection to $_host could not be verified.');
        default:
          return QuantAccountResult.failure(AccountFailure.network,
              'We could not reach $_host. Check your internet connection and try again.');
      }
    } catch (e) {
      debugPrint('[QuantAccountService] $path unexpected: ${e.runtimeType}');
      return QuantAccountResult.failure(AccountFailure.server, fallback);
    }
  }

  QuantAccountResult _failureFrom(int status, Object? data, String fallback) {
    String? code;
    String? message;
    if (data is Map) {
      final err = data['error'];
      if (err is Map) {
        code = err['code'] is String ? err['code'] as String : null;
        message = err['message'] is String ? (err['message'] as String).trim() : null;
      } else if (data['message'] is String) {
        message = (data['message'] as String).trim();
      }
    }
    final text = (message != null && message.isNotEmpty) ? message : fallback;

    if (status == 429) {
      return QuantAccountResult.failure(AccountFailure.rateLimited, 'Too many attempts. Wait a minute and try again.',
          code: code);
    }
    if (code == 'UNTRUSTED_ORIGIN') {
      return QuantAccountResult.failure(
          AccountFailure.server, 'This app build is not allowed to reach $_host (untrusted origin).',
          code: code);
    }
    if (code == 'USER_EXISTS' || status == 409) {
      return QuantAccountResult.failure(AccountFailure.handleTaken, text, code: code);
    }
    if (code == 'WEAK_PASSWORD') {
      return QuantAccountResult.failure(AccountFailure.weakPassword, text, code: code);
    }
    if (code == 'INVALID_TOKEN' || code == 'RESET_LINK_EXPIRED') {
      return QuantAccountResult.failure(AccountFailure.invalidLink, text, code: code);
    }
    if (code == 'VALIDATION_ERROR' && text.toLowerCase().contains('password')) {
      return QuantAccountResult.failure(AccountFailure.weakPassword, text, code: code);
    }
    return QuantAccountResult.failure(AccountFailure.server, text, code: code);
  }
}
