// QuantWorkplace - backend target configuration.
//
// Nothing in this file is a secret. It holds only the public API root and the
// public web origin that the QuantMail backend trusts for sign-in requests.
//
// Production is the default, so a plain `flutter run` / `flutter build apk`
// talks to https://quantmail.in/api. Override it with --dart-define:
//
//   API_BASE_URL  API root, including the path prefix if there is one. Auth
//                 routes are appended to it ('/auth/login', '/auth/2fa/verify',
//                 '/auth/logout'). Default: https://quantmail.in/api
//   API_ORIGIN    Value sent in the Origin header. The backend rejects sign-in
//                 requests whose Origin is not in its CORS_ORIGINS list (HTTP 403
//                 UNTRUSTED_ORIGIN). Default: derived from API_BASE_URL, which
//                 gives https://quantmail.in for production.
//
// Android emulator against a backend running on the host machine
// (10.0.2.2 is the emulator's alias for the host's localhost). A local
// backend trusts http://localhost:3000 by default, so pass it as the origin:
//
//   Fastify service directly (default port 3010, no /api prefix):
//     flutter run \
//       --dart-define=API_BASE_URL=http://10.0.2.2:3010 \
//       --dart-define=API_ORIGIN=http://localhost:3000
//
//   Next.js dev server proxy (port 3000, routes under /api):
//     flutter run \
//       --dart-define=API_BASE_URL=http://10.0.2.2:3000/api \
//       --dart-define=API_ORIGIN=http://localhost:3000
//
// Plain http:// to 10.0.2.2 and localhost is allowed in debug builds only (see
// android/app/src/debug). Release builds accept https:// targets only.

import 'package:flutter/foundation.dart';

class QuantApiConfig {
  const QuantApiConfig._();

  static const String defaultBaseUrl = 'https://quantmail.in/api';

  static const String _baseUrlDefine = String.fromEnvironment('API_BASE_URL');
  static const String _originDefine = String.fromEnvironment('API_ORIGIN');

  /// API root with no trailing slash, from `--dart-define=API_BASE_URL`.
  static String get baseUrl => normalizeBaseUrl(_baseUrlDefine);

  /// Origin header value, from `--dart-define=API_ORIGIN` or derived from [baseUrl].
  static String get origin => resolveOrigin(baseUrl: baseUrl, explicitOrigin: _originDefine);

  /// Trims [raw], strips trailing slashes and falls back to [defaultBaseUrl]
  /// when it is empty. Throws [FormatException] for anything that is not an
  /// absolute http(s) URL, so a typo can never silently point the app (and the
  /// credentials typed into it) at a different server than intended.
  @visibleForTesting
  static String normalizeBaseUrl(String raw) {
    final trimmed = raw.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isEmpty) return defaultBaseUrl;

    final uri = Uri.tryParse(trimmed);
    final isHttp = uri != null &&
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.host.isNotEmpty;
    if (!isHttp) {
      throw FormatException(
        'API_BASE_URL must be an absolute http(s) URL such as '
        'https://quantmail.in/api, got "$raw".',
      );
    }
    // Release builds never talk cleartext: only the debug source set carries
    // the network security exception for the emulator host.
    if (uri.scheme == 'http' && kReleaseMode) {
      throw FormatException('API_BASE_URL must use https:// in release builds, got "$raw".');
    }
    return trimmed;
  }

  /// Returns [explicitOrigin] when set, otherwise scheme://host[:port] of [baseUrl].
  @visibleForTesting
  static String resolveOrigin({required String baseUrl, String explicitOrigin = ''}) {
    final explicit = explicitOrigin.trim().replaceAll(RegExp(r'/+$'), '');
    if (explicit.isNotEmpty) return explicit;
    return Uri.parse(baseUrl).origin;
  }
}
