import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

import '../../models/mail_models.dart';
import 'quantmail_superapp_bar.dart';
import '../mail/thread_detail_screen.dart';
import '../composer/email_composer_modal.dart';
import '../composer/undo_send_bar.dart';
import '../composer/undo_send_manager.dart';
import '../account/account_profile_sheet.dart';
import '../quantgit/quantgit_pillar_view.dart';
import 'quant_workplace_splash_screen.dart';

/// Sovereign QuantMail Super-App Home Screen — 1:1 with Chrome Mobile (`quantmail.in`)
///
/// Key architectural laws:
/// - Top 5-Pillar Connected Liquid Switcher with 3D mascot logos (`mail`, `calendar`,
///   `drive`, `contacts`, `quantgit`) + circular `QM` AccountBadge.
/// - Hide-on-scroll: scrolling down collapses the top 5-pillar switcher (`0dp`) so
///   the Search Bar row (`Search + ⌘ + Ember`) moves to the very top of the screen;
///   scrolling up or reaching top reveals it immediately.
/// - ZERO redundant mobile overlay sidebars or hamburger (`☰`) buttons.
/// - ZERO duplicate filter/tab rows.
/// - Single Connected Liquid Bottom Bar (`QuantContextBottomBar`) per pillar + circular `+` FAB.
class SuperAppHomeScreen extends StatefulWidget {
  final QuantPillar initialPillar;
  final int initialSubViewIndex;

  const SuperAppHomeScreen({
    super.key,
    this.initialPillar = QuantPillar.mail,
    this.initialSubViewIndex = 0,
  });

  @override
  State<SuperAppHomeScreen> createState() => _SuperAppHomeScreenState();
}

class _SuperAppHomeScreenState extends State<SuperAppHomeScreen> {
  late QuantPillar _activePillar;
  late int _activeSubViewIndex;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  bool _isListeningVoice = false;

  // Hide-on-scroll state for the top 5-pillar switcher
  bool _isHeaderHidden = false;
  double _lastScrollPixels = 0.0;

  // Mail view state:
  // Top sliding toggle in Search bar row: 'inbox' | 'structured'
  String _mailViewMode = 'inbox';
  // Focus bar tabs in 'inbox' mode: 'All', 'Unread', 'Drafts', 'Contacts', 'Spam'
  String _activeInboxFocusTab = 'All';
  // Sub-tabs in 'structured' mode: 'All', 'Log', 'Groups', 'Updates'
  String _activeStructuredSubTab = 'All';
  // Toggle to preview populated threads vs empty inbox hero
  bool _showSampleThreads = false;

  // Unified Multi-Account Hub state (Primary QuantMail + Linked Gmail accounts)
  String _activeAccountFilter = 'all';
  bool _quantyUnifiedAccess = true;
  final List<Map<String, dynamic>> _linkedAccounts = [
    {
      'id': 'sentinel@quantmail.in',
      'email': 'sentinel@quantmail.in',
      'name': 'Dev Sentinel',
      'provider': 'QuantMail Primary',
      'isPrimary': true,
      'color': const Color(0xFFFF6B35),
      'unread': 2,
      'status': 'Sovereign E2EE · Synced',
    },
    {
      'id': 'alex.quant@gmail.com',
      'email': 'alex.quant@gmail.com',
      'name': 'Alex (Personal Gmail)',
      'provider': 'Gmail · OAuth 2.0',
      'isPrimary': false,
      'color': const Color(0xFFEA4335),
      'unread': 5,
      'status': 'Gmail Connected · Instant Sync',
    },
    {
      'id': 'founder.ops@gmail.com',
      'email': 'founder.ops@gmail.com',
      'name': 'Founder Ops (Work Gmail)',
      'provider': 'Gmail · Workspace',
      'isPrimary': false,
      'color': const Color(0xFF4285F4),
      'unread': 3,
      'status': 'Gmail Connected · Instant Sync',
    },
  ];

  // Drive filter chip state
  String _activeDriveFilter = 'All';

  // Domain state
  late List<MailThread> _allThreads;
  final Set<String> _starredThreadIds = {};

  // Honest badge counters
  final Map<QuantPillar, int> _pillarBadges = {
    QuantPillar.mail: 0,
    QuantPillar.calendar: 0,
    QuantPillar.drive: 0,
    QuantPillar.contacts: 0,
    QuantPillar.quantGit: 0,
  };

  final UndoSendManager _undoSendManager = UndoSendManager.instance;

  static const List<QuantPillar> _orderedPillars = [
    QuantPillar.mail,
    QuantPillar.calendar,
    QuantPillar.drive,
    QuantPillar.contacts,
    QuantPillar.quantGit,
  ];

  @override
  void initState() {
    super.initState();
    _activePillar = widget.initialPillar;
    _activeSubViewIndex = widget.initialSubViewIndex;
    _allThreads = MailThread.sampleThreads();
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    setState(() {
      _searchQuery = _searchController.text.trim();
    });
  }

  void _onPillarChanged(QuantPillar pillar) {
    if (_activePillar == pillar) {
      setState(() {
        _activeSubViewIndex = 0;
        _isHeaderHidden = false;
        _searchController.clear();
      });
      return;
    }
    setState(() {
      _activePillar = pillar;
      _activeSubViewIndex = 0;
      _isHeaderHidden = false;
      _lastScrollPixels = 0.0;
      _searchController.clear();
    });
  }

  bool _handleScrollNotification(ScrollNotification notification) {
    if (notification.metrics.axis != Axis.vertical) return false;

    if (notification is ScrollUpdateNotification) {
      final delta = notification.scrollDelta ?? 0.0;
      final isUserDrag = notification.dragDetails != null;

      if (delta > 3.0 && isUserDrag && !_isHeaderHidden) {
        setState(() => _isHeaderHidden = true);
      } else if (delta < -4.0 && isUserDrag && _isHeaderHidden) {
        setState(() => _isHeaderHidden = false);
      }
    } else if (notification is OverscrollNotification) {
      if (notification.overscroll > 3.0 && !_isHeaderHidden) {
        setState(() => _isHeaderHidden = true);
      } else if (notification.overscroll < -4.0 && _isHeaderHidden) {
        setState(() => _isHeaderHidden = false);
      }
    }
    return false;
  }

  List<QuantContextNavItem> _bottomItemsForPillar(QuantPillar pillar) {
    switch (pillar) {
      case QuantPillar.mail:
        return const [
          QuantContextNavItem(
            id: 'inbox',
            label: 'Inbox',
            icon: Icons.inbox_rounded,
          ),
          QuantContextNavItem(
            id: 'quanty',
            label: 'Quanty',
            isQuantyLogoOnly: true,
          ),
          QuantContextNavItem(
            id: 'sent',
            label: 'Sent',
            icon: Icons.send_outlined,
          ),
          QuantContextNavItem(
            id: 'drafts',
            label: 'Drafts',
            icon: Icons.description_outlined,
          ),
          QuantContextNavItem(
            id: 'profile',
            label: 'Profile',
            isProfileAvatar: true,
            profileInitials: 'QM',
          ),
        ];
      case QuantPillar.calendar:
        return const [
          QuantContextNavItem(
            id: 'day',
            label: 'Day',
            icon: Icons.calendar_view_day_rounded,
          ),
          QuantContextNavItem(
            id: 'week',
            label: 'Week',
            icon: Icons.view_week_outlined,
          ),
          QuantContextNavItem(
            id: 'month',
            label: 'Month',
            icon: Icons.calendar_month_outlined,
          ),
          QuantContextNavItem(
            id: 'profile',
            label: 'Profile',
            isProfileAvatar: true,
            profileInitials: 'QM',
          ),
        ];
      case QuantPillar.drive:
        return const [
          QuantContextNavItem(
            id: 'my-drive',
            label: 'My Drive',
            icon: Icons.folder_outlined,
          ),
          QuantContextNavItem(
            id: 'recent',
            label: 'Recent',
            icon: Icons.access_time_rounded,
          ),
          QuantContextNavItem(
            id: 'starred',
            label: 'Starred',
            icon: Icons.star_border_rounded,
          ),
          QuantContextNavItem(
            id: 'profile',
            label: 'Profile',
            isProfileAvatar: true,
            profileInitials: 'QM',
          ),
        ];
      case QuantPillar.contacts:
        return const [
          QuantContextNavItem(
            id: 'all',
            label: 'All',
            icon: Icons.people_outline_rounded,
          ),
          QuantContextNavItem(
            id: 'favorites',
            label: 'Favorites',
            icon: Icons.star_border_rounded,
          ),
          QuantContextNavItem(
            id: 'profile',
            label: 'Profile',
            isProfileAvatar: true,
            profileInitials: 'QM',
          ),
        ];
      case QuantPillar.quantGit:
        return const [
          QuantContextNavItem(
            id: 'repos',
            label: 'Repositories',
            icon: Icons.account_tree_outlined,
          ),
          QuantContextNavItem(
            id: 'overview',
            label: 'Overview',
            icon: Icons.grid_view_rounded,
          ),
          QuantContextNavItem(
            id: 'profile',
            label: 'Profile',
            isProfileAvatar: true,
            profileInitials: 'QM',
          ),
        ];
    }
  }

  void _onBottomNavTap(int index) {
    final items = _bottomItemsForPillar(_activePillar);
    if (index < 0 || index >= items.length) return;
    final tapped = items[index];
    if (tapped.isQuantyLogoOnly) {
      _showQuantyAgentSheet();
      return;
    }
    setState(() {
      _activeSubViewIndex = index;
    });
  }

  void _showLinkGmailModal() {
    final emailCtrl = TextEditingController();
    final nameCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF14161D),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24.0)),
        side: BorderSide(color: Color(0xFF232938), width: 1.0),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20.0,
            right: 20.0,
            top: 16.0,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24.0,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 38.0,
                  height: 4.0,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2.0),
                  ),
                ),
              ),
              const SizedBox(height: 16.0),
              Row(
                children: [
                  Container(
                    width: 38.0,
                    height: 38.0,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEA4335).withOpacity(0.16),
                      borderRadius: BorderRadius.circular(10.0),
                      border: Border.all(
                        color: const Color(0xFFEA4335).withOpacity(0.45),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: const Text(
                      'G',
                      style: TextStyle(
                        color: Color(0xFFEA4335),
                        fontSize: 18.0,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12.0),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Link External Gmail Account',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16.0,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        SizedBox(height: 2.0),
                        Text(
                          'Connect inside your primary QuantMail account with Quanty AI unified access',
                          style: TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16.0),
              TextField(
                controller: emailCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 13.5),
                decoration: InputDecoration(
                  labelText: 'Gmail Address (e.g. team@gmail.com)',
                  labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12.5),
                  filled: true,
                  fillColor: const Color(0xFF0E1017),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12.0),
                    borderSide: const BorderSide(color: Color(0xFF232938)),
                  ),
                ),
              ),
              const SizedBox(height: 10.0),
              TextField(
                controller: nameCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 13.5),
                decoration: InputDecoration(
                  labelText: 'Account Label (e.g. Personal / Startup Gmail)',
                  labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12.5),
                  filled: true,
                  fillColor: const Color(0xFF0E1017),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12.0),
                    borderSide: const BorderSide(color: Color(0xFF232938)),
                  ),
                ),
              ),
              const SizedBox(height: 16.0),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    final email = emailCtrl.text.trim().isEmpty
                        ? 'quant.team@gmail.com'
                        : emailCtrl.text.trim();
                    final label = nameCtrl.text.trim().isEmpty
                        ? 'Linked Gmail ($email)'
                        : nameCtrl.text.trim();
                    setState(() {
                      _linkedAccounts.add({
                        'id': email,
                        'email': email,
                        'name': label,
                        'provider': 'Gmail · OAuth 2.0',
                        'isPrimary': false,
                        'color': const Color(0xFFEA4335),
                        'unread': 1,
                        'status': 'Gmail Connected · Instant Sync',
                      });
                    });
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        backgroundColor: const Color(0xFF16181F),
                        content: Text(
                          'Linked $email to your QuantMail Hub (Quanty AI synced)',
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.add_link_rounded, size: 18.0),
                  label: const Text('Connect Gmail via OAuth 2.0'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFF6B35),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13.0),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12.0),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ===========================================================================
  // SHEETS & DIALOGS (Command Palette, Quanty Ember Agent, Voice Search, Profile)
  // ===========================================================================

  void _showCommandPaletteSheet() {
    final accent = PillarVisuals.accentFor(_activePillar);
    final commands = [
      {
        'icon': Icons.all_inclusive_rounded,
        'label': 'QuantWorkplace Revolving Splash',
        'shortcut': '⌘W',
        'onTap': () {
          Navigator.pop(context);
          QuantWorkplaceSplashScreen.showPreview(context);
        },
      },
      {
        'icon': Icons.edit_outlined,
        'label': 'Compose new email',
        'shortcut': 'C',
        'onTap': () {
          Navigator.pop(context);
          _openEmailComposer();
        },
      },
      {
        'icon': Icons.auto_awesome_rounded,
        'label': 'Ask Ember (Quanty AI)',
        'shortcut': '⌘J',
        'onTap': () {
          Navigator.pop(context);
          _showQuantyAgentSheet();
        },
      },
      {
        'icon': Icons.mail_outline_rounded,
        'label': 'Switch to QuantMail Inbox',
        'shortcut': 'G I',
        'onTap': () {
          Navigator.pop(context);
          _onPillarChanged(QuantPillar.mail);
        },
      },
      {
        'icon': Icons.calendar_today_rounded,
        'label': 'Switch to QuantCalendar',
        'shortcut': 'G C',
        'onTap': () {
          Navigator.pop(context);
          _onPillarChanged(QuantPillar.calendar);
        },
      },
      {
        'icon': Icons.folder_open_rounded,
        'label': 'Switch to QuantDrive',
        'shortcut': 'G D',
        'onTap': () {
          Navigator.pop(context);
          _onPillarChanged(QuantPillar.drive);
        },
      },
      {
        'icon': Icons.people_outline_rounded,
        'label': 'Switch to Contacts',
        'shortcut': 'G P',
        'onTap': () {
          Navigator.pop(context);
          _onPillarChanged(QuantPillar.contacts);
        },
      },
      {
        'icon': Icons.code_rounded,
        'label': 'Switch to QuantGit',
        'shortcut': 'G G',
        'onTap': () {
          Navigator.pop(context);
          _onPillarChanged(QuantPillar.quantGit);
        },
      },
    ];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF14161D),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22.0)),
        side: BorderSide(color: Color(0xFF232938), width: 1.0),
      ),
      builder: (ctx) {
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16.0, 12.0, 16.0, 24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36.0,
                  height: 4.0,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2.0),
                  ),
                ),
                const SizedBox(height: 14.0),
                Row(
                  children: [
                    Icon(
                      Icons.keyboard_command_key_rounded,
                      size: 18.0,
                      color: accent,
                    ),
                    const SizedBox(width: 8.0),
                    const Text(
                      'Command Palette',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15.0,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12.0),
                ...commands.map((cmd) {
                  return ListTile(
                    dense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 8.0),
                    leading: Icon(
                      cmd['icon'] as IconData,
                      color: Colors.white70,
                      size: 20.0,
                    ),
                    title: Text(
                      cmd['label'] as String,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8.0,
                        vertical: 3.0,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E2230),
                        borderRadius: BorderRadius.circular(6.0),
                        border: Border.all(color: Colors.white12),
                      ),
                      child: Text(
                        cmd['shortcut'] as String,
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 11.0,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    onTap: cmd['onTap'] as VoidCallback,
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showQuantyAgentSheet() {
    final accent = PillarVisuals.accentFor(_activePillar);
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF14161D),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24.0)),
        side: BorderSide(color: Color(0xFF232938), width: 1.0),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20.0, 14.0, 20.0, 24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36.0,
                  height: 4.0,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2.0),
                  ),
                ),
                const SizedBox(height: 18.0),
                Container(
                  width: 68.0,
                  height: 68.0,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: accent, width: 2.0),
                    boxShadow: [
                      BoxShadow(
                        color: accent.withOpacity(0.35),
                        blurRadius: 16.0,
                      ),
                    ],
                  ),
                  padding: const EdgeInsets.all(3.0),
                  child: ClipOval(
                    child: Image.asset(
                      'assets/mascots/ember.webp',
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
                const SizedBox(height: 12.0),
                const Text(
                  'Ember · Quanty Live Agent',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17.0,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4.0),
                Text(
                  _quantyUnifiedAccess
                      ? 'Unified AI access active across sentinel@quantmail.in + ${_linkedAccounts.length - 1} linked Gmail accounts.'
                      : 'Triage inbox, draft replies, schedule meetings, or search across Mail, Drive & QuantGit.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 12.5,
                  ),
                ),
                const SizedBox(height: 18.0),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => Navigator.pop(ctx),
                        icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18.0),
                        label: const Text('Chat Copilot'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: accent,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13.0),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12.0),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10.0),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.pop(ctx),
                        icon: const Icon(Icons.graphic_eq_rounded, size: 18.0),
                        label: const Text('Voice Live'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Color(0xFF2D3548)),
                          padding: const EdgeInsets.symmetric(vertical: 13.0),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12.0),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showVoiceSearchModal() {
    setState(() => _isListeningVoice = true);
    final accent = PillarVisuals.accentFor(_activePillar);

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF14161D),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24.0)),
        side: BorderSide(color: Color(0xFF232938), width: 1.0),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 60.0,
                  height: 60.0,
                  decoration: BoxDecoration(
                    color: accent.withOpacity(0.15),
                    shape: BoxShape.circle,
                    border: Border.all(color: accent, width: 1.5),
                  ),
                  child: Icon(Icons.mic_rounded, size: 30.0, color: accent),
                ),
                const SizedBox(height: 14.0),
                const Text(
                  'Listening for Voice Search...',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16.0,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 16.0),
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text(
                    'Cancel',
                    style: TextStyle(color: Color(0xFF94A3B8)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ).whenComplete(() {
      if (mounted) setState(() => _isListeningVoice = false);
    });
  }

  void _showAccountProfileSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const AccountProfileSheet(),
    );
  }

  void _openEmailComposer() {
    EmailComposerModal.show(
      context,
      onSendQueued: (draft) {
        _undoSendManager.enqueueDraft(
          draft: draft,
          onFinalSend: (d) async {
            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                backgroundColor: QuantColors.darkSlateSurface,
                content: Text(
                  'Email sent to ${d.to.map((r) => r.email).join(', ')}',
                ),
              ),
            );
          },
          onRecall: (_) {},
        );
      },
    );
  }

  // ===========================================================================
  // MAIN SCAFFOLD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final accent = PillarVisuals.accentFor(_activePillar);
    final bottomItems = _bottomItemsForPillar(_activePillar);
    final isProfileSubView =
        _activeSubViewIndex == bottomItems.length - 1 &&
        bottomItems.isNotEmpty &&
        bottomItems.last.isProfileAvatar;

    return Scaffold(
      backgroundColor: const Color(0xFF090A0E),
      body: Column(
        children: [
          // Sticky Top Bar: Full-width 5-Pillar 3D Mascot Liquid Glass Switcher
          // + Pinned Search Row (Search + Sliding Inbox/Structured Pill + Ember)
          QuantMailSuperAppBar(
            activePillar: _activePillar,
            onPillarSelected: _onPillarChanged,
            isHeaderHidden: _isHeaderHidden,
            searchController: _searchController,
            onSearchChanged: (_) => _onSearchChanged(),
            onVoiceSearchTap: _showVoiceSearchModal,
            onCommandPaletteTap: _showCommandPaletteSheet,
            onQuantyTap: _showQuantyAgentSheet,
            onProfileTap: _showAccountProfileSheet,
            isListeningVoice: _isListeningVoice,
            unreadCounts: _pillarBadges,
            accountInitials: 'QM',
            mailViewMode: _mailViewMode,
            onMailViewModeChanged: (mode) {
              setState(() {
                _mailViewMode = mode;
                // If user was on Profile tab in bottom bar, bring them back to Mail view
                if (isProfileSubView) {
                  _activeSubViewIndex = 0;
                }
              });
            },
          ),

          // Main Content Area with Connected Top Ambient Glow + Instant IndexedStack
          Expanded(
            child: Stack(
              children: [
                // Connected Top Ambient Glow flowing from the active pillar switcher into the screen
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 76.0,
                  child: IgnorePointer(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 240),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            accent.withOpacity(0.14),
                            accent.withOpacity(0.04),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                // Top 1px glowing connector meniscus line
                Positioned(
                  top: 0,
                  left: 24.0,
                  right: 24.0,
                  height: 1.0,
                  child: IgnorePointer(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 240),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            Colors.transparent,
                            accent.withOpacity(0.45),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                NotificationListener<ScrollNotification>(
                  onNotification: _handleScrollNotification,
                  child: isProfileSubView
                      ? _buildUnifiedProfileHubView()
                      : _buildPillarBody(),
                ),

                // 10-Second Undo Send Bar
                Positioned(
                  left: 16.0,
                  right: 16.0,
                  bottom: 16.0,
                  child: UndoSendBar(manager: _undoSendManager),
                ),

                // Circular Per-Pillar `+` FAB (matches Chrome Mobile QuantFab)
                if (_activePillar != QuantPillar.quantGit && !isProfileSubView)
                  Positioned(
                    right: 16.0,
                    bottom: 14.0,
                    child: GestureDetector(
                      onTap: _onFabTap,
                      child: Container(
                        width: 54.0,
                        height: 54.0,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: accent,
                          boxShadow: [
                            BoxShadow(
                              color: accent.withOpacity(0.42),
                              blurRadius: 16.0,
                              offset: const Offset(0, 5),
                            ),
                          ],
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.add_rounded,
                          size: 28.0,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Single Connected Liquid Contextual Bottom Bar (with Profile at rightmost slot)
          QuantContextBottomBar(
            items: bottomItems,
            activeIndex: _activeSubViewIndex,
            accentColor: accent,
            onTap: _onBottomNavTap,
          ),
        ],
      ),
    );
  }

  void _onFabTap() {
    switch (_activePillar) {
      case QuantPillar.mail:
        _openEmailComposer();
        break;
      case QuantPillar.calendar:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFF16181F),
            content: Text('New calendar event'),
          ),
        );
        break;
      case QuantPillar.drive:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFF16181F),
            content: Text('Upload files to QuantDrive'),
          ),
        );
        break;
      case QuantPillar.contacts:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFF16181F),
            content: Text('Create new contact'),
          ),
        );
        break;
      case QuantPillar.quantGit:
        break;
    }
  }

  // ===========================================================================
  // PILLAR BODY DISPATCHER (Instant 0ms IndexedStack Switching)
  // ===========================================================================

  Widget _buildPillarBody() {
    final pillarIndex = _orderedPillars.indexOf(_activePillar);
    return IndexedStack(
      index: pillarIndex < 0 ? 0 : pillarIndex,
      children: [
        _buildMailPillarView(),
        _buildCalendarPillarView(),
        _buildDrivePillarView(),
        _buildContactsPillarView(),
        QuantGitPillarView(
          activeSubViewIndex: _activeSubViewIndex.clamp(0, 1),
          onSubViewChanged: (idx) => setState(() => _activeSubViewIndex = idx),
        ),
      ],
    );
  }

  // ===========================================================================
  // 1. MAIL PILLAR VIEW — Clean Layout (NO Extra Row Below Search Bar!)
  // ===========================================================================

  Widget _buildMailPillarView() {
    return Column(
      children: [
        if (_mailViewMode == 'inbox')
          Padding(
            padding: const EdgeInsets.fromLTRB(12.0, 4.0, 12.0, 6.0),
            child: _buildInboxFocusBar(),
          ),
        Expanded(
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(12.0, 6.0, 12.0, 96.0),
            children: [
              if (_mailViewMode == 'inbox') ...[
                if (!_showSampleThreads && _searchQuery.isEmpty)
                  _buildChromeMobileEmptyInboxHero()
                else
                  ..._buildFilteredThreadCards(),
              ] else ...[
                // `Structured` View Mode (`All | Log | Groups | Updates` + Linked Accounts)
                _buildStructuredViewBody(),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInboxFocusBar() {
    const tabs = ['All', 'Unread', 'Drafts', 'Contacts', 'Spam'];
    const accent = Color(0xFFFF6B35);

    return Row(
      children: [
        Expanded(
          child: Container(
            height: 40.0,
            padding: const EdgeInsets.symmetric(horizontal: 4.0, vertical: 4.0),
            decoration: BoxDecoration(
              color: const Color(0xFF14161D),
              borderRadius: BorderRadius.circular(14.0),
              border: Border.all(color: const Color(0xFF232938), width: 1.0),
            ),
            child: Row(
              children: tabs.map((tab) {
                final isSelected = _activeInboxFocusTab == tab;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _activeInboxFocusTab = tab),
                    behavior: HitTestBehavior.opaque,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFF1E2230)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(10.0),
                        border: isSelected
                            ? Border.all(
                                color: accent.withOpacity(0.65),
                                width: 1.0,
                              )
                            : null,
                      ),
                      child: Text(
                        tab,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: isSelected
                              ? Colors.white
                              : const Color(0xFF94A3B8),
                          fontSize: 11.5,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ),
        const SizedBox(width: 8.0),
        // Right Circular Filter Icon Button
        GestureDetector(
          onTap: () {
            setState(() => _showSampleThreads = !_showSampleThreads);
          },
          behavior: HitTestBehavior.opaque,
          child: Tooltip(
            message: _showSampleThreads
                ? 'Show empty inbox state'
                : 'Preview sample threads',
            child: Container(
              width: 40.0,
              height: 40.0,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF14161D),
                border: Border.all(
                  color: _showSampleThreads
                      ? accent.withOpacity(0.75)
                      : const Color(0xFF232938),
                  width: 1.0,
                ),
              ),
              alignment: Alignment.center,
              child: Icon(
                Icons.tune_rounded,
                size: 18.0,
                color: _showSampleThreads ? accent : const Color(0xFF94A3B8),
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// Exact 1:1 Chrome Mobile Empty Inbox State:
  /// 3D Mail Envelope Mascot (`mail-lg.png`) + "All done for the day" +
  /// "Enjoy your empty inbox." + "Compose new email" pill button.
  Widget _buildChromeMobileEmptyInboxHero() {
    return Padding(
      padding: const EdgeInsets.only(top: 56.0, bottom: 240.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          GestureDetector(
            onTap: () => QuantWorkplaceSplashScreen.showPreview(context),
            behavior: HitTestBehavior.opaque,
            child: Image.asset(
              'assets/mascots/mail-lg.png',
              width: 108.0,
              height: 108.0,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
            ),
          ),
          const SizedBox(height: 18.0),
          const Text(
            'All done for the day',
            style: TextStyle(
              color: Colors.white,
              fontSize: 17.5,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 6.0),
          const Text(
            'Enjoy your empty inbox.',
            style: TextStyle(
              color: Color(0xFF94A3B8),
              fontSize: 13.0,
              fontWeight: FontWeight.w400,
            ),
          ),
          const SizedBox(height: 20.0),
          GestureDetector(
            onTap: _openEmailComposer,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 20.0,
                vertical: 11.0,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFF16181F),
                borderRadius: BorderRadius.circular(12.0),
                border: Border.all(
                  color: const Color(0xFF262C3D),
                  width: 1.0,
                ),
              ),
              child: const Text(
                'Compose new email',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13.0,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Upgraded `Structured` View (formerly `People`):
  /// - Unified Linked Accounts Filter Bar (`All Accounts`, `@quantmail.in`, linked `@gmail.com`, `+ Add Gmail`)
  /// - `All | Log | Groups | Updates` segmented bar
  /// - Structured multi-account conversation cards + Quanty AI unified access badge
  Widget _buildStructuredViewBody() {
    const subTabs = [
      {'id': 'All', 'icon': Icons.grid_view_rounded},
      {'id': 'Log', 'icon': Icons.people_outline_rounded},
      {'id': 'Groups', 'icon': Icons.groups_outlined},
      {'id': 'Updates', 'icon': Icons.notifications_none_rounded},
    ];
    const accent = Color(0xFFFF6B35);

    final structuredStreams = [
      {
        'sender': 'Google Cloud Billing',
        'email': 'billing-noreply@google.com',
        'account': 'founder.ops@gmail.com',
        'accountTag': 'Gmail · Work',
        'tagColor': const Color(0xFF4285F4),
        'category': 'Updates',
        'count': 4,
        'snippet': 'Invoice & Oracle Cloud migration settlement summary ready for review.',
        'time': '11:20 AM',
      },
      {
        'sender': 'Quant Core Engineering',
        'email': 'core-team@quantmail.in',
        'account': 'sentinel@quantmail.in',
        'accountTag': 'QuantMail Primary',
        'tagColor': const Color(0xFFFF6B35),
        'category': 'Groups',
        'count': 9,
        'snippet': 'Liquid glass morphism + 5-pillar instant switcher deployed to production.',
        'time': '10:45 AM',
      },
      {
        'sender': 'Rohan Verma',
        'email': 'rohan.v@gmail.com',
        'account': 'alex.quant@gmail.com',
        'accountTag': 'Gmail · Personal',
        'tagColor': const Color(0xFFEA4335),
        'category': 'Log',
        'count': 3,
        'snippet': 'Sent the updated APK test build notes and API keys.',
        'time': 'Yesterday',
      },
    ].where((item) {
      if (_activeAccountFilter != 'all' &&
          item['account'] != _activeAccountFilter) {
        return false;
      }
      if (_activeStructuredSubTab != 'All' &&
          item['category'] != _activeStructuredSubTab) {
        return false;
      }
      return true;
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 2.0),
        // Header row with title + Quanty AI Unified Access pill
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Structured Streams',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 16.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(height: 2.0),
                  Text(
                    'Unified across QuantMail & linked Gmail accounts',
                    style: TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 11.8,
                    ),
                  ),
                ],
              ),
            ),
            GestureDetector(
              onTap: _showLinkGmailModal,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10.0,
                  vertical: 6.0,
                ),
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(10.0),
                  border: Border.all(color: accent.withOpacity(0.45)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add_link_rounded, size: 15.0, color: accent),
                    SizedBox(width: 4.0),
                    Text(
                      '+ Gmail',
                      style: TextStyle(
                        color: accent,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 10.0),

        // Horizontal Unified Account Filter Chips (`All Accounts` | `sentinel@quantmail.in` | `alex.quant@gmail.com` ...)
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildAccountFilterChip(
                id: 'all',
                label: 'All Accounts (${_linkedAccounts.length})',
                dotColor: accent,
              ),
              ..._linkedAccounts.map((acc) {
                return _buildAccountFilterChip(
                  id: acc['id'] as String,
                  label: acc['email'] as String,
                  dotColor: acc['color'] as Color,
                );
              }),
            ],
          ),
        ),

        const SizedBox(height: 10.0),

        // `All | Log | Groups | Updates` segmented bar
        Container(
          height: 40.0,
          padding: const EdgeInsets.all(4.0),
          decoration: BoxDecoration(
            color: const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(12.0),
            border: Border.all(color: const Color(0xFF232938)),
          ),
          child: Row(
            children: subTabs.map((t) {
              final id = t['id'] as String;
              final isSelected = _activeStructuredSubTab == id;
              return Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _activeStructuredSubTab = id),
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? accent.withOpacity(0.18)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(8.0),
                      border: isSelected
                          ? Border.all(color: accent.withOpacity(0.55), width: 1.0)
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          t['icon'] as IconData,
                          size: 14.0,
                          color: isSelected ? accent : const Color(0xFF94A3B8),
                        ),
                        const SizedBox(width: 4.5),
                        Flexible(
                          child: Text(
                            id,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: isSelected
                                  ? Colors.white
                                  : const Color(0xFF94A3B8),
                              fontSize: 11.5,
                              fontWeight: isSelected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),

        const SizedBox(height: 12.0),

        // Quanty AI Cross-Account Intelligence Banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 10.0),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                accent.withOpacity(0.14),
                const Color(0xFF141722),
              ],
            ),
            borderRadius: BorderRadius.circular(13.0),
            border: Border.all(color: accent.withOpacity(0.35)),
          ),
          child: Row(
            children: [
              ClipOval(
                child: Image.asset(
                  'assets/mascots/ember.webp',
                  width: 28.0,
                  height: 28.0,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(width: 10.0),
              Expanded(
                child: Text(
                  'Quanty AI has unified access across primary QuantMail + ${_linkedAccounts.length - 1} linked Gmail accounts',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 6.0),
              GestureDetector(
                onTap: _showQuantyAgentSheet,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8.0,
                    vertical: 4.0,
                  ),
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(8.0),
                  ),
                  child: const Text(
                    'Ask AI',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12.0),

        // Structured Stream Cards
        ...structuredStreams.map((stream) {
          final tagColor = stream['tagColor'] as Color;
          return Padding(
            padding: const EdgeInsets.only(bottom: 9.0),
            child: Container(
              padding: const EdgeInsets.all(13.0),
              decoration: BoxDecoration(
                color: const Color(0xFF14161D),
                borderRadius: BorderRadius.circular(14.0),
                border: Border.all(color: const Color(0xFF232938)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40.0,
                    height: 40.0,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: tagColor.withOpacity(0.16),
                      border: Border.all(color: tagColor.withOpacity(0.45)),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      (stream['sender'] as String)[0],
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15.0,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 11.0),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                stream['sender'] as String,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6.5,
                                vertical: 2.0,
                              ),
                              decoration: BoxDecoration(
                                color: tagColor.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(6.0),
                                border: Border.all(
                                  color: tagColor.withOpacity(0.4),
                                ),
                              ),
                              child: Text(
                                stream['accountTag'] as String,
                                style: TextStyle(
                                  color: Color.lerp(tagColor, Colors.white, 0.3),
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3.0),
                        Text(
                          stream['snippet'] as String,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 12.0,
                            height: 1.35,
                          ),
                        ),
                        const SizedBox(height: 6.0),
                        Row(
                          children: [
                            Icon(
                              Icons.forum_outlined,
                              size: 12.5,
                              color: accent.withOpacity(0.85),
                            ),
                            const SizedBox(width: 4.0),
                            Text(
                              '${stream['count']} messages in stream · ${stream['category']}',
                              style: const TextStyle(
                                color: Color(0xFF64748B),
                                fontSize: 11.0,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              stream['time'] as String,
                              style: const TextStyle(
                                color: Color(0xFF64748B),
                                fontSize: 10.5,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildAccountFilterChip({
    required String id,
    required String label,
    required Color dotColor,
  }) {
    final isSelected = _activeAccountFilter == id;
    return Padding(
      padding: const EdgeInsets.only(right: 6.0),
      child: GestureDetector(
        onTap: () => setState(() => _activeAccountFilter = id),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 10.0, vertical: 6.0),
          decoration: BoxDecoration(
            color: isSelected
                ? dotColor.withOpacity(0.18)
                : const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(999.0),
            border: Border.all(
              color: isSelected
                  ? dotColor.withOpacity(0.75)
                  : const Color(0xFF232938),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7.0,
                height: 7.0,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: dotColor,
                ),
              ),
              const SizedBox(width: 6.0),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                  fontSize: 11.2,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Unified Profile & Multi-Account Hub (opened when tapping `Profile` at the rightmost
  /// slot of the Bottom Navigation Bar):
  /// - Shows Primary QuantMail Account (`sentinel@quantmail.in`)
  /// - Shows all Linked External Gmail Accounts (`alex.quant@gmail.com`, `founder.ops@gmail.com`)
  /// - Interactive `+ Link Gmail Account` button
  /// - Quanty AI (Ember) Cross-Account Access toggle
  Widget _buildUnifiedProfileHubView() {
    final accent = PillarVisuals.accentFor(_activePillar);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      padding: const EdgeInsets.fromLTRB(12.0, 8.0, 12.0, 96.0),
      children: [
        // Primary QuantMail Sovereign Account Card
        Container(
          padding: const EdgeInsets.all(16.0),
          decoration: BoxDecoration(
            color: const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(18.0),
            border: Border.all(color: accent.withOpacity(0.45), width: 1.2),
          ),
          child: Row(
            children: [
              Container(
                width: 52.0,
                height: 52.0,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [accent, accent.withOpacity(0.65)],
                  ),
                ),
                alignment: Alignment.center,
                child: const Text(
                  'QM',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18.0,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 14.0),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Dev Sentinel',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16.0,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(width: 6.0),
                        Icon(
                          Icons.verified_rounded,
                          size: 16.0,
                          color: Color(0xFFFF6B35),
                        ),
                      ],
                    ),
                    SizedBox(height: 2.0),
                    Text(
                      'sentinel@quantmail.in · Primary QuantMail',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 12.0,
                      ),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: _showAccountProfileSheet,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10.0,
                    vertical: 6.0,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E2230),
                    borderRadius: BorderRadius.circular(10.0),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: const Text(
                    'Vault',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 14.0),

        // Quanty AI Cross-Account Access Card
        Container(
          padding: const EdgeInsets.all(14.0),
          decoration: BoxDecoration(
            color: const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(16.0),
            border: Border.all(color: const Color(0xFF232938)),
          ),
          child: Row(
            children: [
              ClipOval(
                child: Image.asset(
                  'assets/mascots/ember.webp',
                  width: 38.0,
                  height: 38.0,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(width: 12.0),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Quanty AI Unified Multi-Mailbox Access',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 2.0),
                    Text(
                      'Allow Ember AI to read, search & draft across primary QuantMail + all linked Gmail accounts',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 11.5,
                      ),
                    ),
                  ],
                ),
              ),
              Switch(
                value: _quantyUnifiedAccess,
                activeColor: accent,
                onChanged: (val) => setState(() => _quantyUnifiedAccess = val),
              ),
            ],
          ),
        ),

        const SizedBox(height: 16.0),

        // Linked Accounts Header + `+ Link Gmail Account` Button
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'CONNECTED MAILBOXES (${_linkedAccounts.length})',
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
              ),
            ),
            GestureDetector(
              onTap: _showLinkGmailModal,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10.0,
                  vertical: 5.0,
                ),
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(8.0),
                  border: Border.all(color: accent.withOpacity(0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add_rounded, size: 15.0, color: accent),
                    const SizedBox(width: 4.0),
                    Text(
                      'Link Gmail Account',
                      style: TextStyle(
                        color: accent,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 10.0),

        // Connected Accounts List (Primary QuantMail + Linked Gmail Accounts)
        ..._linkedAccounts.map((acc) {
          final color = acc['color'] as Color;
          final isPrimary = acc['isPrimary'] as bool;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8.0),
            child: Container(
              padding: const EdgeInsets.all(13.0),
              decoration: BoxDecoration(
                color: const Color(0xFF14161D),
                borderRadius: BorderRadius.circular(14.0),
                border: Border.all(
                  color: isPrimary
                      ? color.withOpacity(0.45)
                      : const Color(0xFF232938),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 38.0,
                    height: 38.0,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color.withOpacity(0.16),
                      border: Border.all(color: color.withOpacity(0.5)),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      isPrimary ? 'Q' : 'G',
                      style: TextStyle(
                        color: color,
                        fontSize: 15.0,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12.0),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          acc['name'] as String,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2.0),
                        Text(
                          '${acc['email']} · ${acc['status']}',
                          style: const TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8.0,
                      vertical: 3.0,
                    ),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(999.0),
                    ),
                    child: Text(
                      '${acc['unread']} new',
                      style: TextStyle(
                        color: color,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  List<Widget> _buildFilteredThreadCards() {
    final threads = _allThreads.where((t) {
      if (t.isArchived) return false;
      if (_activeInboxFocusTab == 'Unread' && !t.isUnread) return false;
      if (_searchQuery.isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      return t.sender.toLowerCase().contains(q) ||
          t.subject.toLowerCase().contains(q) ||
          t.snippet.toLowerCase().contains(q);
    }).toList();

    if (threads.isEmpty) {
      return [_buildChromeMobileEmptyInboxHero()];
    }
    return threads.map(_buildThreadCard).toList();
  }

  Widget _buildThreadCard(MailThread thread) {
    final isStarred =
        _starredThreadIds.contains(thread.id) || thread.isStarred;
    const accent = Color(0xFFFF6B35);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ThreadDetailScreen(
                thread: thread,
                onThreadUpdated: (updated) {
                  setState(() {
                    final idx =
                        _allThreads.indexWhere((t) => t.id == updated.id);
                    if (idx != -1) _allThreads[idx] = updated;
                  });
                },
                onArchive: () => setState(() => thread.isArchived = true),
                onTrash: () => setState(() => thread.isArchived = true),
              ),
            ),
          );
        },
        borderRadius: BorderRadius.circular(14.0),
        child: Container(
          padding: const EdgeInsets.all(13.0),
          decoration: BoxDecoration(
            color: const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(14.0),
            border: Border.all(
              color: thread.isUnread
                  ? accent.withOpacity(0.35)
                  : const Color(0xFF232938),
              width: 1.0,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38.0,
                height: 38.0,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accent.withOpacity(0.16),
                  border: Border.all(color: accent.withOpacity(0.35)),
                ),
                alignment: Alignment.center,
                child: Text(
                  thread.sender.isNotEmpty
                      ? thread.sender[0].toUpperCase()
                      : 'Q',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14.0,
                  ),
                ),
              ),
              const SizedBox(width: 12.0),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            thread.sender,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: thread.isUnread
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              fontSize: 13.5,
                            ),
                          ),
                        ),
                        const Text(
                          '10:42 AM',
                          style: TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 11.0,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3.0),
                    Text(
                      thread.subject,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: thread.isUnread
                            ? FontWeight.w600
                            : FontWeight.w400,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 2.0),
                    Text(
                      thread.snippet,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 12.0,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6.0),
              GestureDetector(
                onTap: () {
                  setState(() {
                    if (isStarred) {
                      _starredThreadIds.remove(thread.id);
                      thread.isStarred = false;
                    } else {
                      _starredThreadIds.add(thread.id);
                      thread.isStarred = true;
                    }
                  });
                },
                child: Icon(
                  isStarred ? Icons.star_rounded : Icons.star_border_rounded,
                  size: 19.0,
                  color: isStarred
                      ? const Color(0xFFF59E0B)
                      : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // 2. CALENDAR PILLAR VIEW — 1:1 with Chrome Mobile `/calendar` (`steps/404/media_0.png`)
  // ===========================================================================

  Widget _buildCalendarPillarView() {
    const accent = Color(0xFF4285F4);
    final hours = List.generate(24, (i) {
      if (i == 0) return '12 AM';
      if (i < 12) return '$i AM';
      if (i == 12) return '12 PM';
      return '${i - 12} PM';
    });

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      padding: const EdgeInsets.fromLTRB(12.0, 6.0, 12.0, 96.0),
      children: [
        // Calendar Header Card matching Chrome Mobile `/calendar`
        Container(
          padding: const EdgeInsets.all(12.0),
          decoration: BoxDecoration(
            color: const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(16.0),
            border: Border.all(color: const Color(0xFF232938)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12.0,
                      vertical: 6.0,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1C202B),
                      borderRadius: BorderRadius.circular(8.0),
                      border: Border.all(color: const Color(0xFF2C3344)),
                    ),
                    child: const Text(
                      'Today',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12.0,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8.0),
                  const Icon(
                    Icons.chevron_left_rounded,
                    color: Colors.white70,
                    size: 20.0,
                  ),
                  const SizedBox(width: 4.0),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: Colors.white70,
                    size: 20.0,
                  ),
                  const SizedBox(width: 6.0),
                  const Expanded(
                    child: Text(
                      'Sunday, Oct 18',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10.0),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8.0,
                      vertical: 4.0,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0E1017),
                      borderRadius: BorderRadius.circular(6.0),
                      border: Border.all(color: const Color(0xFF232938)),
                    ),
                    child: const Text(
                      'GMT+5:30',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 11.0,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: _onFabTap,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14.0,
                        vertical: 7.0,
                      ),
                      decoration: BoxDecoration(
                        color: accent,
                        borderRadius: BorderRadius.circular(10.0),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.add_rounded, size: 16.0, color: Colors.white),
                          SizedBox(width: 4.0),
                          Text(
                            'Event',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 10.0),

        // 24-Hour Scrollable Timeline Grid
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0E1017),
            borderRadius: BorderRadius.circular(16.0),
            border: Border.all(color: const Color(0xFF1E2330)),
          ),
          child: Column(
            children: List.generate(hours.length, (idx) {
              final isCurrentHour = idx == 7;
              return Container(
                height: 52.0,
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: Colors.white.withOpacity(0.05),
                      width: 1.0,
                    ),
                  ),
                ),
                child: Stack(
                  children: [
                    Row(
                      children: [
                        SizedBox(
                          width: 56.0,
                          child: Padding(
                            padding: const EdgeInsets.only(left: 10.0, top: 6.0),
                            child: Text(
                              hours[idx],
                              style: const TextStyle(
                                color: Color(0xFF64748B),
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                        Container(
                          width: 1.0,
                          color: Colors.white.withOpacity(0.06),
                        ),
                        const Expanded(child: SizedBox()),
                      ],
                    ),
                    if (isCurrentHour)
                      Positioned(
                        left: 50.0,
                        right: 0.0,
                        top: 22.0,
                        child: Row(
                          children: [
                            Container(
                              width: 8.0,
                              height: 8.0,
                              decoration: const BoxDecoration(
                                color: accent,
                                shape: BoxShape.circle,
                              ),
                            ),
                            Expanded(
                              child: Container(
                                height: 1.5,
                                color: accent,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              );
            }),
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // 3. DRIVE PILLAR VIEW — 1:1 with Chrome Mobile `/drive` (`steps/408/media_0.png`)
  // ===========================================================================

  Widget _buildDrivePillarView() {
    const accent = Color(0xFF34A853);
    const filters = ['All', 'Folders', 'Docs', 'Images', 'Sheets', 'Archives'];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      padding: const EdgeInsets.fromLTRB(12.0, 6.0, 12.0, 96.0),
      children: [
        // Drive Header Card
        Container(
          padding: const EdgeInsets.all(12.0),
          decoration: BoxDecoration(
            color: const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(16.0),
            border: Border.all(color: const Color(0xFF232938)),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.cloud_queue_rounded,
                    size: 18.0,
                    color: accent,
                  ),
                  const SizedBox(width: 8.0),
                  const Text(
                    'My Drive',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15.0,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 8.0),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8.0,
                      vertical: 2.0,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E2230),
                      borderRadius: BorderRadius.circular(999.0),
                    ),
                    child: const Text(
                      '0 items',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10.0,
                      vertical: 6.0,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1C202B),
                      borderRadius: BorderRadius.circular(8.0),
                      border: Border.all(color: const Color(0xFF2C3344)),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.create_new_folder_outlined,
                          size: 15.0,
                          color: Colors.white70,
                        ),
                        SizedBox(width: 5.0),
                        Text(
                          'Folder',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6.0),
                  GestureDetector(
                    onTap: _onFabTap,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12.0,
                        vertical: 6.0,
                      ),
                      decoration: BoxDecoration(
                        color: accent,
                        borderRadius: BorderRadius.circular(8.0),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.upload_rounded,
                            size: 15.0,
                            color: Colors.black,
                          ),
                          SizedBox(width: 4.0),
                          Text(
                            'Upload',
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10.0),
              // Single Filter Row
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: filters.map((f) {
                    final isSelected = _activeDriveFilter == f;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6.0),
                      child: GestureDetector(
                        onTap: () => setState(() => _activeDriveFilter = f),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12.0,
                            vertical: 5.5,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? accent.withOpacity(0.18)
                                : const Color(0xFF0E1017),
                            borderRadius: BorderRadius.circular(999.0),
                            border: Border.all(
                              color: isSelected
                                  ? accent.withOpacity(0.75)
                                  : const Color(0xFF232938),
                            ),
                          ),
                          child: Text(
                            f,
                            style: TextStyle(
                              color: isSelected
                                  ? accent
                                  : const Color(0xFF94A3B8),
                              fontSize: 11.5,
                              fontWeight: isSelected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 20.0),

        // Drive Empty State Card with 3D Drive Mascot
        Container(
          padding: const EdgeInsets.symmetric(vertical: 56.0, horizontal: 24.0),
          decoration: BoxDecoration(
            color: const Color(0xFF0E1017),
            borderRadius: BorderRadius.circular(18.0),
            border: Border.all(color: const Color(0xFF1F2433)),
          ),
          child: Column(
            children: [
              Image.asset(
                'assets/mascots/drive-lg.png',
                width: 96.0,
                height: 96.0,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 16.0),
              const Text(
                'This folder is empty',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6.0),
              const Text(
                'Drop files here or tap Upload to get started.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 18.0),
              GestureDetector(
                onTap: _onFabTap,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18.0,
                    vertical: 10.0,
                  ),
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(10.0),
                  ),
                  child: const Text(
                    '+ Upload Files',
                    style: TextStyle(
                      color: Colors.black,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 180.0),
      ],
    );
  }

  // ===========================================================================
  // 4. CONTACTS PILLAR VIEW — Clean Single Header (Zero Duplicate Search/Sub-bars)
  // ===========================================================================

  Widget _buildContactsPillarView() {
    const accent = Color(0xFFF59E0B);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      padding: const EdgeInsets.fromLTRB(12.0, 8.0, 12.0, 180.0),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(vertical: 56.0, horizontal: 24.0),
          decoration: BoxDecoration(
            color: const Color(0xFF14161D),
            borderRadius: BorderRadius.circular(18.0),
            border: Border.all(color: const Color(0xFF232938)),
          ),
          child: Column(
            children: [
              Image.asset(
                'assets/mascots/contacts-lg.png',
                width: 96.0,
                height: 96.0,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 16.0),
              Text(
                _activeSubViewIndex == 1 ? 'No favorite contacts' : 'No contacts yet',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6.0),
              const Text(
                'Contacts you add or email frequently will appear here.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 18.0),
              GestureDetector(
                onTap: _onFabTap,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18.0,
                    vertical: 10.0,
                  ),
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(10.0),
                  ),
                  child: const Text(
                    '+ New Contact',
                    style: TextStyle(
                      color: Colors.black,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
