// ============================================================================
// quantai_core - Sentinel approval store (W2, Shift 1)
// ============================================================================
//
// Riverpod-owned registry of pending approval requests. The UI layer (W3's
// approval cards) writes decisions here; the agent layer only READS through
// [ApprovalStore.awaitDecision] — the future is UI-agnostic, so the card
// stays opaque to the agent: it cannot introspect, pre-empt, or
// self-approve.
//
// HARD LAW (carried from approval_taxonomy.dart, enforced by API shape):
//   - NO STANDING SPEND GRANTS. [grantSpending] is the ONLY path that can
//     authorize money movement, and it demands a fresh, explicit, unexpired
//     [ApprovalRequest] plus byte-exact [ApprovalTerms]. There is
//     intentionally no autoApprove, preAuthorize, or scheduleApproval API —
//     the absence IS the law.
//   - EXPIRED REQUESTS NEVER APPROVE. [approve]/[deny] on an expired request
//     (and [expireSweep]) resolve it to [DecisionOutcome.expired].
//   - AGENTS NEVER SELF-APPROVE. Every recorded [ApprovalDecision.decidedBy]
//     is 'user'.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'approval_taxonomy.dart';

/// Thrown when a spending approval's terms do not byte-match the request's
/// terms.
///
/// The request is recorded as DENIED *before* this is thrown, so agents
/// awaiting [ApprovalStore.awaitDecision] observe the denial even if the UI
/// layer swallows the exception.
class ApprovalTermsMismatch implements Exception {
  /// The request whose terms did not match.
  final String requestId;

  const ApprovalTermsMismatch(this.requestId);

  @override
  String toString() => 'ApprovalTermsMismatch: terms for $requestId did not '
      'exactly match the approved request; the request was denied.';
}

/// Registry of pending approval requests and their terminal decisions.
///
/// State is the pending-request map (`id → request`); terminal decisions
/// live alongside in [_decisions] so [awaitDecision] can resolve
/// immediately for already-decided requests.
class ApprovalStore extends Notifier<Map<String, ApprovalRequest>> {
  int _seq = 0;
  final Map<String, ApprovalDecision> _decisions = {};
  final Map<String, Completer<ApprovalDecision>> _waiters = {};

  @override
  Map<String, ApprovalRequest> build() => const {};

  /// Files a new approval request. Returns the request id
  /// (`appr_<seq>_<micros>`, monotonic within this store).
  ///
  /// [requestedAt] is injectable for tests; production callers omit it.
  String requestApproval(
    String actionId,
    ActionRisk risk,
    String summary, {
    ApprovalTerms? terms,
    DateTime? requestedAt,
  }) {
    final id = 'appr_${++_seq}_${DateTime.now().microsecondsSinceEpoch}';
    final request = ApprovalRequest.fresh(
      id,
      actionId,
      risk,
      summary,
      terms: terms,
      requestedAt: requestedAt,
    );
    state = {...state, id: request};
    return id;
  }

  /// The decision for [id], once the user (or expiry) resolves it.
  ///
  /// This is the API agents await — UI-agnostic, so the approval card stays
  /// opaque to the agent. Resolves immediately when the request already has
  /// a terminal decision.
  Future<ApprovalDecision> awaitDecision(String id) {
    final decided = _decisions[id];
    if (decided != null) return Future.value(decided);
    return (_waiters[id] ??= Completer<ApprovalDecision>()).future;
  }

  /// Approves a pending request.
  ///
  /// Spending requests delegate to [grantSpending]: [termsCheck] must
  /// byte-match the request's terms or the request is denied and
  /// [ApprovalTermsMismatch] is thrown. Expired requests resolve to
  /// [DecisionOutcome.expired], never approved. Already-resolved requests
  /// are an idempotent no-op.
  void approve(String id, {ApprovalTerms? termsCheck}) {
    final request = _pending(id);
    if (request == null) return; // already resolved: idempotent
    if (request.isExpired()) {
      _record(request, DecisionOutcome.expired);
      return;
    }
    if (request.risk == ActionRisk.spending) {
      _grantSpending(request, termsCheck);
      return;
    }
    _record(request, DecisionOutcome.approved);
  }

  /// The ONLY API that can authorize money movement.
  ///
  /// Requires the request to be pending, unexpired, and spending-tier, with
  /// [terms] byte-matching the request's terms ([ApprovalTerms.exactMatch]).
  /// A mismatch records a DENIAL and then throws [ApprovalTermsMismatch].
  /// There is no pre-authorization path: every grant needs a fresh request.
  void grantSpending(String id, ApprovalTerms? terms) {
    final request = _pending(id);
    if (request == null) return; // already resolved: idempotent
    if (request.isExpired()) {
      _record(request, DecisionOutcome.expired);
      return;
    }
    if (request.risk != ActionRisk.spending) {
      throw StateError(
        'grantSpending is only for spending-tier requests '
        '($id is ${request.risk}).',
      );
    }
    _grantSpending(request, terms);
  }

  /// Denies a pending request. An expired request resolves to
  /// [DecisionOutcome.expired], not denied — expiry is its own truth.
  /// Already-resolved requests are an idempotent no-op.
  void deny(String id) {
    final request = _pending(id);
    if (request == null) return; // already resolved: idempotent
    if (request.isExpired()) {
      _record(request, DecisionOutcome.expired);
      return;
    }
    _record(request, DecisionOutcome.denied);
  }

  /// Marks every expired pending request as expired. Idempotent; safe to
  /// call on a timer.
  void expireSweep() {
    for (final request in state.values.toList()) {
      if (request.isExpired()) {
        _record(request, DecisionOutcome.expired);
      }
    }
  }

  /// Shared spending-grant core: exact terms or denial.
  void _grantSpending(ApprovalRequest request, ApprovalTerms? terms) {
    // Non-null by the ApprovalRequest constructor law for spending requests.
    final expected = request.terms!;
    if (terms == null || !expected.exactMatch(terms)) {
      _record(request, DecisionOutcome.denied);
      throw ApprovalTermsMismatch(request.id);
    }
    _record(request, DecisionOutcome.approved);
  }

  /// Pending request for [id], or null when already resolved (idempotent
  /// callers no-op). Throws [StateError] for ids this store never issued —
  /// unknown ids can never resolve.
  ApprovalRequest? _pending(String id) {
    final request = state[id];
    if (request != null) return request;
    if (_decisions.containsKey(id)) return null;
    throw StateError('Unknown approval request: $id');
  }

  /// Records the terminal decision, removes the request from pending, and
  /// wakes every agent awaiting it.
  void _record(ApprovalRequest request, DecisionOutcome outcome) {
    final decision =
        ApprovalDecision(outcome, DateTime.now().toUtc(), 'user', request.id);
    _decisions[request.id] = decision;
    final next = Map<String, ApprovalRequest>.of(state)..remove(request.id);
    state = next;
    _waiters.remove(request.id)?.complete(decision);
  }
}

/// The approval registry (override-friendly: tests use a fresh
/// [ProviderContainer]).
final approvalStoreProvider =
    NotifierProvider<ApprovalStore, Map<String, ApprovalRequest>>(
  ApprovalStore.new,
  name: 'approvalStoreProvider',
);
