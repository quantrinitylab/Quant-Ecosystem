// ============================================================================
// quantai_app - chat composer (message input) (W2)
// ============================================================================
//
// Multiline input + send/stop. Send se pehle [UsageGate] check hota hai
// (D5, Bet 2 — Superhuman steal: gate invisible-by-default; denied hone par
// sirf ek inline notice, koi dialog nahi).
//
// Contract (W1, `package:quantai_core/quantai_core.dart`):
//   chatSessionControllerProvider  NotifierProvider.family<ChatSessionController,
//                                   ChatViewState, String>
//   ChatSessionController.send(text) / .stop()
//   usageGateProvider              Provider<UsageGate>
//   UsageGate.checkBeforeAction(AiAction.chatMessage) -> UsageCheckResult
//     {allowed, reason}
//   enum AiAction { chatMessage, streamStart, toolCall }
//
// NOTE: gate abhi fail-open stub hai (TODO(UNVERIFIED) — metering contract
// nahi hai), isliye denied path dormant hai. Phir bhi wire kiya gaya hai taaki
// contract aate hi enforce ho jaye.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantai_core/quantai_core.dart';

/// Chat screen ke neeche ka composer: input field + send / stop button.
class ChatComposer extends ConsumerStatefulWidget {
  /// Creates the composer for [sessionId].
  const ChatComposer({super.key, required this.sessionId});

  /// Jis session me message bhejna hai.
  final String sessionId;

  @override
  ConsumerState<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends ConsumerState<ChatComposer> {
  final TextEditingController _field = TextEditingController();

  /// Usage gate ne deny kiya to yahan inline notice dikhta hai.
  String? _gateNotice;

  @override
  void initState() {
    super.initState();
    _field.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final ChatViewState viewState =
        ref.watch(chatSessionControllerProvider(widget.sessionId));
    final bool isStreaming = viewState.isStreaming;
    final bool canSend = _field.text.trim().isNotEmpty && !isStreaming;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // Usage-gate denied notice — inline, dialog nahi.
            if (_gateNotice != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.error.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: scheme.error.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Row(
                    children: <Widget>[
                      Icon(
                        Icons.info_outline,
                        size: 16,
                        color: scheme.error,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _gateNotice!,
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: scheme.error,
                                  ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: _field,
                    minLines: 1,
                    maxLines: 6,
                    textInputAction: TextInputAction.newline,
                    enabled: !isStreaming,
                    decoration: const InputDecoration(
                      hintText: 'Quanty se poochho…',
                      border: OutlineInputBorder(
                        borderRadius:
                            BorderRadius.all(Radius.circular(20)),
                      ),
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 8),
                if (isStreaming)
                  IconButton.filled(
                    tooltip: 'Roko',
                    icon: const Icon(Icons.stop),
                    onPressed: () => ref
                        .read(chatSessionControllerProvider(widget.sessionId)
                            .notifier)
                        .stop(),
                  )
                else
                  IconButton.filled(
                    tooltip: 'Bhejo',
                    icon: const Icon(Icons.arrow_upward),
                    onPressed: canSend ? _send : null,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Gate check → controller.send → field clear.
  Future<void> _send() async {
    final String text = _field.text.trim();
    if (text.isEmpty) return;

    final ChatSessionController controller = ref.read(
      chatSessionControllerProvider(widget.sessionId).notifier,
    );

    // D5 usage gate: action se PEHLE check. Fail-open stub hai to ye
    // practically kabhi deny nahi karega — phir bhi har send par wired hai.
    final UsageCheckResult check = await ref
        .read(usageGateProvider)
        .checkBeforeAction(AiAction.chatMessage);
    if (!check.allowed) {
      setState(() {
        _gateNotice = check.reason ??
            'Abhi message bhejne ki permission nahi hai. Thodi der baad try karo.';
      });
      return;
    }
    if (_gateNotice != null) {
      setState(() => _gateNotice = null);
    }

    _field.clear();
    await controller.send(text);
  }
}
