// ============================================================================
// quant_core - search API surface (Search slice: W1, quant_core lane)
// ============================================================================
//
// Typed client for the three `/search` endpoints of the repaired spec
// (`~/workspace/quantmail-omnipresent/phase0/openapi.repaired.yaml`,
// L23380–L23520): `GET /search/emails` (getSearchEmails), `GET /search/all`
// (getSearchAll) and `GET /search/parse` (getSearchParse).
//
// Envelope honesty: all three document a generic `SuccessWrapper` 200 with
// NO confirmed inner data shape, so every parse here is defensive:
//   * `/search/emails` reuses the `PaginatedEmails` envelope path
//     (`QuantApiClient.getEnvelope`) — the same shape as `GET /emails` and
//     the sibling `GET /emails/search`, which returns an array-shaped
//     `data`. If the backend deviates, `PaginatedEmails.fromJson` degrades
//     to an empty page rather than throwing.
//   * `/search/all` accepts `data` as a List OR as a Map carrying the items
//     under `items`/`results`/`emails`/`hits`; anything else -> empty hits.
//   * `/search/parse` accepts the interpretation under `data` (or the bare
//     body) and reads `terms`/`operators`/`suggestions` best-effort.
// // TODO(UNVERIFIED): confirm the exact 200 data shapes for all three
// endpoints against the live backend; current shapes are inferred from the
// generic SuccessWrapper annotation + the sibling /emails/search envelope.

import 'package:quant_core/src/mail/models/email.dart';
import 'package:quant_core/src/mail/models/pagination.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// One hit from the omni (`/search/all`) cross-app search.
///
/// Only mail hits (`kind == 'email'`) get rich mapping into [Email]; every
/// other kind is an honest stub (title/subtitle/refId extracted
/// best-effort, [email] left null) — never invented data.
class SearchHit {
  /// Creates a search hit.
  const SearchHit({
    required this.kind,
    required this.title,
    this.subtitle,
    this.refId,
    this.email,
  });

  /// Best-effort source kind: `email`, `drive`, `document`, or `unknown`
  /// when the backend did not say.
  final String kind;

  /// Display title (subject / name / filename, depending on kind).
  final String title;

  /// Display subtitle (snippet / path / sender), if the hit carried one.
  final String? subtitle;

  /// Backend id for deep-linking into the owning app, if the hit had one.
  final String? refId;

  /// Rich mail mapping — non-null only for `email` hits whose payload
  /// parsed as a valid [Email].
  final Email? email;

  @override
  String toString() => 'SearchHit(kind: $kind, title: $title, refId: $refId)';
}

/// Defensive parse of the `/search/parse` structured interpretation.
///
/// Field reads are best-effort: `terms` from `terms`/`tokens`/`keywords`,
/// operator map from `operators`/`filters`/`parsed`, `suggestions` from
/// `suggestions`/`chips`. Unknown or malformed fields degrade to empty
/// rather than throwing.
// TODO(UNVERIFIED): exact field names of the parse response are unconfirmed
// (generic SuccessWrapper); update when the live contract is known.
class ServerQueryInterpretation {
  /// Creates an interpretation.
  const ServerQueryInterpretation({
    required this.raw,
    this.terms = const <String>[],
    this.operators = const <String, String>{},
    this.suggestions = const <String>[],
  });

  /// The query text this interpretation is about.
  final String raw;

  /// Free-text terms the server extracted.
  final List<String> terms;

  /// Structured operator map the server extracted (values stringified).
  final Map<String, String> operators;

  /// Suggested refinements / chip labels from the server.
  final List<String> suggestions;

  /// Parses from the decoded envelope body (the `data` map when the body
  /// is an envelope, else the body itself).
  factory ServerQueryInterpretation.fromJson(
    String raw,
    Map<String, dynamic> json,
  ) {
    return ServerQueryInterpretation(
      raw: raw,
      terms: _stringList(json, const ['terms', 'tokens', 'keywords']),
      operators: _stringMap(json, const ['operators', 'filters', 'parsed']),
      suggestions:
          _stringList(json, const ['suggestions', 'chips', 'refinements']),
    );
  }

  @override
  String toString() =>
      'ServerQueryInterpretation(terms: $terms, operators: $operators, '
      'suggestions: $suggestions)';

  static List<String> _stringList(
    Map<String, dynamic> json,
    List<String> keys,
  ) {
    for (final key in keys) {
      final value = json[key];
      if (value is List) {
        return value.whereType<String>().toList();
      }
    }
    return const <String>[];
  }

  static Map<String, String> _stringMap(
    Map<String, dynamic> json,
    List<String> keys,
  ) {
    for (final key in keys) {
      final value = json[key];
      if (value is Map) {
        final out = <String, String>{};
        value.forEach((k, v) {
          if (k is String && v != null) out[k] = v.toString();
        });
        return out;
      }
    }
    return const <String, String>{};
  }
}

/// Typed client for the `/search` surface of the QuantMail backend.
///
/// Mirrors the `EmailsApi` conventions: failures propagate as
/// [ApiResult.failure] (never raw throws), `pageSize` is clamped to the
/// spec range 1–100, and envelope parsing never throws on unknown shapes.
class SearchApi {
  /// Creates a [SearchApi] backed by [client].
  SearchApi(this._client);

  final QuantApiClient _client;

  /// Fallback when a failed [ApiResult] carries no [ApiError].
  static ApiError _errorOf(ApiResult<dynamic> result) =>
      result.error ??
      const ApiError(
        code: 'EMPTY_ERROR',
        message: 'Request failed without an error payload',
        statusCode: 0,
      );

  /// Gmail-style advanced search over the user's mail.
  ///
  /// Spec: `GET /search/emails` (getSearchEmails, L23452) — required `q`
  /// (minLength 1). `page`/`pageSize` are sent as additional parameters
  /// following the sibling `GET /emails/search` convention (which documents
  /// only `q`, and `GET /emails` accepts the pagination shape).
  /// // TODO(UNVERIFIED): confirm pagination params on /search/emails.
  ///
  /// Uses [QuantApiClient.getEnvelope]: the envelope's `data` is an array
  /// (same shape as `GET /emails`), parsed by [PaginatedEmails.fromJson].
  Future<ApiResult<PaginatedEmails>> searchMail(
    String query, {
    int page = 1,
    int pageSize = 25,
  }) async {
    final result = await _client.getEnvelope(
      '/search/emails',
      queryParameters: <String, dynamic>{
        'q': query,
        'page': page,
        'pageSize': pageSize.clamp(1, 100),
      },
    );
    if (result.success && result.data != null) {
      return ApiResult<PaginatedEmails>.ok(
        PaginatedEmails.fromJson(result.data!),
      );
    }
    return ApiResult<PaginatedEmails>.failure(_errorOf(result));
  }

  /// Omni cross-app search across emails, drive files and documents.
  ///
  /// Spec: `GET /search/all` (getSearchAll, L23380) — required `q`
  /// (minLength 1). The inner data shape is unconfirmed (generic
  /// `SuccessWrapper`), so parsing is fully defensive: `data` as a List,
  /// or a Map carrying the list under `items`/`results`/`emails`/`hits` —
  /// anything else yields an empty hit list (never a throw).
  /// // TODO(UNVERIFIED): confirm /search/all data shape.
  Future<ApiResult<List<SearchHit>>> searchOmni(String query) async {
    final result = await _client.getEnvelope(
      '/search/all',
      queryParameters: <String, dynamic>{'q': query},
    );
    if (!result.success || result.data == null) {
      return ApiResult<List<SearchHit>>.failure(_errorOf(result));
    }
    return ApiResult<List<SearchHit>>.ok(_parseHits(result.data!));
  }

  /// Structured interpretation of a query for query builders / UI chips,
  /// without hitting the database.
  ///
  /// Spec: `GET /search/parse` (getSearchParse, L23486) — required `q`
  /// (minLength 1, maxLength 1000). The local [SearchQuery] parse is the
  /// always-available truth; this is an online enhancement only.
  Future<ApiResult<ServerQueryInterpretation>> parseQuery(String query) async {
    final result = await _client.get<Map<String, dynamic>>(
      '/search/parse',
      queryParameters: <String, dynamic>{'q': query},
    );
    if (!result.success || result.data == null) {
      return ApiResult<ServerQueryInterpretation>.failure(_errorOf(result));
    }
    final body = result.data!;
    final data = body['data'];
    final shape = data is Map<String, dynamic> ? data : body;
    return ApiResult<ServerQueryInterpretation>.ok(
      ServerQueryInterpretation.fromJson(query, shape),
    );
  }

  /// Defensive hit-list extraction from the `/search/all` envelope.
  static List<SearchHit> _parseHits(Map<String, dynamic> envelope) {
    final data = envelope['data'];
    List<dynamic>? items;
    if (data is List) {
      items = data;
    } else if (data is Map<String, dynamic>) {
      for (final key in const ['items', 'results', 'emails', 'hits']) {
        final candidate = data[key];
        if (candidate is List) {
          items = candidate;
          break;
        }
      }
    }
    if (items == null) return const <SearchHit>[];
    return items.whereType<Map<String, dynamic>>().map(_parseHit).toList();
  }

  /// Parses one omni hit. Mail hits get a best-effort rich [Email] mapping
  /// (non-throwing); everything else is an honest stub.
  static SearchHit _parseHit(Map<String, dynamic> json) {
    final kind = _firstString(json, const ['kind', 'type', 'source']) ??
        'unknown';
    final refId = _firstString(json, const ['id', 'refId', 'ref']);
    if (kind == 'email') {
      Email? email;
      try {
        email = Email.fromJson(json);
      } catch (_) {
        email = null; // honest stub fallback below
      }
      if (email != null) {
        final subject = email.subject;
        return SearchHit(
          kind: kind,
          title: (subject == null || subject.isEmpty)
              ? '(no subject)'
              : subject,
          subtitle: _senderLabel(email),
          refId: refId ?? email.id,
          email: email,
        );
      }
    }
    return SearchHit(
      kind: kind,
      title: _firstString(json, const ['title', 'name', 'subject']) ?? kind,
      subtitle:
          _firstString(json, const ['subtitle', 'snippet', 'description']),
      refId: refId,
    );
  }

  static String? _firstString(
    Map<String, dynamic> json,
    List<String> keys,
  ) {
    for (final key in keys) {
      final value = json[key];
      if (value is String && value.isNotEmpty) return value;
    }
    return null;
  }

  /// Best-effort sender label for a mail hit subtitle. Never invents model
  /// fields — uses only documented [Email]/[EmailAddress] members
  /// (`Email.from` is non-nullable, `EmailAddress.name` nullable).
  static String? _senderLabel(Email email) {
    final name = email.from.name;
    if (name != null && name.isNotEmpty) return name;
    return email.from.email.isEmpty ? null : email.from.email;
  }
}
