import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/config/quant_api_config.dart';

void main() {
  group('QuantApiConfig', () {
    test('targets production without any --dart-define', () {
      expect(QuantApiConfig.baseUrl, 'https://quantmail.in/api');
      expect(QuantApiConfig.origin, 'https://quantmail.in');
    });

    test('trims, strips trailing slashes and falls back to production when empty', () {
      expect(QuantApiConfig.normalizeBaseUrl(''), 'https://quantmail.in/api');
      expect(QuantApiConfig.normalizeBaseUrl('   '), 'https://quantmail.in/api');
      expect(QuantApiConfig.normalizeBaseUrl(' http://10.0.2.2:3010/ '), 'http://10.0.2.2:3010');
      expect(QuantApiConfig.normalizeBaseUrl('http://10.0.2.2:3000/api//'), 'http://10.0.2.2:3000/api');
    });

    test('rejects values that are not an absolute http(s) URL', () {
      expect(() => QuantApiConfig.normalizeBaseUrl('10.0.2.2:3010'), throwsFormatException);
      expect(() => QuantApiConfig.normalizeBaseUrl('localhost:3000'), throwsFormatException);
      expect(() => QuantApiConfig.normalizeBaseUrl('ftp://example.com'), throwsFormatException);
      expect(() => QuantApiConfig.normalizeBaseUrl('https://'), throwsFormatException);
    });

    test('the origin is derived from the base URL unless API_ORIGIN is set', () {
      expect(QuantApiConfig.resolveOrigin(baseUrl: 'https://quantmail.in/api'), 'https://quantmail.in');
      expect(QuantApiConfig.resolveOrigin(baseUrl: 'http://10.0.2.2:3010'), 'http://10.0.2.2:3010');
      expect(
        QuantApiConfig.resolveOrigin(baseUrl: 'http://10.0.2.2:3010', explicitOrigin: 'http://localhost:3000/'),
        'http://localhost:3000',
      );
    });
  });
}
