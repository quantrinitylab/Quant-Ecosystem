// ============================================================================
// gram_core - API result envelope
// ============================================================================
//
// Copy of `quant_foundation`'s `api_result.dart` (Dart port of the
// `APIResponse<T>` / `APIError` types from `packages/api-client/src/core/types.ts`).
//
// The TS HttpClient never throws for HTTP/network failures: it normalizes
// everything into `{ success, data, error }`. GramApiClient preserves that
// contract so call sites can be ported 1:1.

/// Structured API error, mirroring the TS `APIError` interface.
class ApiError {
  /// Machine-readable code, e.g. `UNKNOWN_ERROR`, `TIMEOUT`, `NETWORK_ERROR`,
  /// or the backend's own `code` field when the error body carries one.
  final String code;

  /// Human-readable message.
  final String message;

  /// HTTP status code, or `0` when no HTTP response was received, or `408`
  /// for client-side timeouts (mirrors the TS mapping).
  final int statusCode;

  /// Optional backend-provided details payload.
  final Map<String, dynamic>? details;

  /// Creates an [ApiError]. Mirrors the TS `APIError` interface field for field.
  const ApiError({
    required this.code,
    required this.message,
    required this.statusCode,
    this.details,
  });

  @override
  String toString() =>
      'ApiError(code: $code, message: $message, statusCode: $statusCode)';
}

/// Standard API response envelope, mirroring the TS `APIResponse<T>`.
///
/// `success == false` carries the failure in [error]; [data] is null then.
/// This type never throws: transport failures are mapped into [error].
class ApiResult<T> {
  final bool success;
  final T? data;
  final ApiError? error;

  /// Optional backend metadata (e.g. `requestId`, `timestamp`) when the
  /// response body carries an `APIResponse` envelope with `metadata`.
  final Map<String, dynamic>? metadata;

  const ApiResult._({
    required this.success,
    this.data,
    this.error,
    this.metadata,
  });

  /// Successful result carrying [data] (and optional backend [metadata]).
  factory ApiResult.ok(T data, {Map<String, dynamic>? metadata}) =>
      ApiResult._(success: true, data: data, metadata: metadata);

  /// Failed result carrying [error]. Transport failures never throw —
  /// they arrive here instead.
  factory ApiResult.failure(ApiError error) =>
      ApiResult._(success: false, error: error);

  @override
  String toString() =>
      success ? 'ApiResult.ok($data)' : 'ApiResult.failure($error)';
}
