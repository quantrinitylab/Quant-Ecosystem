import 'dart:convert';
import 'package:flutter/foundation.dart';

/// Core Quant API Network Client
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

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (_bearerToken != null) 'Authorization': 'Bearer $_bearerToken',
      };

  /// Simulated / Fastify REST request wrapper
  Future<Map<String, dynamic>> get(String endpoint) async {
    debugPrint('[QuantApi GET] $baseUrl$endpoint');
    return {'status': 'ok', 'endpoint': endpoint};
  }

  Future<Map<String, dynamic>> post(String endpoint, Map<String, dynamic> body) async {
    debugPrint('[QuantApi POST] $baseUrl$endpoint with body: ${jsonEncode(body)}');
    return {'status': 'ok', 'data': body};
  }
}

/// QuantMail Dedicated API Layer
class QuantMailApi {
  final QuantApiClient client;

  QuantMailApi(this.client);

  Future<List<Map<String, dynamic>>> fetchInbox({String lens = 'all'}) async {
    // In production, hits Fastify /mail/threads?lens=$lens
    return [
      {
        'id': 'th-001',
        'sender': 'Alex Mercer',
        'senderEmail': 'alex@trinity.lab',
        'subject': 'Wave 76 Flutter Omni-Presence Architecture Released',
        'snippet': 'The Flutter client is compiling across all devices with zero compromises...',
        'timestamp': '10:42 AM',
        'isUnread': true,
        'category': 'priority',
      },
      {
        'id': 'th-002',
        'sender': 'GitHub CI/CD',
        'senderEmail': 'notifications@github.com',
        'subject': 'Build Succeeded: PR #349 Monorepo Cleanse',
        'snippet': 'All unit and regression tests passed 100% green across 14 services...',
        'timestamp': '09:15 AM',
        'isUnread': false,
        'category': 'updates',
      },
      {
        'id': 'th-003',
        'sender': 'Sundar Pichai',
        'senderEmail': 'sundar@google.com',
        'subject': 'Sync regarding Sovereign Search & E2EE Standards',
        'snippet': 'Impressive work on the <5ms FTS5 index and FastCDC vault architecture...',
        'timestamp': 'Yesterday',
        'isUnread': true,
        'category': 'priority',
      },
    ];
  }

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
    return true;
  }

  Future<bool> triageThread(String threadId, String action) async {
    await client.post('/mail/threads/$threadId/triage', {'action': action});
    return true;
  }
}
