import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// cookie_jar [Storage] backed by the platform keystore, so the HttpOnly
/// refresh cookie is never written to disk in clear text.
class SecureCookieStorage implements Storage {
  SecureCookieStorage(this._storage, {this.prefix = 'quant_mail_cookie_'});

  final FlutterSecureStorage _storage;
  final String prefix;

  @override
  Future<void> init(bool persistSession, bool ignoreExpires) async {}

  @override
  Future<String?> read(String key) => _storage.read(key: '$prefix$key');

  @override
  Future<void> write(String key, String value) => _storage.write(key: '$prefix$key', value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: '$prefix$key');

  @override
  Future<void> deleteAll(List<String> keys) async {
    for (final String key in keys) {
      await _storage.delete(key: '$prefix$key');
    }
  }
}

/// The one cookie jar of the app. Login stores the refresh cookie here and
/// the API client replays it on `/auth/refresh`.
class QuantCookieJar {
  const QuantCookieJar._();

  static final CookieJar shared = PersistCookieJar(
    storage: SecureCookieStorage(
      const FlutterSecureStorage(
        aOptions: AndroidOptions(
          encryptedSharedPreferences: true,
          sharedPreferencesName: 'quant_mail_cookies',
          resetOnError: true,
        ),
      ),
    ),
  );
}
