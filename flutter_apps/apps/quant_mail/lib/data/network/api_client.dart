import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import '../repositories/repositories.dart';
import 'session_refresh_interceptor.dart';

/// The authenticated API client: shared cookie jar, bearer token, and the
/// one-shot refresh on 401 ([SessionRefreshInterceptor]).
Dio buildApiDio({
  required String baseUrl,
  required String origin,
  required SessionRepository session,
  required CookieJar cookieJar,
  HttpClientAdapter? httpClientAdapter,
}) {
  final Dio dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      sendTimeout: const Duration(seconds: 15),
      headers: <String, dynamic>{'Accept': 'application/json', 'Origin': origin},
    ),
  );
  if (httpClientAdapter != null) dio.httpClientAdapter = httpClientAdapter;
  dio.interceptors
    ..add(CookieManager(cookieJar))
    ..add(SessionRefreshInterceptor(session: session, dio: dio));
  return dio;
}
