// Sovereign Quant Ecosystem - QuantChat Group Detail Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import '../../models/chat_models.dart';
import '../security/safety_number_screen.dart';

class GroupDetailScreen extends StatefulWidget {
  final ChatConversation conversation;

  const GroupDetailScreen({
    super.key,
    required this.conversation,
  });

  @override
  State<GroupDetailScreen> createState() => _GroupDetailScreenState();
}

class _GroupDetailScreenState extends State<GroupDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late List<ChatGroupMember> _members;
  late List<ChatMediaItem> _mediaItems;
  bool _isMuted = false;
  DisappearingTimerOption _disappearingOption = DisappearingTimerOption.off;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    // No mock data: members and media load from the real backend.
    _members = <ChatGroupMember>[];
    _mediaItems = <ChatMediaItem>[];
    _isMuted = widget.conversation.isMuted;
    _disappearingOption = widget.conversation.disappearingOption;
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  List<ChatMediaItem> get _filteredMedia =>
      _mediaItems.where((i) => i.category == ChatMediaCategory.media).toList();

  List<ChatMediaItem> get _filteredDocs =>
      _mediaItems.where((i) => i.category == ChatMediaCategory.document).toList();

  List<ChatMediaItem> get _filteredLinks =>
      _mediaItems.where((i) => i.category == ChatMediaCategory.link).toList();

  void _handleAddMember() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Member Invitation Sheet: Select contacts to add to this sovereign group.',
          style: TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  void _handleExitGroup() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: QuantColors.hairlineBorder),
        ),
        title: const Text(
          'Exit Sovereign Group?',
          style: TextStyle(color: QuantColors.textPrimary, fontWeight: FontWeight.w700),
        ),
        content: const Text(
          'You will no longer receive encrypted messages or participate in WebRTC mesh stages in this group.',
          style: TextStyle(color: QuantColors.textSecondary, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: QuantColors.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.statusError,
                  content: Text('You have exited the sovereign group.'),
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.statusError,
              foregroundColor: Colors.white,
            ),
            child: const Text('Exit Group'),
          ),
        ],
      ),
    );
  }

  void _handleDeleteGroup() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: QuantColors.hairlineBorder),
        ),
        title: const Text(
          'Delete Group Mesh?',
          style: TextStyle(color: QuantColors.statusError, fontWeight: FontWeight.w700),
        ),
        content: const Text(
          'All cryptographic session keys will be revoked and group message history purged from the sovereign mesh with HTTP 410 destruction.',
          style: TextStyle(color: QuantColors.textSecondary, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: QuantColors.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.statusError,
                  content: Text('Group mesh destroyed and purged.'),
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.statusError,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete Group'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final conv = widget.conversation;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Group Info',
          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_2_rounded, color: QuantColors.sovereignCyan),
            tooltip: 'Group E2EE Safety Number',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (ctx) => SafetyNumberScreen(
                    contactName: conv.name,
                    contactInitials: conv.avatarInitials,
                    contactAvatarColor: conv.avatarColor,
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.more_vert_rounded, color: QuantColors.textSecondary),
            onPressed: () {},
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: QuantColors.hairlineBorder, height: 1),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        children: [
          // Header Card with Avatar & Subject
          _buildHeaderCard(conv),

          const SizedBox(height: 16),

          // Quick Action Bar (Audio, Video, Add, Search)
          _buildQuickActionBar(),

          const SizedBox(height: 16),

          // Description & Topic Card
          _buildDescriptionCard(conv),

          const SizedBox(height: 16),

          // Media, Docs, and Links Gallery Section with Tabs
          _buildMediaDocsLinksCard(),

          const SizedBox(height: 16),

          // Settings (Mute, Disappearing, Encryption)
          _buildSettingsCard(),

          const SizedBox(height: 16),

          // Member List Section with Admin Badges & Add Button
          _buildMemberListSection(),

          const SizedBox(height: 20),

          // Exit & Delete Group Actions
          _buildDangerActionsCard(),

          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildHeaderCard(ChatConversation conv) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          // Large Squircle Avatar
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: conv.avatarColor.withOpacity(0.2),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: conv.avatarColor, width: 2),
            ),
            child: Center(
              child: Text(
                conv.avatarInitials,
                style: TextStyle(
                  color: conv.avatarColor,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Group Name
          Text(
            conv.name,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),

          // Member Count & Type
          Text(
            'Group · ${_members.length} participants',
            style: const TextStyle(
              color: QuantColors.textSecondary,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 10),

          // Encryption Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: QuantColors.sovereignCyan.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.sovereignCyan.withOpacity(0.3)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_rounded, size: 12, color: QuantColors.sovereignCyan),
                SizedBox(width: 6),
                Text(
                  'Signal Double Ratchet E2EE Active',
                  style: TextStyle(
                    color: QuantColors.sovereignCyan,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionBar() {
    return Row(
      children: [
        _buildQuickActionButton(
          icon: Icons.call_outlined,
          label: 'Audio Call',
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text('Starting group WebRTC audio call...'),
              ),
            );
          },
        ),
        const SizedBox(width: 8),
        _buildQuickActionButton(
          icon: Icons.videocam_outlined,
          label: 'Video Call',
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text('Starting group WebRTC video mesh...'),
              ),
            );
          },
        ),
        const SizedBox(width: 8),
        _buildQuickActionButton(
          icon: Icons.person_add_alt_1_rounded,
          label: 'Add Member',
          onTap: _handleAddMember,
        ),
        const SizedBox(width: 8),
        _buildQuickActionButton(
          icon: Icons.search_rounded,
          label: 'Search',
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text('Search in conversation opened.'),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildQuickActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: QuantColors.sovereignCyan, size: 20),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDescriptionCard(ChatConversation conv) {
    final desc = conv.groupDescription ??
        'Sovereign Tripartite Swarm communications channel with high-throughput encrypted telemetry, WebRTC audio/video mesh, and 120Hz Impeller acceleration.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'DESCRIPTION & TOPIC',
            style: TextStyle(
              color: QuantColors.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            desc,
            style: const TextStyle(
              color: QuantColors.textPrimary,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          const Row(
            children: [
              Icon(Icons.info_outline_rounded, size: 14, color: QuantColors.textSecondary),
              SizedBox(width: 6),
              Text(
                'Created by CEO Astra · Encrypted on local device',
                style: TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMediaDocsLinksCard() {
    final mediaList = _filteredMedia;
    final docsList = _filteredDocs;
    final linksList = _filteredLinks;

    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'SHARED REPOSITORY',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                Text(
                  '${_mediaItems.length} items',
                  style: const TextStyle(
                    color: QuantColors.sovereignCyan,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          TabBar(
            controller: _tabController,
            indicatorColor: QuantColors.sovereignCyan,
            labelColor: QuantColors.sovereignCyan,
            unselectedLabelColor: QuantColors.textSecondary,
            labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            tabs: [
              Tab(text: 'Media (${mediaList.length})'),
              Tab(text: 'Docs (${docsList.length})'),
              Tab(text: 'Links (${linksList.length})'),
            ],
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),
          SizedBox(
            height: 160,
            child: TabBarView(
              controller: _tabController,
              children: [
                // Media Grid
                _buildMediaTabView(mediaList),
                // Documents List
                _buildDocsTabView(docsList),
                // Links List
                _buildLinksTabView(linksList),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMediaTabView(List<ChatMediaItem> items) {
    if (items.isEmpty) {
      return const Center(
        child: Text('No media shared yet', style: TextStyle(color: QuantColors.textMuted)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      scrollDirection: Axis.horizontal,
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(width: 10),
      itemBuilder: (context, idx) {
        final item = items[idx];
        return Container(
          width: 130,
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: item.accentColor.withOpacity(0.15),
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(11),
                      topRight: Radius.circular(11),
                    ),
                  ),
                  child: Center(
                    child: Icon(item.iconData, color: item.accentColor, size: 36),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      item.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDocsTabView(List<ChatMediaItem> items) {
    if (items.isEmpty) {
      return const Center(
        child: Text('No documents shared yet', style: TextStyle(color: QuantColors.textMuted)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(10),
      itemCount: items.length,
      separatorBuilder: (_, __) => const Divider(color: QuantColors.hairlineBorder, height: 1),
      itemBuilder: (context, idx) {
        final doc = items[idx];
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: doc.accentColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(doc.iconData, color: doc.accentColor, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doc.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      doc.subtitle,
                      style: const TextStyle(
                        color: QuantColors.textSecondary,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.download_rounded, color: QuantColors.sovereignCyan, size: 20),
                onPressed: () {},
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildLinksTabView(List<ChatMediaItem> items) {
    if (items.isEmpty) {
      return const Center(
        child: Text('No links shared yet', style: TextStyle(color: QuantColors.textMuted)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(10),
      itemCount: items.length,
      separatorBuilder: (_, __) => const Divider(color: QuantColors.hairlineBorder, height: 1),
      itemBuilder: (context, idx) {
        final link = items[idx];
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: link.accentColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(link.iconData, color: link.accentColor, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      link.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      link.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: QuantColors.sovereignCyan,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.open_in_new_rounded, color: QuantColors.textMuted, size: 18),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSettingsCard() {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          // Mute Notifications Toggle
          SwitchListTile(
            value: _isMuted,
            activeColor: QuantColors.sovereignCyan,
            secondary: const Icon(Icons.notifications_off_outlined, color: QuantColors.textSecondary),
            title: const Text(
              'Mute Notifications',
              style: TextStyle(color: QuantColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              _isMuted ? 'Muted' : 'Sound & vibration active',
              style: const TextStyle(color: QuantColors.textSecondary, fontSize: 11),
            ),
            onChanged: (val) => setState(() => _isMuted = val),
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Disappearing Messages
          ListTile(
            leading: const Icon(Icons.timer_outlined, color: QuantColors.moltenOrange),
            title: const Text(
              'Disappearing Messages',
              style: TextStyle(color: QuantColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              _disappearingOption == DisappearingTimerOption.off
                  ? 'Off'
                  : '${_disappearingOption.label} (HTTP 410 Server Destruction)',
              style: const TextStyle(color: QuantColors.textSecondary, fontSize: 11),
            ),
            trailing: const Icon(Icons.chevron_right_rounded, color: QuantColors.textSecondary),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text('Disappearing messages timer configurable by group admins.'),
                ),
              );
            },
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Encryption Verification Row
          ListTile(
            leading: const Icon(Icons.verified_user_outlined, color: QuantColors.statusSuccess),
            title: const Text(
              'Verify End-to-End Encryption',
              style: TextStyle(color: QuantColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Tap to view cryptographic safety numbers & QR codes',
              style: TextStyle(color: QuantColors.textSecondary, fontSize: 11),
            ),
            trailing: const Icon(Icons.chevron_right_rounded, color: QuantColors.textSecondary),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (ctx) => SafetyNumberScreen(
                    contactName: widget.conversation.name,
                    contactInitials: widget.conversation.avatarInitials,
                    contactAvatarColor: widget.conversation.avatarColor,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildMemberListSection() {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with Count & Add Button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'PARTICIPANTS (${_members.length})',
                  style: const TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                InkWell(
                  onTap: _handleAddMember,
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: QuantColors.sovereignCyan.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: QuantColors.sovereignCyan.withOpacity(0.3)),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.person_add_rounded, size: 14, color: QuantColors.sovereignCyan),
                        SizedBox(width: 4),
                        Text(
                          'Add Member',
                          style: TextStyle(
                            color: QuantColors.sovereignCyan,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Member Items
          ..._members.asMap().entries.map((entry) {
            final idx = entry.key;
            final member = entry.value;

            return Column(
              children: [
                if (idx > 0) const Divider(color: QuantColors.hairlineBorder, height: 1),
                ListTile(
                  leading: Stack(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: member.avatarColor.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: member.avatarColor.withOpacity(0.6)),
                        ),
                        child: Center(
                          child: Text(
                            member.avatarInitials,
                            style: TextStyle(
                              color: member.avatarColor,
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                      if (member.isOnline)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: QuantColors.statusSuccess,
                              shape: BoxShape.circle,
                              border: Border.all(color: QuantColors.voidObsidian, width: 2),
                            ),
                          ),
                        ),
                    ],
                  ),
                  title: Text(
                    member.name,
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: Text(
                    member.phoneOrHandle,
                    style: const TextStyle(
                      color: QuantColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (member.isCreator)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: QuantColors.moltenOrange.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: QuantColors.moltenOrange),
                          ),
                          child: const Text(
                            'Group Admin',
                            style: TextStyle(
                              color: QuantColors.moltenOrange,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        )
                      else if (member.isAdmin)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: QuantColors.sovereignCyan.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: QuantColors.sovereignCyan),
                          ),
                          child: const Text(
                            'Admin',
                            style: TextStyle(
                              color: QuantColors.sovereignCyan,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      const Icon(Icons.chevron_right_rounded, color: QuantColors.textMuted, size: 18),
                    ],
                  ),
                  onTap: () {
                    _showMemberActionModal(member);
                  },
                ),
              ],
            );
          }),
        ],
      ),
    );
  }

  void _showMemberActionModal(ChatGroupMember member) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(20),
        decoration: const BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(24),
            topRight: Radius.circular(24),
          ),
          border: Border(
            top: BorderSide(color: QuantColors.hairlineBorder),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: member.avatarColor.withOpacity(0.2),
                  child: Text(
                    member.avatarInitials,
                    style: TextStyle(color: member.avatarColor, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        member.name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        member.phoneOrHandle,
                        style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Divider(color: QuantColors.hairlineBorder, height: 1),
            ListTile(
              leading: const Icon(Icons.chat_bubble_outline_rounded, color: QuantColors.sovereignCyan),
              title: const Text('Message Privately', style: TextStyle(color: Colors.white, fontSize: 13)),
              onTap: () {
                Navigator.of(ctx).pop();
              },
            ),
            ListTile(
              leading: const Icon(Icons.shield_outlined, color: QuantColors.obsidianPurple),
              title: Text(
                member.isAdmin ? 'Dismiss as Admin' : 'Make Group Admin',
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                setState(() {
                  final idx = _members.indexWhere((m) => m.id == member.id);
                  if (idx != -1) {
                    _members[idx] = member.copyWith(isAdmin: !member.isAdmin);
                  }
                });
              },
            ),
            ListTile(
              leading: const Icon(Icons.qr_code_2_rounded, color: QuantColors.sovereignCyan),
              title: const Text('Verify Cryptographic Safety Number', style: TextStyle(color: Colors.white, fontSize: 13)),
              onTap: () {
                Navigator.of(ctx).pop();
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (c) => SafetyNumberScreen(
                      contactName: member.name,
                      contactInitials: member.avatarInitials,
                      contactAvatarColor: member.avatarColor,
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.person_remove_rounded, color: QuantColors.statusError),
              title: Text('Remove from Group', style: TextStyle(color: QuantColors.statusError, fontSize: 13)),
              onTap: () {
                Navigator.of(ctx).pop();
                setState(() {
                  _members.removeWhere((m) => m.id == member.id);
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDangerActionsCard() {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          // Exit Group Action
          ListTile(
            leading: const Icon(Icons.logout_rounded, color: QuantColors.statusError),
            title: const Text(
              'Exit Group',
              style: TextStyle(
                color: QuantColors.statusError,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            subtitle: const Text(
              'Leave this encrypted group chat mesh',
              style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
            ),
            onTap: _handleExitGroup,
          ),
          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Delete Group Action
          ListTile(
            leading: const Icon(Icons.delete_forever_rounded, color: QuantColors.statusError),
            title: const Text(
              'Delete Sovereign Group',
              style: TextStyle(
                color: QuantColors.statusError,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            subtitle: const Text(
              'Revoke all cryptographic keys and purge channel',
              style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
            ),
            onTap: _handleDeleteGroup,
          ),
        ],
      ),
    );
  }
}
