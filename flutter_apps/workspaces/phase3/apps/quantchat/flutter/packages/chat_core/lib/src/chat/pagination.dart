// ============================================================================
// chat_core - paginated envelope model (QuantChat, shift 2 / W2)
//
// The QuantChat API returns paginated collections for `listConversations`
// (`GET /conversations`, query `page` >= 1, `pageSize` 1..100) and
// `listMessages` (`GET /conversations/{id}/messages`). The spec gives the
// query params but no body schemas; the canonical envelope is
// `{success, data}` where `data` is sometimes a bare list and sometimes an
// object carrying the items plus paging info. [Paginated.fromJson] handles
// both shapes defensively.
// ============================================================================

/// A page of [T] items from a list endpoint.
///
/// TODO(UNVERIFIED): envelope internals (`items`, `page`, `pageSize`,
/// `total`, `hasMore`) are assumed — the spec has no response body schemas.
class Paginated<T> {
  /// Items on this page (empty when the payload shape is unrecognised).
  final List<T> items;

  /// 1-based page number of this page.
  final int page;

  /// Requested page size (echoed back, or inferred from [items]).
  final int pageSize;

  /// Total item count across all pages, when the server reports one.
  final int? total;

  /// Whether another page is expected after this one.
  final bool hasMore;

  /// Creates a page.
  const Paginated(
    this.items, {
    this.page = 1,
    this.pageSize = 20,
    this.total,
    this.hasMore = false,
  });

  /// Defensive parse of a `{success, data}` envelope (or a bare payload).
  ///
  /// `data` may be a bare [List] (single page of items) or a [Map] carrying
  /// the items under `items` (falling back to `data` / `results`) plus
  /// `page`, `pageSize`, `total`, `hasMore`. Anything else yields an empty
  /// page; never throws.
  factory Paginated.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) itemFromJson,
  ) {
    final dynamic payload =
        json.containsKey('data') ? json['data'] : json;

    if (payload is List) {
      final List<T> items = _parseItems(payload, itemFromJson);
      return Paginated<T>(
        items,
        page: 1,
        pageSize: items.length,
        total: items.length,
        hasMore: false,
      );
    }

    if (payload is Map) {
      final Map<String, dynamic> map = payload is Map<String, dynamic>
          ? payload
          : Map<String, dynamic>.from(payload);
      final dynamic rawItems =
          map['items'] ?? map['data'] ?? map['results'];
      final List<T> items = rawItems is List
          ? _parseItems(rawItems, itemFromJson)
          : <T>[];
      final int page = _parseInt(map['page'], fallback: 1);
      final bool hasExplicitPageSize =
          map['pageSize'] is num || map['perPage'] is num;
      final int pageSize = _parseInt(
        map['pageSize'] ?? map['perPage'],
        fallback: items.length,
      );
      final int? total = map['total'] is num
          ? (map['total']! as num).toInt()
          : int.tryParse(map['total']?.toString() ?? '');
      final bool hasMore = map['hasMore'] is bool
          ? map['hasMore']! as bool
          : total != null
              ? page * pageSize < total
              : hasExplicitPageSize && items.length >= pageSize;

      return Paginated<T>(
        items,
        page: page,
        pageSize: pageSize,
        total: total,
        hasMore: hasMore,
      );
    }

    return Paginated<T>(
      <T>[],
      page: 1,
      pageSize: 20,
      hasMore: false,
    );
  }

  static List<T> _parseItems<T>(
    List<dynamic> raw,
    T Function(Map<String, dynamic>) itemFromJson,
  ) {
    final List<T> items = <T>[];
    for (final dynamic element in raw) {
      if (element is Map<String, dynamic>) {
        items.add(itemFromJson(element));
      } else if (element is Map) {
        items.add(itemFromJson(Map<String, dynamic>.from(element)));
      }
    }
    return items;
  }

  static int _parseInt(dynamic value, {required int fallback}) {
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? fallback;
    return fallback;
  }
}
