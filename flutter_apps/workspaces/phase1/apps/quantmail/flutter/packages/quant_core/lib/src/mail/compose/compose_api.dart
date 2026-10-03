// ============================================================================
// quant_core - compose API surface (M7: compose core, W2)
//
// Hand-written API layer over the phase-0 repaired OpenAPI spec for the
// compose/send endpoints.
//
// Spec refs (~/workspace/quantmail-omnipresent/phase0/openapi.repaired.yaml):
// - `POST /emails/compose` .......... L17853 (`postEmailsCompose`,
//   "Unified composer contract (M07)"), requestBody "Validated by
//   composeSchema", BearerAuth, 200 `SuccessWrapper` / 400 / 401.
// - `POST /emails/{id}/send` ........ L18675 (`postEmailsbyIdSend`,
//   "durably queue an owned draft for delivery"), 200/400/404/401.
// - `POST /emails/{id}/cancel-send` . L18236 (`postEmailsbyIdCancelSend`),
//   201 `SuccessWrapper` / 400/404/401.
// - `POST /emails/{id}/undo-send` ... L18922 (`postEmailsbyIdUndoSend`),
//   201 `SuccessWrapper` / 400/404/401.
//
// Payload honesty: the repaired spec's `composeSchema` (L24509) is
// AI-flavored (`instructions` required; `tone`/`length`/`recipient`/
// `subject`/`intent` optional) — a likely repair artifact for the compose
// endpoint, NOT a verified email-send payload. [ComposeRequest.toJson]
// therefore carries an explicit TODO(UNVERIFIED) marking its wire field
// mapping provisional; the endpoint PATHS above are real (verified from
// the spec), the body shape is not. Every parse below is defensive —
// never assume a `data` shape; never throw on shape drift.
//
// 30s server-held undo (backend-verified fact, backend-prep shift,
// board 2026-10-03): the delayed-send + BullMQ path is REAL. So an
// HTTP 200 on [sendDraft] is ACCEPTED-not-delivered — the message sits in
// the undo window, and [undoSend] (or the outbox's `undoSend` op) can
// still pull it back (Superhuman steal, adopted).
import 'package:quant_foundation/quant_foundation.dart';

import 'compose_request.dart';

/// Hand-written API layer for the compose/send endpoints.
///
/// Response envelope: the client unwraps `{success, data}` automatically;
/// `data` shapes are unspecified in the spec, so parsing is defensive.
class ComposeApi {
  /// Creates the API layer over [client].
  const ComposeApi(this._client);

  final QuantApiClient _client;

  /// Sends the composed message.
  ///
  /// Spec: `POST /emails/compose` (L17853). Request body is
  /// [ComposeRequest.toJson] — see its TODO(UNVERIFIED): the wire field
  /// mapping is provisional pending verification of the real compose zod
  /// schema against backend source.
  ///
  /// 200 `SuccessWrapper`; 400 validation / 401 auth failures surface as
  /// [ApiResult.failure]. The returned map is the envelope's `data` (or
  /// `{}` when `data` has an unexpected shape — defensive, never throws).
  Future<ApiResult<Map<String, dynamic>>> compose(
    ComposeRequest request,
  ) =>
      composeRaw(request.toJson());

  /// Sends a raw compose body.
  ///
  /// The outbox drainer uses this for payload passthrough: the exact JSON
  /// stored at enqueue time is re-sent byte-equivalent, never
  /// re-serialized from a model (see [ComposeService.send]).
  ///
  /// Spec: `POST /emails/compose` (L17853); defensive parse as [compose].
  Future<ApiResult<Map<String, dynamic>>> composeRaw(
    Map<String, dynamic> body,
  ) async {
    final result =
        await _client.post<dynamic>('/emails/compose', data: body);
    if (!result.success) {
      return ApiResult.failure(result.error ??
          const ApiError(
            code: 'UNKNOWN_ERROR',
            message: 'compose failed with no error detail',
            statusCode: 0,
          ));
    }
    final data = result.data;
    if (data is Map<String, dynamic>) return ApiResult.ok(data);
    // Unknown `data` shape: degrade to an empty map rather than throwing —
    // the send still happened; shape drift is a contract note, not a crash.
    return ApiResult.ok(<String, dynamic>{});
  }

  /// Durably queues an owned draft for delivery.
  ///
  /// Spec: `POST /emails/{id}/send` (L18675). 200 `SuccessWrapper`;
  /// 400/404/401 surface as [ApiResult.failure].
  ///
  /// HTTP 200 is ACCEPTED-not-delivered: the 30s server-held undo window
  /// is real (delayed-send + BullMQ, backend-verified), so the message can
  /// still be recalled with [undoSend] within that window.
  ///
  /// // TODO(UNVERIFIED): the spec body is an unextracted generic object;
  /// `{}` is sent (same honesty pattern as `EmailsApi.unarchive`).
  Future<ApiResult<void>> sendDraft(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/${Uri.encodeComponent(id)}/send',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Cancels a queued send.
  ///
  /// Spec: `POST /emails/{id}/cancel-send` (L18236). 201 `SuccessWrapper`;
  /// 400/404/401 surface as [ApiResult.failure].
  ///
  /// // TODO(UNVERIFIED): the spec body is an unextracted generic object;
  /// `{}` is sent (same honesty pattern as `EmailsApi.unarchive`).
  Future<ApiResult<void>> cancelSend(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/${Uri.encodeComponent(id)}/cancel-send',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Recalls a message inside the 30s server-held undo window.
  ///
  /// Spec: `POST /emails/{id}/undo-send` (L18922). 201 `SuccessWrapper`;
  /// 400/404/401 surface as [ApiResult.failure]. Outside the undo window
  /// the server rejects (400) — that is a permanent failure, surfaced to
  /// the user, not retried forever.
  ///
  /// // TODO(UNVERIFIED): the spec body is an unextracted generic object;
  /// `{}` is sent (same honesty pattern as `EmailsApi.unarchive`).
  Future<ApiResult<void>> undoSend(String id) async {
    final result = await _client.post<Map<String, dynamic>>(
      '/emails/${Uri.encodeComponent(id)}/undo-send',
      data: <String, dynamic>{},
    );
    return _mapVoid(result);
  }

  /// Maps an envelope-unwrapped result to `void` (mirrors the
  /// `EmailsApi._mapVoid` pattern).
  ApiResult<void> _mapVoid(ApiResult<Map<String, dynamic>> result) =>
      result.success
          ? ApiResult<void>.ok(null)
          : ApiResult<void>.failure(result.error ??
              const ApiError(
                code: 'UNKNOWN_ERROR',
                message: 'compose API call failed with no error detail',
                statusCode: 0,
              ));
}
