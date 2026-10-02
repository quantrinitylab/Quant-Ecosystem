// ============================================================================
// quant_app - Thread view placeholder (M1)
// ============================================================================
//
// Honest placeholder: the real thread view (offline cache + ws updates)
// lands in a later milestone.

import 'package:flutter/material.dart';

/// Placeholder thread screen. Receives the thread id from the
/// `/thread/:threadId` route and shows it so routing can be verified.
class ThreadScreen extends StatelessWidget {
  const ThreadScreen({super.key, required this.threadId});

  /// Path parameter from `/thread/:threadId`.
  final String threadId;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thread'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                'Thread view \u2014 lands here (M3)',
                style: textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'threadId: ${threadId.isEmpty ? '(missing)' : threadId}',
                style: textTheme.bodyMedium
                    ?.copyWith(color: scheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
