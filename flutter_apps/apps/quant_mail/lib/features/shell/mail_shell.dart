// The Quant Mail shell: five labelled pillars in the bottom bar, the left
// drawer for Mail, and the session guard. Pillars other than Mail are built the
// first time they are opened. The shell is never shown without a real session:
// when the session is missing or ends, it replaces itself with Sign in.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_providers.dart';
import '../../data/models/session_models.dart';
import '../../design/components/components.dart';
import '../../design/quant_mail_tokens.dart';
import '../../screens/auth/quant_login_screen.dart';
import '../../screens/quantgit/quantgit_pillar_view.dart';
import '../drawer/mail_drawer.dart';
import '../inbox/inbox_screen.dart';
import '../inbox/inbox_state.dart';
import 'pillar_views.dart';

const List<QmBarItem> kPillarBarItems = <QmBarItem>[
  QmBarItem(label: 'Mail', icon: Icons.mail_outline_rounded, selectedIcon: Icons.mail_rounded),
  QmBarItem(label: 'Calendar', icon: Icons.calendar_month_outlined, selectedIcon: Icons.calendar_month_rounded),
  QmBarItem(label: 'Drive', icon: Icons.folder_outlined, selectedIcon: Icons.folder_rounded),
  QmBarItem(label: 'Contacts', icon: Icons.people_outline_rounded, selectedIcon: Icons.people_rounded),
  QmBarItem(label: 'Git', icon: Icons.account_tree_outlined, selectedIcon: Icons.account_tree_rounded),
];

class MailShell extends ConsumerStatefulWidget {
  const MailShell({super.key});

  @override
  ConsumerState<MailShell> createState() => _MailShellState();
}

class _MailShellState extends ConsumerState<MailShell> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final Set<int> _visited = <int>{0};
  int _index = 0;
  bool _leaving = false;

  void _goToSignIn(String? message) {
    if (_leaving) return;
    _leaving = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (_) => QuantLoginScreen(initialNotice: message)),
        (Route<dynamic> _) => false,
      );
    });
  }

  Widget _pillar(int i) {
    if (!_visited.contains(i)) return const SizedBox.shrink();
    switch (i) {
      case 0:
        return InboxScreen(onOpenDrawer: () => _scaffoldKey.currentState?.openDrawer());
      case 1:
        return const CalendarPillarView();
      case 2:
        return const DrivePillarView();
      case 3:
        return const ContactsPillarView();
      default:
        return const QuantGitPillarView();
    }
  }

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final SessionState watched = ref.watch(sessionStateProvider);
    // The repository is the truth; the watched value only triggers rebuilds.
    final SessionState session = ref.read(sessionRepositoryProvider).state;
    if (!session.isSignedIn) {
      _goToSignIn(session.endedMessage ?? watched.endedMessage);
      return Scaffold(backgroundColor: t.canvas, body: const SizedBox.expand());
    }
    final bool selecting = ref.watch(selectedIdsProvider).isNotEmpty;

    return PopScope(
      canPop: _index == 0 && !selecting,
      onPopInvokedWithResult: (bool didPop, Object? _) {
        if (didPop) return;
        if (selecting) {
          ref.read(selectedIdsProvider.notifier).clear();
        } else {
          setState(() => _index = 0);
        }
      },
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: t.canvas,
        drawer: _index == 0 ? const MailDrawer() : null,
        drawerEdgeDragWidth: 24,
        drawerScrimColor: t.scrim,
        body: SafeArea(
          bottom: false,
          child: IndexedStack(
            index: _index,
            children: <Widget>[for (int i = 0; i < kPillarBarItems.length; i++) _pillar(i)],
          ),
        ),
        bottomNavigationBar: QmBottomBar(
          items: kPillarBarItems,
          currentIndex: _index,
          onSelected: (int i) => setState(() {
            _visited.add(i);
            _index = i;
          }),
        ),
      ),
    );
  }
}
