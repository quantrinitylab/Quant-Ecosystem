// ============================================================================
// gram_app - profile screen (Shift 2 stub, W2)
// ============================================================================
//
// Stub: avatar placeholder + text. Avatar grid + profile header land in
// Shift 4, after the QuantGram API spec ships.

import 'package:flutter/material.dart';

/// User profile screen — Shift 4 vertical slice will fill this in.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        centerTitle: false,
      ),
      body: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            CircleAvatar(
              radius: 40,
              child: Icon(Icons.person, size: 40),
            ),
            SizedBox(height: 16),
            Text('Profile — Shift 4 me'),
          ],
        ),
      ),
    );
  }
}
