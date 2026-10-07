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
import '../contacts/contacts_pillar_view.dart';
import '../quantgit/quantgit_pillar_view.dart';

/// Sovereign QuantMail Super-App Home Screen
///
/// Features the complete unified architecture:
/// - Brand Identity: Canonical QuantMail logo & monogram.
/// - Tier 1: Workspace selector pill ('Quant Trinity Lab [v]') + Global Voice & QR Search Bar.
/// - Tier 2: 5-Pillar Horizontal Mini-App Rail (Mail, Calendar, Drive, Contacts, QuantGit).
/// - Tier 3: Executive Quick-Glance Tiles (Priority Mail, Next Meeting, Drive Storage, Quick Actions).
/// - Tier 4: Contextual 56dp Bottom Navigation Dock with dynamic pillar subviews.
///
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath invocations.
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

class _SuperAppHomeScreenState extends State<SuperAppHomeScreen>
    with SingleTickerProviderStateMixin {
  late QuantPillar _activePillar;
  late int _activeSubViewIndex;
  String _activeWorkspace = 'Quant Trinity Lab';
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  bool _isListeningVoice = false;

  // Domain state
  late List<MailThread> _allThreads;
  MailCategoryLens _activeMailLens = MailCategoryLens.primary;
  final Set<String> _starredThreadIds = {};

  // Pillar badge counters — honest: zero until backed by real data.
  // Badges render only when count > 0, so the UI shows no invented numbers.
  final Map<QuantPillar, int> _pillarBadges = {
    QuantPillar.mail: 0,
    QuantPillar.calendar: 0,
    QuantPillar.drive: 0,
    QuantPillar.contacts: 0,
    QuantPillar.quantGit: 0,
  };

  // Category unread counters — honest: zero until backed by real data.
  final Map<MailCategoryLens, int> _categoryUnreadCounts = {
    MailCategoryLens.primary: 0,
    MailCategoryLens.updates: 0,
    MailCategoryLens.promotions: 0,
    MailCategoryLens.forums: 0,
    MailCategoryLens.vips: 0,
  };

  // Undo Send Manager
  final UndoSendManager _undoSendManager = UndoSendManager.instance;

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
    // Active-tab retap = refresh: reset subview + filters, clear search.
    if (_activePillar == pillar) {
      setState(() {
        _activeSubViewIndex = 0;
        _activeMailLens = MailCategoryLens.primary;
        _searchController.clear();
      });
      return;
    }
    setState(() {
      _activePillar = pillar;
      _activeSubViewIndex = 0;
    });
  }

  void _onSubViewChanged(int index) {
    setState(() {
      _activeSubViewIndex = index;
    });
  }

  List<MailThread> get _filteredThreads {
    return _allThreads.where((thread) {
      if (thread.isArchived) return false;
      if (thread.category != _activeMailLens) return false;
      if (_searchQuery.isEmpty) return true;

      final q = _searchQuery.toLowerCase();
      final senderMatch = thread.sender.toLowerCase().contains(q);
      final emailMatch = thread.senderEmail.toLowerCase().contains(q);
      final subjectMatch = thread.subject.toLowerCase().contains(q);
      final snippetMatch = thread.snippet.toLowerCase().contains(q);

      return senderMatch || emailMatch || subjectMatch || snippetMatch;
    }).toList();
  }

  // ===========================================================================
  // MODALS & DIALOGS
  // ===========================================================================

  void _showWorkspaceModal() {
    final workspaces = [
      {
        'id': 'ws-01',
        'name': 'Quant Trinity Lab',
        'desc': 'Primary Enterprise Organization',
        'role': 'Owner',
        'members': 24,
        'accent': QuantColors.moltenAmber,
      },
      {
        'id': 'ws-02',
        'name': 'Sovereign Foundation',
        'desc': 'Ecosystem Governance & Research',
        'role': 'Admin',
        'members': 8,
        'accent': QuantColors.sovereignCyan,
      },
      {
        'id': 'ws-03',
        'name': 'Personal Workspace',
        'desc': 'Alex Mercer Private Keyring',
        'role': 'Member',
        'members': 1,
        'accent': QuantColors.obsidianPurple,
      },
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20.0)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20.0, 16.0, 20.0, 20.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 36.0,
                    height: 4.0,
                    decoration: BoxDecoration(
                      color: QuantColors.hairlineBorder,
                      borderRadius: BorderRadius.circular(2.0),
                    ),
                  ),
                ),
                const SizedBox(height: 16.0),
                Row(
                  children: [
                    const Icon(
                      Icons.business_center_rounded,
                      size: 18.0,
                      color: QuantColors.moltenAmber,
                    ),
                    const SizedBox(width: 8.0),
                    Text(
                      'Switch Workspace',
                      style: QuantTypography.titleMedium.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14.0),
                ...workspaces.map((ws) {
                  final isSelected = ws['name'] == _activeWorkspace;
                  final accent = ws['accent'] as Color;

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8.0),
                    child: InkWell(
                      onTap: () {
                        setState(() {
                          _activeWorkspace = ws['name'] as String;
                        });
                        Navigator.pop(ctx);
                      },
                      borderRadius: BorderRadius.circular(12.0),
                      child: Container(
                        padding: const EdgeInsets.all(12.0),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? QuantColors.elevatedCard
                              : QuantColors.voidObsidian,
                          borderRadius: BorderRadius.circular(12.0),
                          border: Border.all(
                            color: isSelected
                                ? accent.withOpacity(0.8)
                                : QuantColors.hairlineBorder,
                            width: isSelected ? 1.2 : 0.8,
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 36.0,
                              height: 36.0,
                              decoration: BoxDecoration(
                                color: accent.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(8.0),
                                border: Border.all(
                                  color: accent.withOpacity(0.3),
                                  width: 1.0,
                                ),
                              ),
                              child: Icon(
                                Icons.domain_rounded,
                                size: 18.0,
                                color: accent,
                              ),
                            ),
                            const SizedBox(width: 12.0),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    ws['name'] as String,
                                    style: QuantTypography.bodyMedium.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 2.0),
                                  Text(
                                    '${ws['desc']} · ${ws['members']} members',
                                    style: QuantTypography.pillarLabel.copyWith(
                                      color: Colors.white54,
                                      fontSize: 11.0,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (isSelected)
                              Icon(
                                Icons.check_circle_rounded,
                                size: 18.0,
                                color: accent,
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showVoiceSearchModal() {
    setState(() => _isListeningVoice = true);

    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24.0)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36.0,
                  height: 4.0,
                  decoration: BoxDecoration(
                    color: QuantColors.hairlineBorder,
                    borderRadius: BorderRadius.circular(2.0),
                  ),
                ),
                const SizedBox(height: 20.0),
                Container(
                  width: 64.0,
                  height: 64.0,
                  decoration: BoxDecoration(
                    color: QuantColors.moltenAmber.withOpacity(0.15),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: QuantColors.moltenAmber.withOpacity(0.5),
                      width: 1.5,
                    ),
                  ),
                  child: const Icon(
                    Icons.mic_rounded,
                    size: 32.0,
                    color: QuantColors.moltenAmber,
                  ),
                ),
                const SizedBox(height: 16.0),
                Text(
                  'Listening for Voice Query...',
                  style: QuantTypography.titleMedium.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6.0),
                Text(
                  'Speak to search your mail',
                  style: QuantTypography.bodySmall.copyWith(
                    color: Colors.white54,
                  ),
                ),
                const SizedBox(height: 20.0),
                Wrap(
                  spacing: 8.0,
                  runSpacing: 8.0,
                  alignment: WrapAlignment.center,
                  children: [
                    _buildVoiceChip(ctx, 'Unread mail'),
                    _buildVoiceChip(ctx, 'Meetings today'),
                    _buildVoiceChip(ctx, 'Starred threads'),
                  ],
                ),
                const SizedBox(height: 16.0),
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                  },
                  child: Text(
                    'Cancel Voice Search',
                    style: TextStyle(color: Colors.white.withOpacity(0.7)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ).whenComplete(() {
      if (mounted) {
        setState(() => _isListeningVoice = false);
      }
    });
  }

  Widget _buildVoiceChip(BuildContext ctx, String query) {
    return ActionChip(
      label: Text(
        query,
        style: const TextStyle(color: Colors.white70, fontSize: 11.5),
      ),
      backgroundColor: QuantColors.voidObsidian,
      side: const BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
      onPressed: () {
        _searchController.text = query;
        Navigator.pop(ctx);
      },
    );
  }

  void _showQrScanModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24.0)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36.0,
                  height: 4.0,
                  decoration: BoxDecoration(
                    color: QuantColors.hairlineBorder,
                    borderRadius: BorderRadius.circular(2.0),
                  ),
                ),
                const SizedBox(height: 16.0),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.qr_code_scanner_rounded,
                      size: 20.0,
                      color: QuantColors.sovereignCyan,
                    ),
                    const SizedBox(width: 8.0),
                    Text(
                      'Sovereign QR Authenticator',
                      style: QuantTypography.titleMedium.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20.0),
                Container(
                  width: 180.0,
                  height: 180.0,
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(16.0),
                    border: Border.all(
                      color: QuantColors.sovereignCyan.withOpacity(0.6),
                      width: 1.5,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.qr_code_2_rounded,
                        size: 96.0,
                        color: QuantColors.sovereignCyan.withOpacity(0.8),
                      ),
                      const SizedBox(height: 8.0),
                      Text(
                        'Align QR Code in frame',
                        style: QuantTypography.pillarLabel.copyWith(
                          color: Colors.white54,
                          fontSize: 10.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16.0),
                Text(
                  'Scan to pair desktop workstation, verify hardware key, or import contact credentials.',
                  textAlign: TextAlign.center,
                  style: QuantTypography.bodySmall.copyWith(
                    color: Colors.white54,
                    fontSize: 12.0,
                  ),
                ),
                const SizedBox(height: 16.0),
                ElevatedButton.icon(
                  onPressed: () => Navigator.pop(ctx),
                  icon: const Icon(Icons.close_rounded, size: 16.0),
                  label: const Text('Close Scanner'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: QuantColors.elevatedCard,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10.0),
                      side: const BorderSide(
                        color: QuantColors.hairlineBorder,
                        width: 1.0,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
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
  // BUILD METHOD — responsive: mobile gets the single bottom 5-pillar dock,
  // desktop (>=900px) gets a real desktop layout: left sidebar + content.
  // ===========================================================================

  static const List<QuantPillar> _orderedPillars = [
    QuantPillar.mail,
    QuantPillar.calendar,
    QuantPillar.drive,
    QuantPillar.contacts,
    QuantPillar.quantGit,
  ];

  bool _isDesktop(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= 900;

  @override
  Widget build(BuildContext context) {
    if (_isDesktop(context)) return _buildDesktopScaffold();
    return _buildMobileScaffold();
  }

  Widget _buildMobileScaffold() {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: QuantMailSuperAppBar(
        activePillar: _activePillar,
        activeWorkspace: _activeWorkspace,
        onWorkspaceTap: _showWorkspaceModal,
        searchController: _searchController,
        onSearchChanged: (_) => _onSearchChanged(),
        onVoiceSearchTap: _showVoiceSearchModal,
        onQrScanTap: _showQrScanModal,
        onProfileTap: _showAccountProfileSheet,
        isListeningVoice: _isListeningVoice,
      ),
      body: Stack(
        children: [
          // Active Pillar Dynamic Body
          _buildPillarBody(),

          // 10-Second Undo Send Notification Bar
          Positioned(
            left: 16.0,
            right: 16.0,
            bottom: 68.0,
            child: UndoSendBar(manager: _undoSendManager),
          ),
        ],
      ),
      bottomNavigationBar: _buildPillarBottomNav(),
      floatingActionButton: _buildFloatingActionButton(),
    );
  }

  Widget _buildDesktopScaffold() {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildDesktopSidebar(),
          Expanded(
            child: Column(
              children: [
                _buildDesktopTopBar(),
                _buildSubviewChips(),
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 960.0),
                      child: _buildPillarBody(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Desktop left sidebar — Gmail-style: brand, compose, 5 pillars, profile.
  Widget _buildDesktopSidebar() {
    return Container(
      width: 232.0,
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          right: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const QuantMonogramLogo(size: 28.0),
                  const SizedBox(width: 8.0),
                  RichText(
                    text: TextSpan(
                      children: [
                        TextSpan(
                          text: 'Quant',
                          style: QuantTypography.titleMedium.copyWith(
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                        TextSpan(
                          text: 'Mail',
                          style: QuantTypography.titleMedium.copyWith(
                            fontWeight: FontWeight.w800,
                            color: QuantColors.moltenAmber,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14.0),
              // Gmail-style compose button
              ElevatedButton.icon(
                onPressed: _openEmailComposer,
                icon: const Icon(Icons.edit_rounded, size: 18.0),
                label: const Text('Compose'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.moltenAmber,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 12.0),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10.0),
                  ),
                ),
              ),
              const SizedBox(height: 12.0),
              ..._orderedPillars.map((pillar) {
                final isSelected = pillar == _activePillar;
                final accent = pillar.accentColor;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4.0),
                  child: InkWell(
                    onTap: () => _onPillarChanged(pillar),
                    borderRadius: BorderRadius.circular(10.0),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12.0, vertical: 10.0),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? accent.withOpacity(0.14)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(10.0),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            pillar.icon,
                            size: 20.0,
                            color: isSelected ? accent : Colors.white60,
                          ),
                          const SizedBox(width: 12.0),
                          Expanded(
                            child: Text(
                              pillar.label,
                              style: TextStyle(
                                color:
                                    isSelected ? Colors.white : Colors.white70,
                                fontSize: 13.5,
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
              }),
              const Spacer(),
              InkWell(
                onTap: _showAccountProfileSheet,
                borderRadius: BorderRadius.circular(10.0),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12.0, vertical: 10.0),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10.0),
                    border: Border.all(
                      color: QuantColors.hairlineBorder,
                      width: 1.0,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 28.0,
                        height: 28.0,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF6366F1), Color(0xFFA855F7)],
                          ),
                          borderRadius: BorderRadius.circular(8.0),
                        ),
                        alignment: Alignment.center,
                        child: const Text(
                          'AM',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 11.0,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10.0),
                      Expanded(
                        child: Text(
                          _activeWorkspace,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12.0,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Desktop slim top bar with full-width search.
  Widget _buildDesktopTopBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20.0, 12.0, 20.0, 8.0),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
        ),
      ),
      child: Container(
        height: 42.0,
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(10.0),
          border: Border.all(
            color: QuantColors.hairlineBorder,
            width: 1.0,
          ),
        ),
        child: Row(
          children: [
            const SizedBox(width: 12.0),
            const Icon(
              Icons.search_rounded,
              size: 18.0,
              color: QuantColors.moltenAmber,
            ),
            const SizedBox(width: 8.0),
            Expanded(
              child: TextField(
                controller: _searchController,
                onChanged: (_) => _onSearchChanged(),
                style: QuantTypography.bodyMedium.copyWith(
                  color: Colors.white,
                  fontSize: 13.0,
                ),
                decoration: InputDecoration(
                  hintText: 'Search ${_activePillar.label.toLowerCase()}...',
                  hintStyle: QuantTypography.bodyMedium.copyWith(
                    color: Colors.white38,
                    fontSize: 12.5,
                  ),
                  border: InputBorder.none,
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Secondary subview chips (desktop only, calendar/drive).
  /// Mail uses its category lenses; contacts/quantgit render their own
  /// internal subview tabs — no duplication.
  Widget _buildSubviewChips() {
    if (_activePillar != QuantPillar.calendar &&
        _activePillar != QuantPillar.drive) {
      return const SizedBox.shrink();
    }
    final subViews = _activePillar.subViews;
    final accent = _activePillar.accentColor;
    return Container(
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.fromLTRB(20.0, 10.0, 20.0, 2.0),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: List.generate(subViews.length, (index) {
            final sub = subViews[index];
            final selected = index == _activeSubViewIndex;
            return Padding(
              padding: const EdgeInsets.only(right: 8.0),
              child: ChoiceChip(
                label: Text(sub.label),
                selected: selected,
                onSelected: (_) => _onSubViewChanged(index),
                selectedColor: accent.withOpacity(0.18),
                backgroundColor: QuantColors.darkSlateCard,
                side: BorderSide(
                  color: selected
                      ? accent.withOpacity(0.8)
                      : QuantColors.hairlineBorder,
                  width: 1.0,
                ),
                labelStyle: TextStyle(
                  color: selected ? Colors.white : Colors.white60,
                  fontSize: 12.0,
                  fontWeight:
                      selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  Widget? _buildFloatingActionButton() {
    // Only show primary FAB for mail, calendar, or drive
    switch (_activePillar) {
      case QuantPillar.mail:
        return FloatingActionButton(
          onPressed: _openEmailComposer,
          backgroundColor: QuantColors.moltenAmber,
          foregroundColor: Colors.black,
          elevation: 6.0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16.0),
          ),
          child: const Icon(Icons.edit_note_rounded, size: 26.0),
        );
      case QuantPillar.calendar:
        return FloatingActionButton(
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateSurface,
                content: Text('Create event'),
              ),
            );
          },
          backgroundColor: QuantColors.sunsetGold,
          foregroundColor: Colors.black,
          elevation: 6.0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16.0),
          ),
          child: const Icon(Icons.event_available_rounded, size: 24.0),
        );
      case QuantPillar.drive:
        return FloatingActionButton(
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateSurface,
                content: Text('Upload file'),
              ),
            );
          },
          backgroundColor: QuantColors.sovereignCyan,
          foregroundColor: Colors.black,
          elevation: 6.0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16.0),
          ),
          child: const Icon(Icons.upload_file_rounded, size: 24.0),
        );
      default:
        return null;
    }
  }

  // ===========================================================================
  // TIER 4: CONTEXTUAL 56DP BOTTOM NAVIGATION DOCK
  // ===========================================================================

  /// THE single navigation system on mobile: 5-pillar bottom dock.
  /// Tapping the active tab refreshes (resets subview + filters).
  Widget _buildPillarBottomNav() {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(
            color: QuantColors.hairlineBorder,
            width: 1.0,
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 62.0,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: _orderedPillars.map((pillar) {
              final isSelected = pillar == _activePillar;
              final accent = pillar.accentColor;
              final badgeCount = _pillarBadges[pillar] ?? 0;
              return Expanded(
                child: GestureDetector(
                  onTap: () => _onPillarChanged(pillar),
                  behavior: HitTestBehavior.opaque,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12.0, vertical: 3.0),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? accent.withOpacity(0.18)
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(10.0),
                            ),
                            child: Icon(
                              pillar.icon,
                              size: 22.0,
                              color: isSelected ? accent : Colors.white54,
                            ),
                          ),
                          if (badgeCount > 0)
                            Positioned(
                              top: -4.0,
                              right: 6.0,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 5.0, vertical: 1.0),
                                decoration: BoxDecoration(
                                  color: accent,
                                  borderRadius: BorderRadius.circular(8.0),
                                ),
                                constraints: const BoxConstraints(
                                  minWidth: 16.0,
                                  minHeight: 14.0,
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  badgeCount > 99 ? '99+' : '$badgeCount',
                                  style: const TextStyle(
                                    color: Colors.black,
                                    fontSize: 9.0,
                                    fontWeight: FontWeight.w800,
                                    height: 1.0,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 2.0),
                      Text(
                        pillar.label,
                        maxLines: 1,
                        style: TextStyle(
                          color: isSelected ? Colors.white : Colors.white54,
                          fontSize: 10.0,
                          fontWeight: isSelected
                              ? FontWeight.w700
                              : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // PILLAR BODY DISPATCHER
  // ===========================================================================

  Widget _buildPillarBody() {
    switch (_activePillar) {
      case QuantPillar.mail:
        return _buildMailPillarView();
      case QuantPillar.calendar:
        return _buildCalendarPillarView();
      case QuantPillar.drive:
        return _buildDrivePillarView();
      case QuantPillar.contacts:
        return ContactsPillarView(
          activeSubViewIndex: _activeSubViewIndex,
          onSubViewChanged: _onSubViewChanged,
        );
      case QuantPillar.quantGit:
        return QuantGitPillarView(
          activeSubViewIndex: _activeSubViewIndex,
          onSubViewChanged: _onSubViewChanged,
        );
    }
  }

  // ===========================================================================
  // MAIL PILLAR VIEW (TIER 3 EXECUTIVE TILES + LENSES + THREAD LIST)
  // ===========================================================================

  Widget _buildMailPillarView() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16.0, 12.0, 16.0, 80.0),
      children: [
        // Category lenses — content first, no stacked summary cards.
        _buildCategoryLensesRow(),

        const SizedBox(height: 12.0),

        // Thread count header (honest — real count only)
        _buildThreadStatusHeader(),

        const SizedBox(height: 8.0),

        // Virtualized Thread Cards
        ..._filteredThreads.map((thread) => _buildThreadCard(thread)),

        if (_filteredThreads.isEmpty) _buildEmptyState(),
      ],
    );
  }

  Widget _buildCategoryLensesRow() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: MailCategoryLens.values.map((lens) {
          final isSelected = lens == _activeMailLens;
          final unreadCount = _categoryUnreadCounts[lens] ?? 0;
          final accent = lens.accentColor;

          return Padding(
            padding: const EdgeInsets.only(right: 6.0),
            child: GestureDetector(
              onTap: () {
                setState(() => _activeMailLens = lens);
              },
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(horizontal: 10.0, vertical: 6.0),
                decoration: BoxDecoration(
                  color: isSelected ? QuantColors.darkSlateCard : QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(8.0),
                  border: Border.all(
                    color: isSelected ? accent.withOpacity(0.8) : QuantColors.hairlineBorder,
                    width: isSelected ? 1.2 : 0.8,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      lens.icon,
                      size: 14.0,
                      color: isSelected ? accent : Colors.white60,
                    ),
                    const SizedBox(width: 5.0),
                    Text(
                      lens.label,
                      style: TextStyle(
                        color: isSelected ? Colors.white : Colors.white60,
                        fontSize: 11.5,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                    if (unreadCount > 0) ...[
                      const SizedBox(width: 5.0),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 4.0,
                          vertical: 0.5,
                        ),
                        decoration: BoxDecoration(
                          color: isSelected ? accent : QuantColors.hairlineBorder,
                          borderRadius: BorderRadius.circular(5.0),
                        ),
                        child: Text(
                          unreadCount.toString(),
                          style: TextStyle(
                            color: isSelected ? Colors.black : Colors.white70,
                            fontSize: 9.0,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildThreadStatusHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          '${_filteredThreads.length} Threads in ${_activeMailLens.label}',
          style: QuantTypography.pillarLabel.copyWith(
            color: Colors.white54,
            fontWeight: FontWeight.w600,
            fontSize: 11.0,
          ),
        ),
      ],
    );
  }

  Widget _buildThreadCard(MailThread thread) {
    final isStarred = _starredThreadIds.contains(thread.id) || thread.isStarred;

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
                    final idx = _allThreads.indexWhere((t) => t.id == updated.id);
                    if (idx != -1) _allThreads[idx] = updated;
                  });
                },
                onArchive: () {
                  setState(() => thread.isArchived = true);
                },
                onTrash: () {
                  setState(() => thread.isArchived = true);
                },
              ),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12.0),
        child: Container(
          padding: const EdgeInsets.all(12.0),
          decoration: BoxDecoration(
            color: thread.isUnread
                ? QuantColors.darkSlateCard
                : QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(12.0),
            border: Border.all(
              color: thread.isUnread
                  ? QuantColors.moltenAmber.withOpacity(0.3)
                  : QuantColors.hairlineBorder,
              width: 1.0,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Avatar
                  Container(
                    width: 32.0,
                    height: 32.0,
                    decoration: BoxDecoration(
                      color: QuantColors.moltenAmber.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(8.0),
                      border: Border.all(
                        color: QuantColors.moltenAmber.withOpacity(0.3),
                        width: 0.8,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      thread.sender.isNotEmpty ? thread.sender[0].toUpperCase() : 'Q',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13.0,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10.0),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                thread.sender,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: QuantTypography.bodyMedium.copyWith(
                                  color: Colors.white,
                                  fontWeight: thread.isUnread
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  fontSize: 12.5,
                                ),
                              ),
                            ),
                            if (thread.isPriorityTriage) ...[
                              const SizedBox(width: 4.0),
                              const Icon(
                                Icons.stars_rounded,
                                size: 14.0,
                                color: QuantColors.moltenAmber,
                              ),
                            ],
                          ],
                        ),
                        Text(
                          thread.senderEmail,
                          style: QuantTypography.pillarLabel.copyWith(
                            color: Colors.white54,
                            fontSize: 10.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(
                      isStarred ? Icons.star_rounded : Icons.star_border_rounded,
                      size: 18.0,
                      color: isStarred ? QuantColors.sunsetGold : Colors.white30,
                    ),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 28.0, minHeight: 28.0),
                    splashRadius: 16.0,
                    onPressed: () {
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
                  ),
                  const SizedBox(width: 6.0),
                  Text(
                    '10:42 AM',
                    style: QuantTypography.pillarLabel.copyWith(
                      color: Colors.white38,
                      fontSize: 10.0,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8.0),
              Text(
                thread.subject,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: QuantTypography.bodyMedium.copyWith(
                  color: Colors.white,
                  fontWeight: thread.isUnread ? FontWeight.w600 : FontWeight.w400,
                  fontSize: 12.0,
                ),
              ),
              const SizedBox(height: 3.0),
              Text(
                thread.snippet,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: QuantTypography.bodySmall.copyWith(
                  color: Colors.white60,
                  fontSize: 11.0,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40.0),
      child: Center(
        child: Column(
          children: [
            const Icon(
              Icons.inbox_rounded,
              size: 48.0,
              color: Colors.white24,
            ),
            const SizedBox(height: 12.0),
            Text(
              'No mail in ${_activeMailLens.label} yet',
              style: QuantTypography.titleMedium.copyWith(
                color: Colors.white70,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4.0),
            Text(
              'New mail will appear here.',
              style: QuantTypography.bodySmall.copyWith(color: Colors.white38),
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // CALENDAR PILLAR VIEW
  // ===========================================================================

  Widget _buildCalendarPillarView() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16.0, 24.0, 16.0, 80.0),
      children: [
        _buildHonestEmptyState(
          icon: Icons.calendar_month_rounded,
          accent: QuantColors.sunsetGold,
          title: 'No meetings today',
          subtitle: 'Your schedule is clear. New events will appear here.',
        ),
      ],
    );
  }

  Widget _buildDrivePillarView() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16.0, 24.0, 16.0, 80.0),
      children: [
        _buildHonestEmptyState(
          icon: Icons.folder_rounded,
          accent: QuantColors.sovereignCyan,
          title: 'No files yet',
          subtitle: 'Files you upload will appear here.',
        ),
      ],
    );
  }

  /// Shared honest empty-state tile (no invented data, no fake claims).
  Widget _buildHonestEmptyState({
    required IconData icon,
    required Color accent,
    required String title,
    required String subtitle,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 56.0, horizontal: 24.0),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16.0),
        border: Border.all(
          color: QuantColors.hairlineBorder,
          width: 1.0,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64.0,
            height: 64.0,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.12),
              borderRadius: BorderRadius.circular(18.0),
            ),
            child: Icon(icon, size: 30.0, color: accent),
          ),
          const SizedBox(height: 16.0),
          Text(
            title,
            style: QuantTypography.titleMedium.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6.0),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: QuantTypography.bodySmall.copyWith(
              color: Colors.white54,
            ),
          ),
        ],
      ),
    );
  }

}
