// ============================================================================
// quantai_core - Sentinel approval taxonomy (W2, Shift 1)
// ============================================================================
//
// Trust boundary for agent-initiated actions. Every action an agent wants to
// perform is classified into one of three risk tiers ([ActionRisk]); the tier
// decides whether the user must approve and, for spending, what exact terms
// that approval is bound to.
//
// HARD LAW (enforced by the SHAPE of this API, not by convention):
//   1. NO STANDING SPEND GRANTS. There is intentionally no autoApprove /
//      preAuthorize / scheduleApproval API anywhere in this module or in
//      approval_store.dart. Spending can only be authorized through a fresh,
//      explicit [ApprovalRequest] whose [ApprovalTerms] match the executed
//      charge byte-for-byte ([ApprovalTerms.exactMatch]). If the API you
//      want does not exist here, that absence IS the law working.
//   2. APPROVALS EXPIRE. Default TTL is 10 minutes ([kApprovalTtl]).
//      [ApprovalRequest.isExpired] gates every resolution path; an expired
//      request can never resolve to "approved" — only to "expired".
//
// Classification heuristics ([classifyAction]) are deliberately
// conservative in one direction only: money-movement keys are checked first,
// so `send_payment` is spending, never merely sensitive.

/// Risk tier of an agent-initiated action.
enum ActionRisk {
  /// Read-only / local-draft class actions (`read`, `search`, `draft`,
  /// `list`). No user approval required.
  ordinary,

  /// Mutating or externally visible actions (`send`, `post`, `delete`,
  /// `publish`, `connect`, `share`). Requires an approval card before the
  /// agent may execute.
  sensitive,

  /// Any movement of money (`pay`, `transfer`, `purchase`, `checkout`, …).
  /// Requires a FRESH approval bound to exact terms ([ApprovalTerms]);
  /// standing grants do not exist.
  spending,
}

/// Default approval time-to-live: 10 minutes from [ApprovalRequest.requestedAt].
const kApprovalTtl = Duration(minutes: 10);

/// Tokenized action-key hints for the sensitive tier.
const _sensitiveHints = <String>{
  'send',
  'post',
  'delete',
  'publish',
  'connect',
  'share',
  'update',
  'remove',
  'revoke',
  'grant',
};

/// Tokenized action-key hints for the spending tier. Checked FIRST.
const _spendingHints = <String>{
  'pay',
  'payment',
  'transfer',
  'purchase',
  'buy',
  'subscribe',
  'checkout',
  'topup',
  'top_up',
  'withdraw',
  'charge',
  'billing',
};

/// Splits an action key into lowercase alphanumeric tokens.
///
/// Tokenization (not substring matching) prevents false positives like
/// `display.settings` matching the `pay` hint.
Set<String> _tokens(String actionKey) => actionKey
    .toLowerCase()
    .split(RegExp(r'[^a-z0-9]+'))
    .where((t) => t.isNotEmpty)
    .toSet();

/// Classifies an agent action key into its risk tier.
///
/// Evaluated in this order:
///   1. money movement (`pay`, `transfer`, `purchase`, …) →
///      [ActionRisk.spending]
///   2. mutating / externally visible (`send`, `post`, `delete`, `publish`,
///      `connect`, …) → [ActionRisk.sensitive]
///   3. everything else (`read`, `search`, `draft`, `list`, …) →
///      [ActionRisk.ordinary]
///
/// Unknown keys fall to ordinary, so callers MUST route anything with side
/// effects through keys carrying sensitive/spending hints — when in doubt,
/// pick the scarier key.
ActionRisk classifyAction(String actionKey) {
  final tokens = _tokens(actionKey);
  if (tokens.intersection(_spendingHints).isNotEmpty) {
    return ActionRisk.spending;
  }
  if (tokens.intersection(_sensitiveHints).isNotEmpty) {
    return ActionRisk.sensitive;
  }
  // Ordinary hints are advisory only; the default is ordinary regardless.
  return ActionRisk.ordinary;
}

/// Exact terms a spending approval is bound to.
///
/// The user approves THESE terms and nothing else. The executed charge must
/// match byte-for-byte ([exactMatch]); any deviation — different amount,
/// merchant, currency, or method — invalidates the approval and the action
/// must be denied. Amounts are integers in the currency's minor unit
/// (paise for INR, cents for USD): no floats at a trust boundary.
class ApprovalTerms {
  /// Merchant / payee identifier, exactly as shown to the user.
  final String merchant;

  /// Amount in the currency's minor unit (e.g. paise). Never a double.
  final int amountMinor;

  /// ISO 4217 currency code, e.g. 'INR'.
  final String currency;

  /// Payment method, e.g. 'quantpay-onetime-card'. Binds the approval to one
  /// instrument: a different method is a different approval.
  final String method;

  const ApprovalTerms(this.merchant, this.amountMinor, this.currency, this.method);

  /// True only when every field is byte-equal. Partial matches (same
  /// merchant, different amount) are NOT a match — this is the hard law
  /// against standing spend grants.
  bool exactMatch(ApprovalTerms other) =>
      merchant == other.merchant &&
      amountMinor == other.amountMinor &&
      currency == other.currency &&
      method == other.method;

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is ApprovalTerms && exactMatch(other);

  @override
  int get hashCode => Object.hash(merchant, amountMinor, currency, method);

  @override
  String toString() =>
      'ApprovalTerms($merchant, $amountMinor $currency via $method)';
}

/// A single user-approval request filed by an agent action.
class ApprovalRequest {
  /// Monotonic id, `appr_<seq>_<micros>` (issued by the store).
  final String id;

  /// The agent action key this request gates (see [classifyAction]).
  final String actionId;

  /// Risk tier; decides which resolution path applies.
  final ActionRisk risk;

  /// Human-readable, agent-generated summary shown on the approval card.
  final String summary;

  /// Exact spend terms. Required when [risk] is [ActionRisk.spending],
  /// forbidden otherwise (constructor law — see below).
  final ApprovalTerms? terms;

  /// When the request was filed (UTC).
  final DateTime requestedAt;

  /// When the request stops being resolvable (UTC). Defaults to
  /// [requestedAt] + [kApprovalTtl].
  final DateTime expiresAt;

  /// Creates a request, enforcing the terms law at construction time:
  /// spending REQUIRES exact terms (no standing grants), and non-spending
  /// requests MUST NOT carry terms.
  ApprovalRequest(
    this.id,
    this.actionId,
    this.risk,
    this.summary,
    this.terms,
    this.requestedAt,
    this.expiresAt,
  ) {
    if (risk == ActionRisk.spending && terms == null) {
      throw ArgumentError(
        'Spending approvals require exact ApprovalTerms (no standing grants).',
      );
    }
    if (risk != ActionRisk.spending && terms != null) {
      throw ArgumentError('Only spending approvals may carry ApprovalTerms.');
    }
  }

  /// Creates a request with the default 10-minute expiry. [requestedAt] is
  /// injectable for tests; production callers leave it null (now, UTC).
  factory ApprovalRequest.fresh(
    String id,
    String actionId,
    ActionRisk risk,
    String summary, {
    ApprovalTerms? terms,
    DateTime? requestedAt,
  }) {
    final at = (requestedAt ?? DateTime.now()).toUtc();
    return ApprovalRequest(
      id,
      actionId,
      risk,
      summary,
      terms,
      at,
      at.add(kApprovalTtl),
    );
  }

  /// Whether the request has expired as of [clock] (now, UTC, when null).
  /// Expired requests can never resolve to "approved".
  bool isExpired([DateTime? clock]) {
    final now = (clock ?? DateTime.now()).toUtc();
    return !now.isBefore(expiresAt);
  }
}

/// Terminal outcome of an approval request.
enum DecisionOutcome {
  /// The user approved the request (spending: terms byte-matched).
  approved,

  /// The user denied the request (or terms mismatched — same outcome).
  denied,

  /// The request expired before resolution. Never "approved".
  expired,
}

/// The terminal decision for one [ApprovalRequest].
class ApprovalDecision {
  /// How the request resolved.
  final DecisionOutcome outcome;

  /// When the decision was recorded (UTC).
  final DateTime decidedAt;

  /// Who decided. Always 'user' — agents can never self-approve.
  final String decidedBy;

  /// The [ApprovalRequest.id] this decision binds to.
  final String requestId;

  const ApprovalDecision(
    this.outcome,
    this.decidedAt,
    this.decidedBy,
    this.requestId,
  );
}
