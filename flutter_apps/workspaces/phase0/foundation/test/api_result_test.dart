// ApiResult / ApiError unit tests: the never-throws result envelope.
//
// Run: `flutter test` from the package root.

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';

void main() {
  group('ApiResult.ok', () {
    test('reportsSuccessAndCarriesData', () {
      final result = ApiResult.ok('payload');

      expect(result.success, isTrue);
      expect(result.data, 'payload');
      expect(result.error, isNull);
    });

    test('carriesOptionalBackendMetadata', () {
      final result = ApiResult.ok(
        'payload',
        metadata: {'requestId': 'req-1'},
      );

      expect(result.metadata, {'requestId': 'req-1'});
    });

    test('metadataDefaultsToNull', () {
      final result = ApiResult.ok('payload');

      expect(result.metadata, isNull);
    });

    test('supportsNullableAndComplexDataTypes', () {
      final listResult = ApiResult.ok(<String>['a', 'b']);
      expect(listResult.data, ['a', 'b']);

      final nullResult = ApiResult<String?>.ok(null);
      expect(nullResult.success, isTrue);
      expect(nullResult.data, isNull);
    });

    test('toStringDescribesOkResults', () {
      expect(ApiResult.ok('x').toString(), 'ApiResult.ok(x)');
    });
  });

  group('ApiResult.failure', () {
    test('reportsFailureAndCarriesError', () {
      const error = ApiError(
        code: 'TIMEOUT',
        message: 'Request timed out',
        statusCode: 408,
      );
      final result = ApiResult<String>.failure(error);

      expect(result.success, isFalse);
      expect(result.error, same(error));
      expect(result.data, isNull);
      expect(result.metadata, isNull);
    });

    test('toStringDescribesFailures', () {
      const error = ApiError(
        code: 'NETWORK_ERROR',
        message: 'No connection',
        statusCode: 0,
      );
      final result = ApiResult<void>.failure(error);

      expect(
        result.toString(),
        'ApiResult.failure(ApiError(code: NETWORK_ERROR, '
        'message: No connection, statusCode: 0))',
      );
    });
  });

  group('ApiError', () {
    test('exposesCodeMessageStatusAndDetails', () {
      const error = ApiError(
        code: 'VALIDATION_FAILED',
        message: 'Invalid email',
        statusCode: 422,
        details: {'field': 'email'},
      );

      expect(error.code, 'VALIDATION_FAILED');
      expect(error.message, 'Invalid email');
      expect(error.statusCode, 422);
      expect(error.details, {'field': 'email'});
    });

    test('detailsDefaultToNull', () {
      const error = ApiError(
        code: 'UNKNOWN_ERROR',
        message: 'Something went wrong',
        statusCode: 0,
      );

      expect(error.details, isNull);
    });

    test('usesZeroStatusCodeWhenNoHttpResponseWasReceived', () {
      const error = ApiError(
        code: 'NETWORK_ERROR',
        message: 'Offline',
        statusCode: 0,
      );

      expect(error.statusCode, 0);
    });

    test('toStringIncludesCodeMessageAndStatus', () {
      const error = ApiError(
        code: 'TIMEOUT',
        message: 'Timed out',
        statusCode: 408,
      );

      expect(error.toString(),
          'ApiError(code: TIMEOUT, message: Timed out, statusCode: 408)');
    });
  });
}
