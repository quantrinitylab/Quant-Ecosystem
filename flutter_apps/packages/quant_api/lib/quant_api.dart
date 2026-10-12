import 'package:flutter/foundation.dart';

/// Thrown by every data method in this package.
///
/// This package has NO network transport wired into it. Until a real
/// transport exists, every call fails closed with this exception instead
/// of returning simulated data. Returning canned success (the previous
/// behaviour) made callers believe mail was fetched/sent when nothing
/// ever left the device — see QC-F-027.
class QuantApiNotConnectedException implements Exception {
  final String operation;

  const QuantApiNotConnectedException(this.operation);

  @override
  String toString() =>
      'QuantApiNotConnectedException: $operation cannot run — package:quant_api '
      'has no network transport wired. Use the real Dio client in '
      'package:quant_core (QuantApiClient) instead. No data was sent or received.';
}

/// Legacy Quant API client — FAIL-CLOSED stub.
///
/// WARNING: this client performs no network I/O and has no transport.
/// It previously simulated one (canned `{'status': 'ok'}` responses and a
/// hardcoded inbox with invented people), which was a builder trap: any
/// app wiring it up looked alive while talking to nobody (QC-F-027).
///
/// The real, production client is `QuantApiClient` in
/// `package:quant_core` (Dio-based, token refresh, real endpoints).
/// Do not build new features on this package; if it is ever revived it
/// must be reimplemented on top of a real transport, never on fixtures.
class QuantApiClient {
  final String baseUrl;
  String? _bearerToken;

  QuantApiClient({
    this.baseUrl = 'https://quantmail.in/api',
    String? token,
  }) : _bearerToken = token;

  void setToken(String? token) {
    _bearerToken = token;
  }

  /// The configured bearer token, if any. Token storage itself is not a
  /// network operation, so it stays functional; only data calls fail.
  String? get bearerToken => _bearerToken;

  /// Always throws [QuantApiNotConnectedException] — there is no
  /// transport, so there is no honest value this could return.
  Future<Map<String, dynamic>> get(String endpoint) async {
    debugPrint('[QuantApi GET] $baseUrl$endpoint — NOT CONNECTED, failing closed');
    throw QuantApiNotConnectedException('GET $endpoint');
  }

  /// Always throws [QuantApiNotConnectedException] — there is no
  /// transport, so reporting success would be fabricated.
  Future<Map<String, dynamic>> post(String endpoint, Map<String, dynamic> body) async {
    debugPrint('[QuantApi POST] $baseUrl$endpoint — NOT CONNECTED, failing closed');
    throw QuantApiNotConnectedException('POST $endpoint');
  }
}

/// QuantMail API layer — FAIL-CLOSED (see [QuantApiClient]).
///
/// Previously [fetchInbox] returned a hardcoded inbox of invented
/// threads (fictional senders presented as real mail) and
/// [sendEmail]/[triageThread] reported success for mail that was never
/// sent. All of that is removed: every method now throws
/// [QuantApiNotConnectedException] until a real transport is wired.
class QuantMailApi {
  final QuantApiClient client;

  QuantMailApi(this.client);

  /// Always throws [QuantApiNotConnectedException]. An empty list would
  /// also be a lie (it would claim the inbox is empty), so this fails
  /// loudly instead of returning fabricated or empty data.
  Future<List<Map<String, dynamic>>> fetchInbox({String lens = 'all'}) async {
    throw QuantApiNotConnectedException('fetchInbox(lens: $lens)');
  }

  /// Always throws [QuantApiNotConnectedException] via the client —
  /// mail is only reported sent once a real transport confirms it.
  Future<bool> sendEmail({
    required List<String> to,
    required String subject,
    required String body,
  }) async {
    await client.post('/mail/send', {
      'to': to,
      'subject': subject,
      'body': body,
    });
    // Unreachable while the client fails closed; kept so a future real
    // transport returning normally means the server accepted the send.
    return true;
  }

  /// Always throws [QuantApiNotConnectedException] via the client.
  Future<bool> triageThread(String threadId, String action) async {
    await client.post('/mail/threads/$threadId/triage', {'action': action});
    // Unreachable while the client fails closed (see [sendEmail]).
    return true;
  }
}
