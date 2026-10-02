// ============================================================================
// quantai_core - D5 credits metering client-side gate (STUB)
// ============================================================================
//
// Bet 2 of the mission (D5): interactive AI must be latency- and
// credits-aware. This gate is the client-side policy point for AI actions:
// check BEFORE the action, record AFTER it.
//
// STATUS: STUB. There is currently no backend contract for usage/metering
// (no spec under `app-foundations/quantai/`). Every method below is a
// `TODO(UNVERIFIED)` placeholder: fail-OPEN in dev with a loud TODO so the
// app can be built against it, and FAIL-CLOSED semantics will be wired once
// the contract exists. DO NOT invent endpoint URLs here.

import 'package:flutter/foundation.dart';

import 'quantai_api_client.dart';

/// The kind of AI action being gated. Generic — no endpoint is implied.
enum AiAction {
  /// A single chat message send.
  chatMessage,

  /// Opening a streaming response channel.
  streamStart,

  /// An autonomous tool call performed on the user's behalf.
  toolCall,
}

/// Result of a pre-action usage check.
class UsageCheckResult {
  /// Whether the action may proceed.
  final bool allowed;

  /// Remaining credits reported by the backend, if known.
  final int? remainingCredits;

  /// Human-readable reason when [allowed] is false (or when unverified).
  final String? reason;

  const UsageCheckResult._({
    required this.allowed,
    this.remainingCredits,
    this.reason,
  });

  /// The action is permitted (backend confirmed credits).
  const factory UsageCheckResult.allowed({int? remainingCredits}) =
      UsageCheckResult._;

  /// The action is denied (backend confirmed insufficient credits).
  factory UsageCheckResult.denied(String reason) =>
      UsageCheckResult._(allowed: false, reason: reason);

  /// No backend contract exists: fail-open in dev with a loud marker.
  ///
  /// Production callers must treat this as "unverified" — the gate becomes
  /// enforcing once the metering contract is wired (TODO(UNVERIFIED) below).
  factory UsageCheckResult.unverified() => const UsageCheckResult._(
        allowed: true,
        reason: 'UNVERIFIED: no usage/metering contract yet',
      );
}

/// Client-side credits gate for AI actions (D5, Bet 2).
///
/// Kept as a stub until the backend metering contract exists. Wire the real
/// transport here (single source of truth for both call sites in UI):
/// `checkBeforeAction` before every [AiAction], `recordUsage` after a
/// completed AI turn with actual token counts for metering.
class UsageGate {
  final QuantAiApiClient _apiClient;

  /// Creates the gate. [_apiClient] is unused by the stub but is the future
  /// transport for the metering calls (kept so wiring is zero-diff later).
  UsageGate({required QuantAiApiClient apiClient}) : _apiClient = apiClient;

  /// The API client that will carry metering requests once the contract
  /// exists. Exposed for future wiring; unused by the stub.
  QuantAiApiClient get apiClient => _apiClient;

  /// Checks whether [action] may proceed under the user's credits.
  ///
  /// TODO(UNVERIFIED): no backend metering contract exists yet, so this
  /// returns [UsageCheckResult.unverified] (fail-open, dev only). Once the
  /// spec lands, this must call the metering endpoint and return
  /// `allowed`/`denied(reason)` with `remainingCredits`.
  Future<UsageCheckResult> checkBeforeAction(AiAction action) async {
    debugPrint(
        '[UsageGate] TODO(UNVERIFIED): checkBeforeAction($action) — no '
        'metering contract; returning unverified (fail-open).');
    return UsageCheckResult.unverified();
  }

  /// Records completed AI usage for metering.
  ///
  /// TODO(UNVERIFIED): no backend metering contract exists yet — this is a
  /// no-op with a loud log. Once the spec lands, POST the token counts to the
  /// metering endpoint here.
  Future<void> recordUsage({
    required AiAction action,
    required int tokensUsed,
  }) async {
    debugPrint(
        '[UsageGate] TODO(UNVERIFIED): recordUsage($action, tokens=$tokensUsed) — '
        'no metering contract; dropping (no-op).');
  }
}
