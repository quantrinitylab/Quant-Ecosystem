import 'dart:math';

import 'package:dio/dio.dart';

import '../mail_exception.dart';
import '../models/mail_models.dart';
import '../repositories/repositories.dart';

/// New Idempotency-Key (`[\w\-]{1,128}`): 128 random bits as hex.
String newIdempotencyKey([Random? random]) {
  final Random r = random ?? Random.secure();
  final StringBuffer b = StringBuffer();
  for (int i = 0; i < 16; i++) {
    b.write(r.nextInt(256).toRadixString(16).padLeft(2, '0'));
  }
  return b.toString();
}

/// Runs [body] and maps every failure to a [MailException].
Future<T> guardApi<T>(Future<T> Function() body) async {
  try {
    return await body();
  } on MailException {
    rethrow;
  } on DioException catch (e) {
    throw MailException.fromDio(e);
  } on Object {
    // Parsing or casting a response that does not match the contract.
    throw const MailException(MailErrorKind.unexpected);
  }
}

/// Returns the response body when it is the success envelope.
Map<dynamic, dynamic> successEnvelope(Response<dynamic> response) {
  final Object? body = response.data;
  if (body is Map && body['success'] == true) return body;
  throw const MailException(MailErrorKind.unexpected);
}

/// Real implementation of [MailRepository] against `GET/POST /emails`,
/// `/threads` (contracts.md sections 2 to 5).
class DioMailRepository implements MailRepository {
  DioMailRepository(this._dio);

  final Dio _dio;

  Options _mutation(String? key) =>
      Options(headers: <String, dynamic>{'Idempotency-Key': key ?? newIdempotencyKey()});

  @override
  Future<MailPage> list(MailView view, {String? cursor, int pageSize = 30}) {
    return guardApi(() async {
      final Response<dynamic> response = await _dio.get<dynamic>(
        '/emails',
        queryParameters: <String, dynamic>{
          ...view.query,
          'pageSize': pageSize,
          if (cursor != null) 'cursor': cursor,
        },
      );
      final Map<dynamic, dynamic> body = successEnvelope(response);
      final Object? data = body['data'];
      if (data is! List) throw const MailException(MailErrorKind.unexpected);
      final Object? next = body['nextCursor'];
      return MailPage(
        items: data.whereType<Map<dynamic, dynamic>>().map(MailMessage.fromJson).toList(),
        nextCursor: next is String && next.isNotEmpty ? next : null,
        page: body['page'] is num ? (body['page'] as num).toInt() : 1,
        totalPages: body['totalPages'] is num ? (body['totalPages'] as num).toInt() : null,
        totalCount: body['totalCount'] is num ? (body['totalCount'] as num).toInt() : null,
        unreadCount: body['unreadCount'] is num ? (body['unreadCount'] as num).toInt() : null,
      );
    });
  }

  @override
  Future<MailCounts> counts(MailView view) async {
    final MailPage page = await list(view, pageSize: 1);
    return MailCounts(totalCount: page.totalCount, unreadCount: page.unreadCount);
  }

  @override
  Future<MailConversation> getConversation(String id) {
    return guardApi(() async {
      final Response<dynamic> response = await _dio.get<dynamic>('/threads/${Uri.encodeComponent(id)}');
      final Object? data = successEnvelope(response)['data'];
      if (data is! Map) throw const MailException(MailErrorKind.unexpected);
      return MailConversation.fromJson(data);
    });
  }

  @override
  Future<void> markThreadRead(String id) {
    return guardApi(() async {
      await _dio.post<dynamic>(
        '/threads/${Uri.encodeComponent(id)}/read',
        data: <String, dynamic>{},
        options: _mutation(null),
      );
    });
  }

  @override
  Future<int> applyBatch(MailBatchAction action, List<String> emailIds, {String? idempotencyKey}) {
    return guardApi(() async {
      final Response<dynamic> response = await _dio.post<dynamic>(
        '/emails/batch',
        data: <String, dynamic>{'action': action.wire, 'emailIds': emailIds},
        options: _mutation(idempotencyKey),
      );
      final Object? data = successEnvelope(response)['data'];
      final Object? count = data is Map ? data['count'] : null;
      return count is num ? count.toInt() : 0;
    });
  }

  @override
  Future<void> unarchive(String emailId, {String? idempotencyKey}) {
    return guardApi(() async {
      await _dio.post<dynamic>(
        '/emails/${Uri.encodeComponent(emailId)}/unarchive',
        data: <String, dynamic>{},
        options: _mutation(idempotencyKey),
      );
    });
  }

  @override
  Future<void> restore(String emailId, {String? idempotencyKey}) {
    return guardApi(() async {
      await _dio.post<dynamic>(
        '/emails/${Uri.encodeComponent(emailId)}/restore',
        data: <String, dynamic>{},
        options: _mutation(idempotencyKey),
      );
    });
  }
}

/// Real implementation of [FolderRepository] (`GET /folders`, `GET /labels`).
class DioFolderRepository implements FolderRepository {
  DioFolderRepository(this._dio);

  final Dio _dio;

  @override
  Future<List<MailFolder>> folders() {
    return guardApi(() async {
      final Response<dynamic> response = await _dio.get<dynamic>('/folders');
      final Object? data = successEnvelope(response)['data'];
      if (data is! List) throw const MailException(MailErrorKind.unexpected);
      return data.whereType<Map<dynamic, dynamic>>().map(MailFolder.fromJson).toList();
    });
  }

  @override
  Future<List<MailLabel>> labels() {
    return guardApi(() async {
      final Response<dynamic> response = await _dio.get<dynamic>('/labels');
      final Object? data = successEnvelope(response)['data'];
      if (data is! List) throw const MailException(MailErrorKind.unexpected);
      return data.whereType<Map<dynamic, dynamic>>().map(MailLabel.fromJson).toList();
    });
  }
}
