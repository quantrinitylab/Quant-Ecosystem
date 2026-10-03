// ============================================================================
// quant_app - compose screen (M7: compose UI, W1 - UI layer)
//
// Real compose: recipient chips (To/Cc/Bcc), subject, plain-text body,
// wired to W2's [ComposeService] modifier queue — the send is validated
// locally, enqueued persistently, and drained async (Superhuman's
// `modify()`/`persist()` split). This screen never touches the network
// itself.
//
// Body is PLAIN TEXT this shift: `bodyHtml` stays null. The rich editor
// is the next slice — do not fake rich text here.
//
// Post-send "Message sent + Undo" UX is NOT this screen's job: W2's
// `sentMessagesProvider` fires on server confirmation and the
// [SendUndoHost] (mounted on inbox + thread) shows the snackbar.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_core/quant_core.dart';

import '../widgets/recipient_chips_field.dart';

/// Compose screen: new message or reply into [threadId].
///
/// Reply mode is detected from [threadId]/[inReplyTo]; the router fills
/// [initialTo]/[initialSubject] from the query string (see app_router's
/// `/compose` route), so this screen stays router-agnostic and testable.
///
/// The constructor signature is test-pinned (compose_screen_test.dart) —
/// keep the named params stable.
class ComposeScreen extends ConsumerStatefulWidget {
  const ComposeScreen({
    super.key,
    this.threadId,
    this.inReplyTo,
    this.initialTo = const <EmailAddress>[],
    this.initialSubject = '',
  });

  /// Thread this message replies into; null for a new message.
  final String? threadId;

  /// Message id being replied to; null for a new message.
  final String? inReplyTo;

  /// Seed recipients (reply prefill).
  final List<EmailAddress> initialTo;

  /// Seed subject (reply prefill, e.g. `Re: …`).
  final String initialSubject;

  /// True when composing a reply into an existing thread.
  bool get isReply => threadId != null && threadId!.isNotEmpty;

  @override
  ConsumerState<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends ConsumerState<ComposeScreen> {
  final TextEditingController _subjectController = TextEditingController();
  final TextEditingController _bodyController = TextEditingController();

  List<EmailAddress> _to = const <EmailAddress>[];
  List<EmailAddress> _cc = const <EmailAddress>[];
  List<EmailAddress> _bcc = const <EmailAddress>[];
  bool _ccVisible = false;
  bool _bccVisible = false;

  /// True while the send is being queued.
  bool _sending = false;

  /// Screen-level validation error (no valid recipient anywhere).
  String? _recipientError;

  @override
  void initState() {
    super.initState();
    _subjectController.text = widget.initialSubject;
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  /// Dirty = anything the user added beyond the reply prefill. The close
  /// button only asks to discard when there is something to lose.
  bool get _isDirty =>
      _to.any((EmailAddress a) =>
          !widget.initialTo.any((EmailAddress i) =>
              i.email.toLowerCase() == a.email.toLowerCase())) ||
      _cc.isNotEmpty ||
      _bcc.isNotEmpty ||
      _subjectController.text != widget.initialSubject ||
      _bodyController.text.isNotEmpty;

  Future<void> _onClose() async {
    if (!_isDirty) {
      context.pop();
      return;
    }
    final bool? discard = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const Text('Discard draft?'),
        content: const Text(
          'Your message will be lost.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep writing'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (discard == true && mounted) context.pop();
  }

  /// Sends through the modifier queue: ≥1 valid recipient across To/Cc/Bcc
  /// is required, else an inline banner and no network call. Success pops;
  /// failures surface as a red snackbar.
  Future<void> _send() async {
    if (_sending) return;
    final List<EmailAddress> valid = <EmailAddress>[
      ..._to,
      ..._cc,
      ..._bcc,
    ].where((EmailAddress a) => a.isValid).toList(growable: false);
    if (valid.isEmpty) {
      setState(() {
        _recipientError =
            'Add at least one recipient before sending.';
      });
      HapticFeedback.lightImpact();
      return;
    }
    setState(() {
      _sending = true;
      _recipientError = null;
    });
    HapticFeedback.lightImpact();
    // Plain text this shift: bodyHtml stays null (rich editor = next slice).
    final ComposeRequest request = ComposeRequest(
      to: List<EmailAddress>.of(_to),
      cc: List<EmailAddress>.of(_cc),
      bcc: List<EmailAddress>.of(_bcc),
      subject: _subjectController.text,
      bodyText: _bodyController.text,
      threadId: widget.threadId,
      inReplyTo: widget.inReplyTo,
    );
    try {
      await ref.read(composeServiceProvider).send(request);
      if (!mounted) return;
      // The "Message sent + Undo" snackbar is owned by SendUndoHost (it
      // listens for the server confirmation); this screen just leaves.
      context.pop();
    } on ArgumentError catch (err) {
      // Defensive: the screen already validated; the service re-validates.
      if (!mounted) return;
      setState(() => _sending = false);
      _showSendError('Could not send: ${err.message}');
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      _showSendError('Could not send — the message was not queued. Try again.');
    }
  }

  void _showSendError(String message) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: scheme.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool sending = _sending;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.close),
          tooltip: 'Close',
          onPressed: sending ? null : _onClose,
        ),
        title: Text(widget.isReply ? 'Reply' : 'New message'),
        bottom: sending
            ? const PreferredSize(
                preferredSize: Size.fromHeight(4),
                child: LinearProgressIndicator(minHeight: 4),
              )
            : null,
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.send),
            tooltip: 'Send',
            onPressed: sending ? null : () => _send(),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: IgnorePointer(
            ignoring: sending,
            child: Opacity(
              opacity: sending ? 0.6 : 1.0,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  if (_recipientError != null)
                    _RecipientErrorBanner(message: _recipientError!),
                  RecipientChipsField(
                    label: 'To',
                    initial: widget.initialTo,
                    onChanged: (List<EmailAddress> value) =>
                        setState(() => _to = value),
                  ),
                  Row(
                    children: <Widget>[
                      TextButton(
                        onPressed: () =>
                            setState(() => _ccVisible = !_ccVisible),
                        child: Text(_ccVisible ? 'Hide Cc' : 'Cc'),
                      ),
                      TextButton(
                        onPressed: () =>
                            setState(() => _bccVisible = !_bccVisible),
                        child: Text(_bccVisible ? 'Hide Bcc' : 'Bcc'),
                      ),
                    ],
                  ),
                  if (_ccVisible)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: RecipientChipsField(
                        label: 'Cc',
                        onChanged: (List<EmailAddress> value) =>
                            setState(() => _cc = value),
                      ),
                    ),
                  if (_bccVisible)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: RecipientChipsField(
                        label: 'Bcc',
                        onChanged: (List<EmailAddress> value) =>
                            setState(() => _bcc = value),
                      ),
                    ),
                  const SizedBox(height: 8),
                  TextField(
                    key: const ValueKey<String>('compose-subject'),
                    controller: _subjectController,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Subject',
                      hintText: 'Subject',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: TextField(
                      key: const ValueKey<String>('compose-body'),
                      controller: _bodyController,
                      maxLines: null,
                      expands: true,
                      textAlignVertical: TextAlignVertical.top,
                      keyboardType: TextInputType.multiline,
                      decoration: InputDecoration(
                        labelText: 'Body',
                        hintText: 'Write your message…',
                        hintStyle: TextStyle(
                          color: scheme.onSurfaceVariant,
                        ),
                        border: const OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Inline validation banner: error-container strip, never a dialog.
class _RecipientErrorBanner extends StatelessWidget {
  const _RecipientErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: <Widget>[
              Icon(
                Icons.error_outline,
                color: scheme.onErrorContainer,
                semanticLabel: 'Error',
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  message,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: scheme.onErrorContainer,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
