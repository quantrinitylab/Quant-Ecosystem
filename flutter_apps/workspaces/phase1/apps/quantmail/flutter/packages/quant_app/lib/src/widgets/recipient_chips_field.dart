// ============================================================================
// quant_app - recipient chips field (M7: compose UI, W1 - UI layer)
//
// A real recipient editor: typed tokens commit into removable chips on
// `,`, `;`, space, or Done; invalid input shows an inline error and never
// becomes a chip. No fake autocomplete, no network lookups — validation
// is the pragmatic address regex below.
//
// - Chips are [EmailAddress] values (always valid by construction: the
//   regex gates creation); the parent reads them through [onChanged].
// - 48dp minimum touch targets on the remove affordance (VQA-P2-06);
//   chips carry `Semantics(label: 'Remove <email>')`.
// - Theme colors only — dark/OLED safe.
import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';

/// UI-facing alias of the single validation authority
/// ([EmailAddress.wellFormedPattern] in quant_core). The chips field keeps
/// this name as its UX gate; the invariant itself lives in core so non-UI
/// paths (service validation, reply prefill) can never diverge from it.
final RegExp recipientEmailPattern = EmailAddress.wellFormedPattern;

/// Recipient editor: chips + inline text input with real validation.
///
/// [initial] seeds the chips (reply prefill); [onChanged] fires with the
/// current chip list on every add/remove (and once post-frame for the
/// initial sync).
class RecipientChipsField extends StatefulWidget {
  const RecipientChipsField({
    super.key,
    required this.label,
    this.initial = const <EmailAddress>[],
    required this.onChanged,
  });

  /// Visible label above the field; also the text input's semantics label.
  final String label;

  /// Seed chips (e.g. the reply target).
  final List<EmailAddress> initial;

  /// Current chips, as valid [EmailAddress] values, newest last.
  final ValueChanged<List<EmailAddress>> onChanged;

  @override
  State<RecipientChipsField> createState() => _RecipientChipsFieldState();
}

class _RecipientChipsFieldState extends State<RecipientChipsField> {
  /// Separators that commit a token into a chip.
  static final RegExp _separator = RegExp(r'[,;\s]');

  final TextEditingController _controller = TextEditingController();
  final List<EmailAddress> _chips = <EmailAddress>[];
  String? _error;

  @override
  void initState() {
    super.initState();
    _chips.addAll(widget.initial.where((EmailAddress a) => a.isValid));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        widget.onChanged(List<EmailAddress>.unmodifiable(_chips));
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Commits every token before the last separator; the tail stays in the
  /// field as the in-progress token. Invalid tokens are dropped with an
  /// inline error — they never become chips.
  void _onTextChanged(String value) {
    final int lastSep = value.lastIndexOf(_separator);
    if (lastSep < 0) return; // No separator yet: nothing to commit.
    final String head = value.substring(0, lastSep);
    final String tail = value.substring(lastSep + 1);
    String? firstInvalid;
    for (final String raw in head.split(_separator)) {
      final String token = raw.trim();
      if (token.isEmpty) continue;
      if (recipientEmailPattern.hasMatch(token) &&
          !_chips.any(
            (EmailAddress c) =>
                c.email.toLowerCase() == token.toLowerCase(),
          )) {
        _chips.add(EmailAddress(email: token));
      } else if (!recipientEmailPattern.hasMatch(token)) {
        firstInvalid ??= token;
      }
      // Duplicates are swallowed silently (no error, no second chip).
    }
    setState(() {
      _controller.text = tail;
      _controller.selection =
          TextSelection.collapsed(offset: tail.length);
      _error = firstInvalid == null
          ? null
          : '“$firstInvalid” sahi email nahi lag raha';
    });
    widget.onChanged(List<EmailAddress>.unmodifiable(_chips));
  }

  /// Done commits whatever is typed, even without a trailing separator.
  void _commitAll() {
    final String value = _controller.text;
    if (value.trim().isEmpty) return;
    // Route through the separator path with a synthetic trailing comma.
    _onTextChanged('$value,');
  }

  void _remove(EmailAddress address) {
    setState(() {
      _chips.removeWhere(
        (EmailAddress c) =>
            c.email.toLowerCase() == address.email.toLowerCase(),
      );
    });
    widget.onChanged(List<EmailAddress>.unmodifiable(_chips));
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    final String? error = _error;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          widget.label,
          style: textTheme.labelMedium?.copyWith(
            color: scheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            border: Border.all(color: scheme.outline),
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.all(8),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              for (final EmailAddress chip in _chips) _buildChip(chip),
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 140),
                child: IntrinsicWidth(
                  // The visible Text label above owns the caption; the
                  // input still needs its own semantics label.
                  child: Semantics(
                    label: widget.label,
                    textField: true,
                    child: TextField(
                      key: ValueKey<String>('${widget.label}-input'),
                      controller: _controller,
                      onChanged: _onTextChanged,
                      onSubmitted: (_) => _commitAll(),
                      textInputAction: TextInputAction.done,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: InputDecoration(
                        isDense: true,
                        border: InputBorder.none,
                        hintText: 'Add recipients',
                        hintStyle: textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                      style: textTheme.bodyMedium,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (error != null) ...<Widget>[
          const SizedBox(height: 4),
          Text(
            error,
            style: textTheme.bodySmall?.copyWith(color: scheme.error),
          ),
        ],
      ],
    );
  }

  /// One chip: display label + trailing X. The X is a 48x48 target
  /// (VQA-P2-06); the semantics label reads `Remove <email>`.
  Widget _buildChip(EmailAddress address) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Semantics(
      label: 'Recipient ${address.email}',
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(24),
        ),
        padding: const EdgeInsets.only(left: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Flexible(
              child: Text(
                address.display,
                style: textTheme.bodyMedium,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Semantics(
              button: true,
              label: 'Remove ${address.email}',
              child: InkWell(
                onTap: () => _remove(address),
                borderRadius: BorderRadius.circular(24),
                child: Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  child: Icon(
                    Icons.close,
                    size: 18,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
