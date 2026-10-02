// ============================================================================
// gram_app - home shell (placeholder, Shift 1)
// (QuantGram Shift 1, W4: router + screens)
// ============================================================================
//
// BottomNavigationBar shell: Feed / Camera / Profile tabs. Har tab abhi
// sirf centered placeholder text dikhata hai — Shift 2+ me feed vertical
// slice aayegi. **Koi invented API calls nahi.**

import 'package:flutter/material.dart';

import 'feed_screen.dart';
import 'profile_screen.dart';

/// Home shell: tab navigation ka skeleton.
///
/// Shift 2: Feed tab = FeedScreen, Profile tab = ProfileScreen stub.
/// Camera abhi placeholder hai (Shift 3).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  /// Tab bodies — non-const so real screens (not just placeholders) can
  /// sit behind each tab. Bodies are built once per state, not per build.
  late final List<_Tab> _tabs = <_Tab>[
    const _Tab(
      label: 'Feed',
      icon: Icons.home_outlined,
      activeIcon: Icons.home,
      body: FeedScreen(),
    ),
    const _Tab(
      label: 'Camera',
      icon: Icons.camera_alt_outlined,
      activeIcon: Icons.camera_alt,
      body: _TabPlaceholder(
        icon: Icons.camera_alt_outlined,
        text: 'Camera — Shift 3 me',
      ),
    ),
    const _Tab(
      label: 'Profile',
      icon: Icons.person_outline,
      activeIcon: Icons.person,
      body: ProfileScreen(),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _tabs[_currentIndex].body,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (int index) => setState(() => _currentIndex = index),
        items: <BottomNavigationBarItem>[
          for (final _Tab t in _tabs)
            BottomNavigationBarItem(
              icon: Icon(t.icon),
              activeIcon: Icon(t.activeIcon),
              label: t.label,
            ),
        ],
      ),
    );
  }
}

class _Tab {
  const _Tab({
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.body,
  });

  final String label;
  final IconData icon;
  final IconData activeIcon;
  final Widget body;
}

/// Centered placeholder for tabs not built yet (Camera — Shift 3).
class _TabPlaceholder extends StatelessWidget {
  const _TabPlaceholder({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              icon,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              text,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
