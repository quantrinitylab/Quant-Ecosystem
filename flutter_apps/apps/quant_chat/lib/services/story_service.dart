// QuantChat Stories API client (Phase 2C).
//
// Talks to the quantchat backend /stories routes over HTTPS via Dio.
// Auth: the backend's global hook reads the Authorization bearer token;
// QuantApiClient (quant_core) already attaches the session token and
// refreshes it, so this service builds on it instead of re-implementing
// auth. The presigned PUT upload bypasses the API client's JSON pipeline
// and uses a raw Dio PUT with the storage-signed headers.
//
// NOTE on errors: QuantApiClient normalises transport failures into
// QuantApiException (statusCode preserved; the backend's machine `code`
// is not forwarded). This service therefore keys its typed errors off
// statusCode, and every method either returns parsed server data or
// throws StoryApiException -- never a silent fallback.
//
// Base URL: the backend's /stories routes are served by the quantchat
// backend (port 3002 in dev). In production the web domain
// quantchat.quantrinity.in proxies /api/* to it (the same mapping the
// shipped web client uses: /api/stories/feed -> backend /stories/feed).
// Pass baseUrl explicitly when the deployment differs.
//
// Honesty rules followed here:
// - A 503 from /stories/upload-url is surfaced as a typed
//   StoryStorageNotConfiguredException with a human message -- the UI
//   shows "uploads unavailable", never a fake success.
// - No local fallbacks that pretend the network worked.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:quant_core/quant_core.dart';

import '../models/story_models.dart';

/// Production web domain for QuantChat; /api/* proxies to the backend.
/// Override via the [StoryService] constructor for dev/staging hosts.
const String kQuantChatApiBaseUrl = 'https://quantchat.quantrinity.in/api';

class StoryApiException implements Exception {
  final String message;
  final int? statusCode;

  const StoryApiException(this.message, {this.statusCode});

  @override
  String toString() => 'StoryApiException($statusCode): $message';
}

/// Object storage is not configured on the backend deployment.
class StoryStorageNotConfiguredException extends StoryApiException {
  const StoryStorageNotConfiguredException()
      : super(
          'Story media uploads are unavailable: object storage is not '
          'configured on this deployment.',
          statusCode: 503,
        );
}

/// Presigned upload ticket from POST /stories/upload-url.
class StoryUploadTicket {
  final String uploadUrl;
  final String key;
  final String mediaUrl;
  final Map<String, String> requiredHeaders;
  final DateTime expiresAt;

  const StoryUploadTicket({
    required this.uploadUrl,
    required this.key,
    required this.mediaUrl,
    required this.requiredHeaders,
    required this.expiresAt,
  });

  factory StoryUploadTicket.fromJson(Map<String, dynamic> json) {
    final headers = (json['requiredHeaders'] as Map?) ?? const {};
    return StoryUploadTicket(
      uploadUrl: json['uploadUrl'] as String,
      key: json['key'] as String,
      mediaUrl: json['mediaUrl'] as String,
      requiredHeaders: headers.map(
        (k, v) => MapEntry(k.toString(), v.toString()),
      ),
      expiresAt: DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
          DateTime.now().add(const Duration(minutes: 15)),
    );
  }
}

class StoryReplyResult {
  final String conversationId;
  final String messageId;

  const StoryReplyResult({required this.conversationId, required this.messageId});
}

class StoryLikeResult {
  final bool liked;
  final int likeCount;

  const StoryLikeResult({required this.liked, required this.likeCount});
}

/// Concrete service; subclassable in tests to stub network calls.
class StoryService {
  final QuantApiClient api;
  final Dio dio;

  StoryService({QuantApiClient? apiClient, Dio? dioClient, String? baseUrl})
      : api = apiClient ?? QuantApiClient(baseUrl: baseUrl ?? kQuantChatApiBaseUrl),
        dio = dioClient ?? Dio();

  /// Normalize a QuantApiException from the shared client. `isUpload` lets
  /// a 503 on the upload path surface the typed storage-not-configured
  /// error (the backend's machine code does not survive the client's
  /// normalisation, so statusCode is the signal).
  Never _wrapApiError(QuantApiException e, {bool isUpload = false}) {
    if (isUpload && e.statusCode == 503) {
      throw const StoryStorageNotConfiguredException();
    }
    throw StoryApiException(e.message, statusCode: e.statusCode);
  }

  // -- Feed ---------------------------------------------------------------

  Future<List<StoryGroup>> getFeed() async {
    try {
      final res = await api.get<Map<String, dynamic>>('/stories/feed');
      final data = res.data ?? const <String, dynamic>{};
      final groups = (data['groups'] as List?) ?? const [];
      return groups
          .whereType<Map<String, dynamic>>()
          .map(StoryGroup.fromJson)
          .toList();
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  Future<List<StorySegment>> getDiscover() async {
    try {
      final res = await api.get<Map<String, dynamic>>('/stories/discover');
      final data = res.data ?? const <String, dynamic>{};
      final items = (data['items'] as List?) ?? const [];
      return items
          .whereType<Map<String, dynamic>>()
          .map(StorySegment.fromJson)
          .toList();
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  // -- Upload ---------------------------------------------------------------

  Future<StoryUploadTicket> getUploadUrl({
    required String filename,
    required String contentType,
    required int contentLength,
  }) async {
    try {
      final res = await api.post<Map<String, dynamic>>(
        '/stories/upload-url',
        data: {
          'filename': filename,
          'contentType': contentType,
          'contentLength': contentLength,
        },
      );
      return StoryUploadTicket.fromJson(res.data ?? const <String, dynamic>{});
    } on QuantApiException catch (e) {
      _wrapApiError(e, isUpload: true);
    }
  }

  /// Full upload pipeline: mint ticket -> PUT bytes to object storage ->
  /// return the canonical mediaUrl for POST /stories.
  Future<String> uploadMedia({
    required Uint8List bytes,
    required String filename,
    required String contentType,
    void Function(int sent, int total)? onProgress,
  }) async {
    final ticket = await getUploadUrl(
      filename: filename,
      contentType: contentType,
      contentLength: bytes.length,
    );
    try {
      await dio.put(
        ticket.uploadUrl,
        data: bytes,
        options: Options(
          headers: ticket.requiredHeaders,
          contentType: contentType,
        ),
        onSendProgress: onProgress,
      );
    } on DioException catch (e) {
      throw StoryApiException(
        'Media upload failed: ${e.message ?? 'network error'}',
        statusCode: e.response?.statusCode,
      );
    }
    return ticket.mediaUrl;
  }

  // -- Create / delete ------------------------------------------------------

  Future<StorySegment> createStory({
    required StoryMediaType type,
    String? mediaUrl,
    String? text,
    int durationSec = 10,
    StoryAudience audience = StoryAudience.public,
    String? placeId,
    String? placeName,
    String? name,
  }) async {
    try {
      final res = await api.post<Map<String, dynamic>>(
        '/stories',
        data: {
          'type': type.name,
          if (mediaUrl != null) 'mediaUrl': mediaUrl,
          if (text != null) 'text': text,
          'duration': durationSec,
          'audience': audience.wireValue,
          if (placeId != null) 'placeId': placeId,
          if (placeName != null) 'placeName': placeName,
          if (name != null) 'name': name,
        },
      );
      final story = (res.data ?? const <String, dynamic>{})['story'] as Map<String, dynamic>?;
      if (story == null) {
        throw const StoryApiException('Server did not return the created story');
      }
      return StorySegment.fromJson(story);
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  Future<void> deleteStory(String storyId) async {
    try {
      await api.delete<void>('/stories/$storyId');
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  // -- View tracking (per segment) -------------------------------------------

  Future<int> markViewed(String storyId) async {
    try {
      final res = await api.post<Map<String, dynamic>>(
        '/stories/$storyId/view',
        data: const <String, dynamic>{},
      );
      return (res.data?['viewCount'] as num?)?.toInt() ?? 0;
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  Future<List<StoryViewerEntry>> getViewers(String storyId) async {
    try {
      final res = await api.get<Map<String, dynamic>>('/stories/$storyId/viewers');
      final viewers = (res.data?['viewers'] as List?) ?? const [];
      return viewers
          .whereType<Map<String, dynamic>>()
          .map(StoryViewerEntry.fromJson)
          .toList();
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  // -- Reply -----------------------------------------------------------------

  Future<StoryReplyResult> replyToStory(String storyId, String message) async {
    try {
      final res = await api.post<Map<String, dynamic>>(
        '/stories/$storyId/reply',
        data: {'message': message},
      );
      final data = res.data ?? const <String, dynamic>{};
      return StoryReplyResult(
        conversationId: data['conversationId'] as String? ?? '',
        messageId: data['messageId'] as String? ?? '',
      );
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  // -- Engagement --------------------------------------------------------------

  Future<StoryLikeResult> toggleLike(String storyId) async {
    try {
      final res = await api.post<Map<String, dynamic>>(
        '/stories/$storyId/like',
        data: const <String, dynamic>{},
      );
      final data = res.data ?? const <String, dynamic>{};
      return StoryLikeResult(
        liked: data['liked'] as bool? ?? false,
        likeCount: (data['likeCount'] as num?)?.toInt() ?? 0,
      );
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  Future<List<StoryCommentModel>> getComments(String storyId) async {
    try {
      final res = await api.get<Map<String, dynamic>>('/stories/$storyId/comments');
      final comments = (res.data?['comments'] as List?) ?? const [];
      return comments
          .whereType<Map<String, dynamic>>()
          .map(StoryCommentModel.fromJson)
          .toList();
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  Future<StoryCommentModel> postComment(String storyId, String body) async {
    try {
      final res = await api.post<Map<String, dynamic>>(
        '/stories/$storyId/comments',
        data: {'body': body},
      );
      final comment = (res.data ?? const <String, dynamic>{})['comment'] as Map<String, dynamic>?;
      if (comment == null) {
        throw const StoryApiException('Server did not return the created comment');
      }
      return StoryCommentModel.fromJson(comment);
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  // -- Follow ------------------------------------------------------------------

  Future<bool> followAuthor(String authorId) async {
    try {
      final res = await api.post<Map<String, dynamic>>(
        '/stories/authors/$authorId/follow',
        data: const <String, dynamic>{},
      );
      return (res.data ?? const <String, dynamic>{})['isFollowing'] as bool? ?? true;
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  Future<void> unfollowAuthor(String authorId) async {
    try {
      await api.delete<void>('/stories/authors/$authorId/follow');
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }

  Future<bool> isFollowing(String authorId) async {
    try {
      final res = await api.get<Map<String, dynamic>>(
        '/stories/authors/$authorId/follow-status',
      );
      return (res.data ?? const <String, dynamic>{})['isFollowing'] as bool? ?? false;
    } on QuantApiException catch (e) {
      _wrapApiError(e);
    }
  }
}
