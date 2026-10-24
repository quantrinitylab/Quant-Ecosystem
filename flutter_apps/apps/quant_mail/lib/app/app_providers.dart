// Riverpod wiring: the only place that decides which repository the screens
// get. Screens read the repository providers and never construct Dio.

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/quant_api_config.dart';
import '../data/models/session_models.dart';
import '../data/network/api_client.dart';
import '../data/network/dio_mail_repository.dart';
import '../data/network/dio_session_repository.dart';
import '../data/network/secure_cookie_storage.dart';
import '../data/repositories/repositories.dart';
import '../data/sample/sample_mail_repository.dart';
import '../services/quant_auth_controller.dart';
import '../services/quant_auth_service.dart';

/// True in debug builds only. Overridable in tests to prove the guard.
final Provider<bool> debugModeProvider = Provider<bool>((Ref ref) => kDebugMode);

/// Current time. Overridable so day headers and row times are deterministic in tests.
final Provider<DateTime Function()> clockProvider = Provider<DateTime Function()>((Ref ref) => DateTime.now);

/// Runtime switch for sample data. Default OFF on every launch (not
/// persisted). It cannot be turned on outside debug builds.
class SampleDataSwitch extends Notifier<bool> {
  @override
  bool build() => false;

  void set(bool value) {
    if (!ref.read(debugModeProvider)) {
      state = false;
      return;
    }
    state = value;
  }
}

final NotifierProvider<SampleDataSwitch, bool> sampleDataSwitchProvider =
    NotifierProvider<SampleDataSwitch, bool>(SampleDataSwitch.new);

/// Sample data is active only when this is a debug build AND the switch is
/// on. Screens show the "Sample data (debug)" banner whenever this is true.
final Provider<bool> sampleDataActiveProvider = Provider<bool>((Ref ref) {
  return ref.watch(debugModeProvider) && ref.watch(sampleDataSwitchProvider);
});

final Provider<QuantAuthService> quantAuthServiceProvider =
    Provider<QuantAuthService>((Ref ref) => QuantAuthController.instance.authService);

final Provider<CookieJar> cookieJarProvider = Provider<CookieJar>((Ref ref) => QuantCookieJar.shared);

final Provider<SessionRepository> sessionRepositoryProvider = Provider<SessionRepository>((Ref ref) {
  final DioSessionRepository repo = DioSessionRepository(
    authService: ref.watch(quantAuthServiceProvider),
    cookieJar: ref.watch(cookieJarProvider),
    baseUrl: QuantApiConfig.baseUrl,
    origin: QuantApiConfig.origin,
  );
  ref.onDispose(repo.dispose);
  return repo;
});

/// Current session, updated when the user signs in or the app ends the session.
class SessionStateNotifier extends Notifier<SessionState> {
  @override
  SessionState build() {
    final SessionRepository repo = ref.watch(sessionRepositoryProvider);
    final sub = repo.changes.listen((SessionState s) => state = s);
    ref.onDispose(sub.cancel);
    return repo.state;
  }
}

final NotifierProvider<SessionStateNotifier, SessionState> sessionStateProvider =
    NotifierProvider<SessionStateNotifier, SessionState>(SessionStateNotifier.new);

/// Authenticated Dio (cookie jar, bearer, one refresh on 401).
final Provider<Dio> apiDioProvider = Provider<Dio>((Ref ref) {
  final Dio dio = buildApiDio(
    baseUrl: QuantApiConfig.baseUrl,
    origin: QuantApiConfig.origin,
    session: ref.watch(sessionRepositoryProvider),
    cookieJar: ref.watch(cookieJarProvider),
  );
  ref.onDispose(() => dio.close(force: true));
  return dio;
});

/// Repository selection. Sample data only in debug builds with the switch on;
/// otherwise always the real API.
final Provider<MailRepository> mailRepositoryProvider = Provider<MailRepository>((Ref ref) {
  if (ref.watch(sampleDataActiveProvider)) return SampleMailRepository();
  return DioMailRepository(ref.watch(apiDioProvider));
});

final Provider<FolderRepository> folderRepositoryProvider = Provider<FolderRepository>((Ref ref) {
  if (ref.watch(sampleDataActiveProvider)) return const SampleFolderRepository();
  return DioFolderRepository(ref.watch(apiDioProvider));
});
