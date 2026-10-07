/// QuantAI Sentinel — trust & safety boundary (QUANTAI_BLUEPRINT §3.2).
///
/// Modules (worker-owned, coordinator-owned barrel — do not edit individual
/// files without owning the worker scope):
/// - `approval_taxonomy.dart` + `approval_store.dart` — approval taxonomy engine
///   (ordinary/sensitive/spending; no standing spend grants, by API absence).
/// - `credential_vault.dart` — existence-only credential vault + single-use OTP
///   opaque handles. Agent never sees values.
/// - `audit_trail.dart` — append-only audit trail; Activity-log read contract
///   for quantai-proactive.
/// - `quantpay_safety.dart` — Quant Pay one-time card flow safety;
///   unknown-outcome → no-retry (code-enforced).
///
/// Import this barrel from app code, never the individual files.
export 'approval_taxonomy.dart';
export 'approval_store.dart';
export 'credential_vault.dart';
export 'audit_trail.dart';
export 'quantpay_safety.dart';
