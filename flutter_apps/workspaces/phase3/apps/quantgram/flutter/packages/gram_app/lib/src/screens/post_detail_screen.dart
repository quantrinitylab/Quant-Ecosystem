// ============================================================================
// gram_app - post detail screen (Shift 2 stub, W2)
// ============================================================================
//
// Stub: full post detail (comments, viewer) lands in Shift 3, after the
// QuantGram API spec ships. Route coordinator wires this.

import 'package:flutter/material.dart';

/// Single-post detail view.
///
/// Takes [postId] so the route coordinator can pass it straight through;
/// body is a stub until Shift 3.
class PostDetailScreen extends StatelessWidget {
  const PostDetailScreen({required this.postId, super.key});

  final String postId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Post')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Post detail — Shift 3 me (spec ke baad)',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
