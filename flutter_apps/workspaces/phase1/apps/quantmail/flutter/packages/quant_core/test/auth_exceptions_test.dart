// ============================================================================
// quant_core - unit tests: auth exception vocabulary + login result types
// ============================================================================
//
// Pins the [AuthRepository] error vocabulary: the `toString` formats (used
// in logs and in `AuthFailure` messages), the carried fields, and the
// sealed [LoginResult] hierarchy.

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

void main() {
  group('AuthException', () {
    test('formats without a code as AuthException(message)', () {
      expect(
        const AuthException('bad credentials').toString(),
        'AuthException(bad credentials)',
      );
    });

    test('formats with a code as AuthException(code: message)', () {
      expect(
        const AuthException(
          'Invalid email or password',
          code: 'invalid_credentials',
        ).toString(),
        'AuthException(invalid_credentials: Invalid email or password)',
      );
    });

    test('exposes message and code; code is null when not mapped', () {
      const mapped = AuthException('m', code: 'c');
      expect(mapped.message, 'm');
      expect(mapped.code, 'c');
      expect(const AuthException('m').code, isNull);
    });

    test('is an Exception', () {
      expect(const AuthException('x'), isA<Exception>());
    });
  });

  group('AuthSignedOutException', () {
    test('formats as AuthSignedOutException()', () {
      expect(
        const AuthSignedOutException().toString(),
        'AuthSignedOutException()',
      );
    });
  });

  group('ConsentRequiredException', () {
    test('carries the in-flight authorize request', () {
      final request = AuthorizeRequest(
        url: Uri.parse('https://api.test.local/oauth/authorize?client_id=c'),
        codeVerifier: 'verifier-123',
        state: 'state-456',
      );
      final exception = ConsentRequiredException(request);

      expect(identical(exception.request, request), isTrue);
      expect(exception.request.codeVerifier, 'verifier-123');
      expect(exception.request.state, 'state-456');
      expect(exception.toString(), 'ConsentRequiredException()');
    });
  });

  group('LoginResult', () {
    test('LoginSucceeded is a LoginResult', () {
      expect(const LoginSucceeded(), isA<LoginResult>());
    });

    test('LoginTwoFactorRequired carries the challenge', () {
      const result = LoginTwoFactorRequired('challenge-123');

      expect(result, isA<LoginResult>());
      expect(result.challenge, 'challenge-123');
    });
  });
}
