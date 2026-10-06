import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

import '../../models/mail_models.dart';
import '../../models/composer_models.dart';
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

  // Pillar live badge counters
  final Map<QuantPillar, int> _pillarBadges = {
    QuantPillar.mail: 4,
    QuantPillar.calendar: 2,
    QuantPillar.drive: 0,
    QuantPillar.contacts: 12,
    QuantPillar.quantGit: 3,
  };

  // Category unread counters for mail
  final Map<MailCategoryLens, int> _categoryUnreadCounts = {
    MailCategoryLens.primary: 4,
    MailCategoryLens.updates: 12,
    MailCategoryLens.promotions: 5,
    MailCategoryLens.forums: 2,
    MailCategoryLens.vips: 3,
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
    if (_activePillar == pillar) return;
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
                  'Sub-5ms local VAD speech recognition engine active',
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
                    _buildVoiceChip(ctx, 'Priority emails from Alex Mercer'),
                    _buildVoiceChip(ctx, 'Next meeting today'),
                    _buildVoiceChip(ctx, 'PR #347 diff status'),
                    _buildVoiceChip(ctx, 'FastCDC storage quota'),
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
                  'Email dispatched via Kyber-1024 envelope to ${d.to.map((r) => r.email).join(', ')}',
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
  // BUILD METHOD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: QuantMailSuperAppBar(
        activePillar: _activePillar,
        onPillarSelected: _onPillarChanged,
        activeWorkspace: _activeWorkspace,
        onWorkspaceTap: _showWorkspaceModal,
        searchController: _searchController,
        onSearchChanged: (_) => _onSearchChanged(),
        onVoiceSearchTap: _showVoiceSearchModal,
        onQrScanTap: _showQrScanModal,
        onProfileTap: _showAccountProfileSheet,
        pillarBadges: _pillarBadges,
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
      bottomNavigationBar: _buildContextualBottomDock(),
      floatingActionButton: _buildFloatingActionButton(),
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
                content: Text('Create Sovereign Calendar Event (RFC 5545)'),
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
                content: Text('Upload File to Sovereign Drive (FastCDC)'),
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

  Widget _buildContextualBottomDock() {
    final subViews = _activePillar.subViews;
    final accent = _activePillar.accentColor;

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
          height: 56.0,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(subViews.length, (index) {
              final subView = subViews[index];
              final isSelected = index == _activeSubViewIndex;

              return Expanded(
                child: GestureDetector(
                  onTap: () => _onSubViewChanged(index),
                  behavior: HitTestBehavior.opaque,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10.0,
                          vertical: 2.5,
                        ),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? accent.withOpacity(0.18)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(12.0),
                        ),
                        child: Icon(
                          subView.icon,
                          size: 20.0,
                          color: isSelected ? accent : Colors.white54,
                        ),
                      ),
                      const SizedBox(height: 2.0),
                      Text(
                        subView.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: isSelected ? Colors.white : Colors.white54,
                          fontSize: 10.0,
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
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
        // TIER 3: EXECUTIVE QUICK-GLANCE TILES
        _buildTier3ExecutiveGlanceSection(),

        const SizedBox(height: 16.0),

        // Split Category Lenses Row
        _buildCategoryLensesRow(),

        const SizedBox(height: 12.0),

        // Thread Count & Fast Index Status Row
        _buildThreadStatusHeader(),

        const SizedBox(height: 8.0),

        // Virtualized Thread Cards
        ..._filteredThreads.map((thread) => _buildThreadCard(thread)),

        if (_filteredThreads.isEmpty) _buildEmptyState(),
      ],
    );
  }

  Widget _buildTier3ExecutiveGlanceSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section Title
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.dashboard_customize_rounded,
                  size: 15.0,
                  color: QuantColors.moltenAmber,
                ),
                const SizedBox(width: 6.0),
                Text(
                  'EXECUTIVE SUITE AT A GLANCE',
                  style: QuantTypography.pillarLabel.copyWith(
                    color: Colors.white70,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    fontSize: 10.5,
                  ),
                ),
              ],
            ),
            const QuantBadge(
              label: '<1.8ms Impeller Sync',
              variant: QuantBadgeVariant.success,
              leadingIcon: Icons.bolt_rounded,
            ),
          ],
        ),

        const SizedBox(height: 10.0),

        // Priority Mail Glance Tile
        _buildPriorityMailTile(),

        const SizedBox(height: 8.0),

        // Row of Next Meeting & Drive Storage Tiles
        Row(
          children: [
            Expanded(child: _buildNextMeetingTile()),
            const SizedBox(width: 8.0),
            Expanded(child: _buildDriveStorageTile()),
          ],
        ),

        const SizedBox(height: 8.0),

        // Quick Actions Rail
        _buildQuickActionsRail(),
      ],
    );
  }

  Widget _buildPriorityMailTile() {
    return Container(
      padding: const EdgeInsets.all(12.0),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12.0),
        border: Border.all(
          color: QuantColors.moltenAmber.withOpacity(0.4),
          width: 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.mark_email_unread_rounded,
                size: 16.0,
                color: QuantColors.moltenAmber,
              ),
              const SizedBox(width: 6.0),
              Text(
                'PRIORITY MAIL',
                style: QuantTypography.pillarLabel.copyWith(
                  color: QuantColors.moltenAmber,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6.0, vertical: 1.5),
                decoration: BoxDecoration(
                  color: QuantColors.moltenAmber.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(4.0),
                ),
                child: Text(
                  '3 Urgent',
                  style: QuantTypography.pillarLabel.copyWith(
                    color: QuantColors.moltenAmber,
                    fontWeight: FontWeight.w700,
                    fontSize: 9.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8.0),
          Row(
            children: [
              Container(
                width: 26.0,
                height: 26.0,
                decoration: BoxDecoration(
                  color: QuantColors.moltenAmber.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6.0),
                ),
                alignment: Alignment.center,
                child: const Text(
                  'AM',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 10.0,
                  ),
                ),
              ),
              const SizedBox(width: 8.0),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Alex Mercer (CTO) · Wave 76 Architecture Brief',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: QuantTypography.bodyMedium.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 12.0,
                      ),
                    ),
                    Text(
                      'Kyber-1024 E2EE sealed · Sub-5ms FTS5 verified',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: QuantTypography.pillarLabel.copyWith(
                        color: Colors.white54,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6.0),
              Text(
                '2m ago',
                style: QuantTypography.pillarLabel.copyWith(
                  color: Colors.white38,
                  fontSize: 10.0,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8.0),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              _buildGlanceActionButton(
                icon: Icons.archive_rounded,
                label: 'Archive (E)',
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateSurface,
                      content: Text('Archived priority thread'),
                    ),
                  );
                },
              ),
              const SizedBox(width: 6.0),
              _buildGlanceActionButton(
                icon: Icons.snooze_rounded,
                label: 'Snooze (S)',
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateSurface,
                      content: Text('Snoozed thread until 9:00 AM'),
                    ),
                  );
                },
              ),
              const SizedBox(width: 6.0),
              _buildGlanceActionButton(
                icon: Icons.reply_rounded,
                label: 'Quick Reply',
                accent: QuantColors.moltenAmber,
                onTap: _openEmailComposer,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildNextMeetingTile() {
    return Container(
      height: 124.0,
      padding: const EdgeInsets.all(10.0),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12.0),
        border: Border.all(
          color: QuantColors.sunsetGold.withOpacity(0.35),
          width: 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(
                Icons.videocam_rounded,
                size: 15.0,
                color: QuantColors.sunsetGold,
              ),
              const SizedBox(width: 5.0),
              Text(
                'NEXT MEETING',
                style: QuantTypography.pillarLabel.copyWith(
                  color: QuantColors.sunsetGold,
                  fontWeight: FontWeight.w700,
                  fontSize: 9.5,
                  letterSpacing: 0.4,
                ),
              ),
              const Spacer(),
              Text(
                'In 25m',
                style: QuantTypography.pillarLabel.copyWith(
                  color: Colors.white70,
                  fontSize: 9.5,
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Core Architecture Sync',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: QuantTypography.bodyMedium.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 11.5,
                ),
              ),
              const SizedBox(height: 2.0),
              Text(
                '14:30 - 15:15 IST · #alpha-room',
                style: QuantTypography.pillarLabel.copyWith(
                  color: Colors.white54,
                  fontSize: 10.0,
                ),
              ),
            ],
          ),
          InkWell(
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateSurface,
                  content: Text('Connecting to WebRTC Stage #alpha-room'),
                ),
              );
            },
            borderRadius: BorderRadius.circular(6.0),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 4.0),
              decoration: BoxDecoration(
                color: QuantColors.sunsetGold.withOpacity(0.16),
                borderRadius: BorderRadius.circular(6.0),
                border: Border.all(
                  color: QuantColors.sunsetGold.withOpacity(0.4),
                  width: 0.8,
                ),
              ),
              alignment: Alignment.center,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.sensors_rounded,
                    size: 12.0,
                    color: QuantColors.sunsetGold,
                  ),
                  const SizedBox(width: 4.0),
                  Text(
                    'Join Video Stage',
                    style: QuantTypography.pillarLabel.copyWith(
                      color: QuantColors.sunsetGold,
                      fontWeight: FontWeight.w700,
                      fontSize: 10.0,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDriveStorageTile() {
    return Container(
      height: 124.0,
      padding: const EdgeInsets.all(10.0),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12.0),
        border: Border.all(
          color: QuantColors.sovereignCyan.withOpacity(0.35),
          width: 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(
                Icons.cloud_done_rounded,
                size: 15.0,
                color: QuantColors.sovereignCyan,
              ),
              const SizedBox(width: 5.0),
              Text(
                'FASTCDC STORAGE',
                style: QuantTypography.pillarLabel.copyWith(
                  color: QuantColors.sovereignCyan,
                  fontWeight: FontWeight.w700,
                  fontSize: 9.5,
                  letterSpacing: 0.4,
                ),
              ),
              const Spacer(),
              Text(
                '3.4x Dedup',
                style: QuantTypography.pillarLabel.copyWith(
                  color: Colors.white70,
                  fontSize: 9.5,
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '18.4 GB used',
                    style: QuantTypography.bodyMedium.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 11.5,
                    ),
                  ),
                  Text(
                    '100 GB Quota',
                    style: QuantTypography.pillarLabel.copyWith(
                      color: Colors.white54,
                      fontSize: 10.0,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4.0),
              // Linear Progress Bar (No clipPath)
              Container(
                height: 5.0,
                decoration: BoxDecoration(
                  color: QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(3.0),
                ),
                child: Row(
                  children: [
                    Expanded(
                      flex: 184,
                      child: Container(
                        decoration: BoxDecoration(
                          color: QuantColors.sovereignCyan,
                          borderRadius: BorderRadius.circular(3.0),
                        ),
                      ),
                    ),
                    const Expanded(
                      flex: 816,
                      child: SizedBox(),
                    ),
                  ],
                ),
              ),
            ],
          ),
          InkWell(
            onTap: () => _onPillarChanged(QuantPillar.drive),
            borderRadius: BorderRadius.circular(6.0),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 4.0),
              decoration: BoxDecoration(
                color: QuantColors.sovereignCyan.withOpacity(0.16),
                borderRadius: BorderRadius.circular(6.0),
                border: Border.all(
                  color: QuantColors.sovereignCyan.withOpacity(0.4),
                  width: 0.8,
                ),
              ),
              alignment: Alignment.center,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.lock_clock_rounded,
                    size: 12.0,
                    color: QuantColors.sovereignCyan,
                  ),
                  const SizedBox(width: 4.0),
                  Text(
                    'Open E2EE Vault',
                    style: QuantTypography.pillarLabel.copyWith(
                      color: QuantColors.sovereignCyan,
                      fontWeight: FontWeight.w700,
                      fontSize: 10.0,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionsRail() {
    final actions = [
      {
        'label': 'Compose',
        'icon': Icons.edit_note_rounded,
        'color': QuantColors.moltenAmber,
        'onTap': _openEmailComposer,
      },
      {
        'label': 'New Event',
        'icon': Icons.event_available_rounded,
        'color': QuantColors.sunsetGold,
        'onTap': () => _onPillarChanged(QuantPillar.calendar),
      },
      {
        'label': 'Upload File',
        'icon': Icons.upload_file_rounded,
        'color': QuantColors.sovereignCyan,
        'onTap': () => _onPillarChanged(QuantPillar.drive),
      },
      {
        'label': 'Add Contact',
        'icon': Icons.person_add_alt_1_rounded,
        'color': QuantColors.emeraldMatrix,
        'onTap': () => _onPillarChanged(QuantPillar.contacts),
      },
      {
        'label': 'New Repo',
        'icon': Icons.create_new_folder_rounded,
        'color': QuantColors.obsidianPurple,
        'onTap': () => _onPillarChanged(QuantPillar.quantGit),
      },
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: actions.map((act) {
          final color = act['color'] as Color;
          final icon = act['icon'] as IconData;
          final label = act['label'] as String;
          final onTap = act['onTap'] as VoidCallback;

          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(8.0),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10.0, vertical: 6.0),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(8.0),
                  border: Border.all(
                    color: QuantColors.hairlineBorder,
                    width: 0.8,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 14.0, color: color),
                    const SizedBox(width: 5.0),
                    Text(
                      label,
                      style: QuantTypography.pillarLabel.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildGlanceActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    Color? accent,
  }) {
    final c = accent ?? Colors.white70;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6.0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7.0, vertical: 3.5),
        decoration: BoxDecoration(
          color: QuantColors.voidObsidian,
          borderRadius: BorderRadius.circular(6.0),
          border: Border.all(
            color: accent != null ? accent.withOpacity(0.4) : QuantColors.hairlineBorder,
            width: 0.8,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12.0, color: c),
            const SizedBox(width: 4.0),
            Text(
              label,
              style: QuantTypography.pillarLabel.copyWith(
                color: c,
                fontSize: 10.0,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // CATEGORY LENSES & THREAD CARDS
  // ===========================================================================

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
        Row(
          children: [
            const Icon(
              Icons.bolt_rounded,
              size: 12.0,
              color: QuantColors.moltenAmber,
            ),
            const SizedBox(width: 3.0),
            Text(
              'Sub-5ms FTS5 Index',
              style: QuantTypography.pillarLabel.copyWith(
                color: QuantColors.moltenAmber,
                fontSize: 10.0,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
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
              const SizedBox(height: 8.0),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5.0, vertical: 1.5),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(4.0),
                      border: Border.all(
                        color: QuantColors.hairlineBorder,
                        width: 0.8,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.lock_rounded,
                          size: 10.0,
                          color: QuantColors.emeraldMatrix,
                        ),
                        const SizedBox(width: 3.0),
                        Text(
                          'Kyber-1024 E2EE',
                          style: QuantTypography.pillarLabel.copyWith(
                            color: Colors.white70,
                            fontSize: 9.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '10:42 AM',
                    style: QuantTypography.pillarLabel.copyWith(
                      color: Colors.white38,
                      fontSize: 10.0,
                    ),
                  ),
                ],
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
              'Inbox Zero in ${_activeMailLens.label}',
              style: QuantTypography.titleMedium.copyWith(
                color: Colors.white70,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4.0),
            Text(
              'All threads in this category have been triaged or archived.',
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
    final scheduleItems = [
      {
        'title': 'Sovereign Core Architecture Sync',
        'time': '14:30 - 15:15 IST',
        'location': 'WebRTC Stage #alpha-room',
        'organizer': 'Alex Mercer',
        'rfc5545': 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
        'status': 'Confirmed',
        'accent': QuantColors.sunsetGold,
      },
      {
        'title': 'Kyber-1024 Post-Quantum Security Audit',
        'time': '16:00 - 17:00 IST',
        'location': 'Security Vault #vault-9',
        'organizer': 'Demis Hassabis',
        'rfc5545': 'RRULE:FREQ=DAILY;COUNT=5',
        'status': 'Slot Locked',
        'accent': QuantColors.emeraldMatrix,
      },
      {
        'title': 'FastCDC 3.4x Storage Deduplication Review',
        'time': '18:00 - 18:30 IST',
        'location': 'Stage #storage-core',
        'organizer': 'Ada Lovelace',
        'rfc5545': 'RRULE:FREQ=MONTHLY',
        'status': 'CalDAV Synced',
        'accent': QuantColors.sovereignCyan,
      },
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 80.0),
      children: [
        // Next Meeting Highlight Tile
        _buildNextMeetingTile(),

        const SizedBox(height: 14.0),

        // Date and Timezone Row
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'TODAY · RFC 5545 AGENDA',
              style: QuantTypography.pillarLabel.copyWith(
                color: QuantColors.sunsetGold,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            Row(
              children: [
                const Icon(
                  Icons.public_rounded,
                  size: 13.0,
                  color: Colors.white54,
                ),
                const SizedBox(width: 4.0),
                Text(
                  'Asia/Kolkata (IST)',
                  style: QuantTypography.pillarLabel.copyWith(
                    color: Colors.white54,
                    fontSize: 10.5,
                  ),
                ),
              ],
            ),
          ],
        ),

        const SizedBox(height: 10.0),

        ...scheduleItems.map((item) {
          final accent = item['accent'] as Color;

          return Padding(
            padding: const EdgeInsets.only(bottom: 10.0),
            child: Container(
              padding: const EdgeInsets.all(12.0),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(12.0),
                border: Border.all(
                  color: accent.withOpacity(0.35),
                  width: 1.0,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6.0,
                          vertical: 2.0,
                        ),
                        decoration: BoxDecoration(
                          color: accent.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(4.0),
                        ),
                        child: Text(
                          item['status'] as String,
                          style: TextStyle(
                            color: accent,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        item['time'] as String,
                        style: QuantTypography.pillarLabel.copyWith(
                          color: Colors.white70,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6.0),
                  Text(
                    item['title'] as String,
                    style: QuantTypography.bodyMedium.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 13.0,
                    ),
                  ),
                  const SizedBox(height: 4.0),
                  Row(
                    children: [
                      const Icon(
                        Icons.videocam_outlined,
                        size: 13.0,
                        color: Colors.white54,
                      ),
                      const SizedBox(width: 4.0),
                      Text(
                        item['location'] as String,
                        style: QuantTypography.pillarLabel.copyWith(
                          color: Colors.white54,
                          fontSize: 11.0,
                        ),
                      ),
                      const SizedBox(width: 10.0),
                      const Icon(
                        Icons.person_outline_rounded,
                        size: 13.0,
                        color: Colors.white54,
                      ),
                      const SizedBox(width: 4.0),
                      Text(
                        item['organizer'] as String,
                        style: QuantTypography.pillarLabel.copyWith(
                          color: Colors.white54,
                          fontSize: 11.0,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  // ===========================================================================
  // DRIVE PILLAR VIEW
  // ===========================================================================

  Widget _buildDrivePillarView() {
    final driveFiles = [
      {
        'name': 'arch_diagram_v4.excalidraw',
        'size': '1.2 MB',
        'type': 'Diagram',
        'chunks': '24 chunks',
        'status': 'Kyber-1024 Sealed',
        'icon': Icons.account_tree_rounded,
      },
      {
        'name': 'wave76_quantum_envelope.pdf',
        'size': '4.8 MB',
        'type': 'PDF Document',
        'chunks': '96 chunks',
        'status': 'FastCDC 3.4x Dedup',
        'icon': Icons.picture_as_pdf_rounded,
      },
      {
        'name': 'security_audit_kyber.json',
        'size': '256 KB',
        'type': 'JSON Manifest',
        'chunks': '6 chunks',
        'status': 'SHA3-512 Hash Verified',
        'icon': Icons.data_object_rounded,
      },
      {
        'name': 'sovereign_keyring_backup.enc',
        'size': '64 KB',
        'type': 'Vault Keyring',
        'chunks': '2 chunks',
        'status': 'Hardware Key Backed',
        'icon': Icons.vpn_key_rounded,
      },
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 80.0),
      children: [
        // FastCDC Storage Overview Tile
        _buildDriveStorageTile(),

        const SizedBox(height: 14.0),

        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'RECENT ENCRYPTED OBJECTS',
              style: QuantTypography.pillarLabel.copyWith(
                color: QuantColors.sovereignCyan,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const QuantBadge(
              label: 'FastCDC Active',
              variant: QuantBadgeVariant.info,
              leadingIcon: Icons.speed_rounded,
            ),
          ],
        ),

        const SizedBox(height: 10.0),

        ...driveFiles.map((file) {
          final icon = file['icon'] as IconData;

          return Padding(
            padding: const EdgeInsets.only(bottom: 8.0),
            child: Container(
              padding: const EdgeInsets.all(12.0),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(12.0),
                border: Border.all(
                  color: QuantColors.hairlineBorder,
                  width: 0.8,
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36.0,
                    height: 36.0,
                    decoration: BoxDecoration(
                      color: QuantColors.sovereignCyan.withOpacity(0.14),
                      borderRadius: BorderRadius.circular(8.0),
                      border: Border.all(
                        color: QuantColors.sovereignCyan.withOpacity(0.3),
                        width: 0.8,
                      ),
                    ),
                    child: Icon(
                      icon,
                      size: 18.0,
                      color: QuantColors.sovereignCyan,
                    ),
                  ),
                  const SizedBox(width: 12.0),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          file['name'] as String,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: QuantTypography.bodyMedium.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 12.5,
                          ),
                        ),
                        const SizedBox(height: 2.0),
                        Text(
                          '${file['size']} · ${file['chunks']} · ${file['status']}',
                          style: QuantTypography.pillarLabel.copyWith(
                            color: Colors.white54,
                            fontSize: 10.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.more_vert_rounded,
                      size: 18.0,
                      color: Colors.white54,
                    ),
                    onPressed: () {},
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}
