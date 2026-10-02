// ============================================================================
// quantai_app - Sentinel approval card (blueprint §3.2)
//
// Inline approval surface for sensitive / spending agent actions.
// Agent-OPAQUE by construction:
//   - the agent never sees this widget — it only receives the callbacks;
//   - the widget takes no providers and no agent handles: [onApprove],
//     [onDeny], [onExpired] are plain [VoidCallback]s, and [ApprovalCardData]
//     is a value class (summary, terms strings, expiresAt).
//   - W2 wires the callbacks to its approval engine; this file stays
//     independent so it compiles with zero cross-worker imports.
// ============================================================================

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Value object carried by the approval card.
///
/// Built by the approval engine (W2); the agent never constructs or reads it.
/// [terms] is empty for ordinary/sensitive actions and holds the exact-terms
/// strings (merchant, amount, method) for spending approvals.
class ApprovalCardData {
  /// Per-action identity; the engine binds the user's decision to this id.
  final String approvalId;

  /// One-line summary of what the agent wants to do.
  final String summary;

  /// Spending only: exact terms the approval is bound to.
  /// Non-empty ⟺ this is a spending approval.
  final List<String> terms;

  /// When the approval window lapses (~10 min from issue).
  final DateTime expiresAt;

  /// Per-action contract note, e.g. "Ye approval sirf is action ke liye hai".
  final String contractNote;

  const ApprovalCardData({
    required this.approvalId,
    required this.summary,
    required this.expiresAt,
    this.terms = const <String>[],
    this.contractNote = '',
  });

  /// Spending constructor: builds the exact-terms strings from merchant /
  /// amount / method so the card quotes them verbatim.
  factory ApprovalCardData.spending({
    required String approvalId,
    required String summary,
    required String merchant,
    required String amountLabel,
    required String method,
    required DateTime expiresAt,
    String contractNote = '',
  }) {
    return ApprovalCardData(
      approvalId: approvalId,
      summary: summary,
      terms: <String>[
        'Merchant: $merchant',
        'Amount: $amountLabel',
        'Method: $method',
      ],
      expiresAt: expiresAt,
      contractNote: contractNote,
    );
  }

  /// `true` when [terms] is non-empty — i.e. a spending approval.
  bool get isSpending => terms.isNotEmpty;
}

/// Inline approval card: action summary + (spending) exact terms + Approve /
/// Deny + expiry countdown + per-action contract note.
///
/// Callback-based and agent-opaque: no providers, no agent wiring. The parent
/// (chat surface) renders this inline and removes it on [onApprove]/[onDeny]/
/// [onExpired].
///
/// On expiry the card auto-dismisses its action surface (dead buttons are
/// never shown) and fires [onExpired] exactly once.
class ApprovalCard extends ConsumerWidget {
  /// Creates an approval card for [data].
  const ApprovalCard({
    required this.data,
    required this.onApprove,
    required this.onDeny,
    required this.onExpired,
    super.key,
  });

  /// The approval payload (value class — opaque to the agent).
  final ApprovalCardData data;

  /// Called once when the user approves. Parent removes the card.
  final VoidCallback onApprove;

  /// Called once when the user denies. Parent removes the card.
  final VoidCallback onDeny;

  /// Called once when [ApprovalCardData.expiresAt] lapses. Parent removes
  /// the card; there is no re-issue.
  final VoidCallback onExpired;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _ApprovalCardView(
      data: data,
      onApprove: onApprove,
      onDeny: onDeny,
      onExpired: onExpired,
    );
  }
}

/// Owns the countdown timer and the resolved/expired transitions.
/// Private — the public surface is [ApprovalCard].
class _ApprovalCardView extends StatefulWidget {
  const _ApprovalCardView({
    required this.data,
    required this.onApprove,
    required this.onDeny,
    required this.onExpired,
  });

  final ApprovalCardData data;
  final VoidCallback onApprove;
  final VoidCallback onDeny;
  final VoidCallback onExpired;

  @override
  State<_ApprovalCardView> createState() => _ApprovalCardViewState();
}

class _ApprovalCardViewState extends State<_ApprovalCardView> {
  Timer? _ticker;
  Duration _remaining = Duration.zero;

  /// Set once the user acts or the card expires — dead buttons are never
  /// re-enabled and callbacks fire exactly once.
  bool _resolved = false;
  bool _expired = false;

  @override
  void initState() {
    super.initState();
    _updateRemaining();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      _updateRemaining();
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  /// Recomputes the countdown; on expiry auto-dismisses the action surface
  /// and fires [onExpired] exactly once.
  void _updateRemaining() {
    final Duration remaining =
        widget.data.expiresAt.difference(DateTime.now());
    if (remaining <= Duration.zero) {
      _ticker?.cancel();
      if (!mounted || _resolved) return;
      setState(() {
        _resolved = true;
        _expired = true;
      });
      widget.onExpired();
      return;
    }
    if (mounted) {
      setState(() => _remaining = remaining);
    }
  }

  void _handleApprove() {
    if (_resolved) return;
    setState(() => _resolved = true);
    _ticker?.cancel();
    widget.onApprove();
  }

  void _handleDeny() {
    if (_resolved) return;
    setState(() => _resolved = true);
    _ticker?.cancel();
    widget.onDeny();
  }

  /// mm:ss countdown label.
  String get _countdownLabel {
    final int total = _remaining.inSeconds;
    final String mm = (total ~/ 60).toString().padLeft(2, '0');
    final String ss = (total % 60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final TextTheme textTheme = theme.textTheme;

    return Semantics(
      label: 'Approval request: ${widget.data.summary}',
      liveRegion: true,
      child: Card(
        margin: const EdgeInsets.symmetric(vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: widget.data.isSpending
                ? scheme.error.withValues(alpha: 0.5)
                : scheme.outlineVariant,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _HeaderRow(
                isSpending: widget.data.isSpending,
                countdownLabel: _countdownLabel,
                expired: _expired,
              ),
              const SizedBox(height: 8),
              Text(widget.data.summary, style: textTheme.titleMedium),
              if (widget.data.terms.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                _TermsBox(terms: widget.data.terms),
              ],
              if (widget.data.contractNote.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                _ContractNote(note: widget.data.contractNote),
              ],
              const SizedBox(height: 16),
              if (_expired)
                const _ExpiredNotice()
              else
                _ActionButtons(
                  enabled: !_resolved,
                  onApprove: _handleApprove,
                  onDeny: _handleDeny,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Card header: shield icon + kind label + countdown chip.
class _HeaderRow extends StatelessWidget {
  const _HeaderRow({
    required this.isSpending,
    required this.countdownLabel,
    required this.expired,
  });

  final bool isSpending;
  final String countdownLabel;
  final bool expired;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color accent = isSpending ? scheme.error : scheme.primary;
    return Row(
      children: <Widget>[
        Icon(Icons.shield_outlined, color: accent, size: 22),
        const SizedBox(width: 8),
        Text(
          isSpending ? 'Spending approval' : 'Approval needed',
          style: Theme.of(context)
              .textTheme
              .labelLarge
              ?.copyWith(color: accent, fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        Semantics(
          label: expired
              ? 'Approval expired'
              : 'Approval expires in $countdownLabel',
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: expired
                  ? scheme.surfaceContainerHighest
                  : scheme.tertiaryContainer,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(
                  expired ? Icons.timer_off_outlined : Icons.timer_outlined,
                  size: 14,
                  color: expired
                      ? scheme.onSurfaceVariant
                      : scheme.onTertiaryContainer,
                ),
                const SizedBox(width: 4),
                Text(
                  expired ? 'Expired' : countdownLabel,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: expired
                            ? scheme.onSurfaceVariant
                            : scheme.onTertiaryContainer,
                        fontFeatures: const <FontFeature>[
                          FontFeature.tabularFigures()
                        ],
                      ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Exact-terms block quoted verbatim for spending approvals.
class _TermsBox extends StatelessWidget {
  const _TermsBox({required this.terms});

  final List<String> terms;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest
            .withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (int i = 0; i < terms.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  Icons.lock_outline,
                  size: 14,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    terms[i],
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Per-action contract note — the fine print the approval is bound by.
class _ContractNote extends StatelessWidget {
  const _ContractNote({required this.note});

  final String note;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(
          Icons.info_outline,
          size: 14,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            note,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

/// Approve / Deny action buttons. Disabled once resolved.
class _ActionButtons extends StatelessWidget {
  const _ActionButtons({
    required this.enabled,
    required this.onApprove,
    required this.onDeny,
  });

  final bool enabled;
  final VoidCallback onApprove;
  final VoidCallback onDeny;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(
          child: OutlinedButton(
            onPressed: enabled ? onDeny : null,
            child: const Text('Deny'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            onPressed: enabled ? onApprove : null,
            child: const Text('Approve'),
          ),
        ),
      ],
    );
  }
}

/// Shown after expiry: the action surface is gone; the user must start over.
class _ExpiredNotice extends StatelessWidget {
  const _ExpiredNotice();

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest
              .withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: <Widget>[
            Icon(
              Icons.timer_off_outlined,
              size: 18,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Approval expired — dobara request karni hogi.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      );
  }
}
