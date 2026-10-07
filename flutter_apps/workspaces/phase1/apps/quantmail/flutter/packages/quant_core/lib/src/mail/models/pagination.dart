/// Pagination models for the mail list endpoints.
///
/// Envelope shape grounded in the repaired OpenAPI `PaginatedEmails` schema:
///
/// ```json
/// { "success": true, "data": [ ... ], "pagination": { "page": 1, "pageSize": 20, "total": 137 } }
/// ```

library;

import 'email.dart';

/// Offset/page cursor metadata for a list response.
class PageInfo {
  /// Creates pagination metadata.
  const PageInfo({
    this.page = 1,
    this.pageSize = 20,
    this.total = 0,
  });

  /// Parses from the `pagination` object of the API envelope.
  ///
  /// Missing keys fall back to defaults so a partial response still
  /// yields a usable (empty) page.
  factory PageInfo.fromJson(Map<String, dynamic> json) {
    return PageInfo(
      page: (json['page'] as num?)?.toInt() ?? 1,
      pageSize: (json['pageSize'] as num?)?.toInt() ?? 20,
      total: (json['total'] as num?)?.toInt() ?? 0,
    );
  }

  /// 1-based page index.
  final int page;

  /// Number of items requested per page.
  final int pageSize;

  /// Total items available across all pages, per the backend.
  final int total;

  /// Whether at least one more page is expected.
  bool get hasMore => page * pageSize < total;

  /// Serializes back to the wire shape.
  Map<String, dynamic> toJson() => <String, dynamic>{
        'page': page,
        'pageSize': pageSize,
        'total': total,
      };

  @override
  String toString() => 'PageInfo(page: $page, pageSize: $pageSize, total: $total)';
}

/// A page of emails wrapped in the API envelope.
class PaginatedEmails {
  /// Creates a paginated email result.
  const PaginatedEmails({
    required this.emails,
    required this.pageInfo,
    this.success = true,
  });

  /// Parses the full API envelope `{success, data, pagination}`.
  ///
  /// A missing `data` array yields an empty list; a missing `pagination`
  /// object yields default [PageInfo].
  factory PaginatedEmails.fromJson(Map<String, dynamic> envelope) {
    final data = envelope['data'];
    final pagination = envelope['pagination'];
    return PaginatedEmails(
      success: envelope['success'] == true,
      emails: data is List
          ? data
              .whereType<Map<String, dynamic>>()
              .map(Email.fromJson)
              .toList()
          : const [],
      pageInfo: pagination is Map<String, dynamic>
          ? PageInfo.fromJson(pagination)
          : const PageInfo(),
    );
  }

  /// Whether the backend reported success for this response.
  final bool success;

  /// Emails on this page.
  final List<Email> emails;

  /// Pagination metadata for this page.
  final PageInfo pageInfo;

  /// Whether another page can be fetched after this one.
  bool get hasMore => pageInfo.hasMore;

  /// An empty result, e.g. for error fallbacks.
  static const empty = PaginatedEmails(
    emails: [],
    pageInfo: PageInfo(),
    success: false,
  );
}
