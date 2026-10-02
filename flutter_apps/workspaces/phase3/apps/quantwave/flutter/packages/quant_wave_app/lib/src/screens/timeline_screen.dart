// ============================================================================
// quant_wave_app - QuantWave tab shell (Phase 3, shift 2)
// ============================================================================
//
// Post-login home: a bottom-nav tab shell with four tabs — Timeline,
// Notifications, Messages, Profile. The bodies are placeholders
// (see `tabs/app_tabs.dart`): the QuantWave OpenAPI spec does not exist yet
// (app-foundations/quantwave/ is empty), so NO API data is wired and NO
// endpoint is invented. When the spec lands, each tab becomes a vertical
// slice wired against it.
//
// The router's auth gate owns access control: this shell is only reachable
// while the session is [AuthAuthenticated] (/login -> /timeline redirect).

import 'package:flutter/material.dart';

import 'tabs/app_tabs.dart';

/// Tab-shell route target for `/timeline` (the post-login home).
///
/// [IndexedStack] keeps each tab's scroll position alive across tab
/// switches without rebuilding; the [BottomNavigationBar] switches the
/// active index. Tab contents are placeholders pending the API spec
/// (TODO(UNVERIFIED) markers in `tabs/app_tabs.dart`).
class TimelineScreen extends StatefulWidget {
  /// Creates the QuantWave tab shell.
  const TimelineScreen({super.key});

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  int _currentIndex = 0;

  static const List<String> _titles = <String>[
    'Timeline',
    'Notifications',
    'Messages',
    'Profile',
  ];

  static const List<Widget> _bodies = <Widget>[
    TimelineTabBody(),
    NotificationsTabBody(),
    MessagesTabBody(),
    ProfileTabBody(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_currentIndex]),
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: _bodies,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (int index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        items: const <BottomNavigationBarItem>[
          BottomNavigationBarItem(
            icon: Icon(Icons.dynamic_feed_outlined),
            activeIcon: Icon(Icons.dynamic_feed),
            label: 'Timeline',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.notifications_outlined),
            activeIcon: Icon(Icons.notifications),
            label: 'Notifications',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.chat_bubble_outline),
            activeIcon: Icon(Icons.chat_bubble),
            label: 'Messages',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
