import 'package:dio/dio.dart';

enum MailErrorKind {
  network,
  timeout,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooLarge,
  rateLimited,
  invalidCursor,
  server,
  unexpected,
}

/// Failure of a repository call, mapped from Dio. The UI maps [kind] to the
/// copy of the spec (section 4.7); [message] is the server's own words.
class MailException implements Exception {
  const MailException(this.kind, {this.message, this.statusCode, this.code, this.retryAfter});

  final MailErrorKind kind;
  final String? message;
  final int? statusCode;

  /// Backend error code such as `INVALID_CURSOR`.
  final String? code;
  final Duration? retryAfter;

  /// True when no answer from the server was received.
  bool get isConnectivity => kind == MailErrorKind.network || kind == MailErrorKind.timeout;

  factory MailException.fromDio(DioException e) {
    final int? status = e.response?.statusCode;
    String? code;
    String? message;
    final Object? data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final Map<dynamic, dynamic> err = data['error'] as Map<dynamic, dynamic>;
      code = err['code'] is String ? err['code'] as String : null;
      message = err['message'] is String ? err['message'] as String : null;
    }
    if (status == null) {
      return switch (e.type) {
        DioExceptionType.connectionTimeout ||
        DioExceptionType.sendTimeout ||
        DioExceptionType.receiveTimeout =>
          MailException(MailErrorKind.timeout, message: message),
        DioExceptionType.connectionError ||
        DioExceptionType.badCertificate =>
          MailException(MailErrorKind.network, message: message),
        _ => MailException(MailErrorKind.unexpected, message: message),
      };
    }
    final MailErrorKind kind;
    if (code == 'INVALID_CURSOR') {
      kind = MailErrorKind.invalidCursor;
    } else {
      kind = switch (status) {
        401 => MailErrorKind.unauthorized,
        403 => MailErrorKind.forbidden,
        404 => MailErrorKind.notFound,
        409 || 422 => MailErrorKind.conflict,
        413 => MailErrorKind.tooLarge,
        429 => MailErrorKind.rateLimited,
        >= 500 => MailErrorKind.server,
        _ => MailErrorKind.unexpected,
      };
    }
    final String? retry = e.response?.headers.value('retry-after');
    final int? seconds = retry == null ? null : int.tryParse(retry);
    return MailException(
      kind,
      message: message,
      statusCode: status,
      code: code,
      retryAfter: seconds == null ? null : Duration(seconds: seconds),
    );
  }

  @override
  String toString() => 'MailException($kind, status=$statusCode, code=$code)';
}
