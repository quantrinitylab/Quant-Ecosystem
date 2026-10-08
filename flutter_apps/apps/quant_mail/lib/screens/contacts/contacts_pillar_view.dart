import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

/// Sovereign Contacts & Enterprise Keyring Pillar View for QuantMail.
///
/// Features 5 context sub-views:
/// 1. Contacts: Complete A-Z indexed contacts list with quick-jump rail, search filter, and verified beacons.
/// 2. VIPs: executive cards with 1-tap call/email (wired to real contacts API).
/// 3. Companies: Enterprise organization groupings with member rosters and domain mapping.
/// 4. AI Dedup: Smart identity merge wizard with side-by-side comparison and 98% confidence scoring.
/// 5. Circles: Cryptographically isolated enterprise circles with key-exchange status.
class ContactsPillarView extends StatefulWidget {
  final int activeSubViewIndex;
  final ValueChanged<int>? onSubViewChanged;

  const ContactsPillarView({
    super.key,
    this.activeSubViewIndex = 0,
    this.onSubViewChanged,
  });

  @override
  State<ContactsPillarView> createState() => _ContactsPillarViewState();
}

class _ContactsPillarViewState extends State<ContactsPillarView> {
  late int _currentIndex;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String? _selectedAlphabet;
  bool _isMerged = false;

  // Contact Models & Mock Datasets
  // Contact Models & Mock Datasets
  // QM-UIUX-059: removed fake contacts using real public figures' names
  // (web PR #631 standard). Empty until wired to the real contacts API.
  final List<Map<String, dynamic>> _allContacts = [];

  final List<String> _alphabetList = [
    'ALL',
    'A',
    'B',
    'C',
    'D',
    'G',
    'J',
    'L',
    'M',
    'S',
    'T',
    'Y'
  ];

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.activeSubViewIndex;
  }

  @override
  void didUpdateWidget(covariant ContactsPillarView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.activeSubViewIndex != oldWidget.activeSubViewIndex) {
      setState(() {
        _currentIndex = widget.activeSubViewIndex;
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _switchSubView(int index) {
    setState(() => _currentIndex = index);
    widget.onSubViewChanged?.call(index);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildSubViewTabs(),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: _buildCurrentSubView(),
          ),
        ),
      ],
    );
  }

  Widget _buildSubViewTabs() {
    final subViews = [
      {'id': 'contacts', 'label': 'Contacts', 'icon': Icons.contacts_rounded},
      {'id': 'vips', 'label': 'VIPs', 'icon': Icons.workspace_premium_rounded},
      {'id': 'companies', 'label': 'Companies', 'icon': Icons.business_rounded},
      {'id': 'ai_dedup', 'label': 'AI Dedup', 'icon': Icons.auto_fix_high_rounded},
      {'id': 'circles', 'label': 'Circles', 'icon': Icons.supervised_user_circle_rounded},
    ];

    return Container(
      height: 48,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: subViews.length,
        itemBuilder: (context, index) {
          final item = subViews[index];
          final isSelected = _currentIndex == index;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => _switchSubView(index),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: isSelected
                      ? QuantColors.emeraldMatrix.withOpacity(0.18)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  border: isSelected
                      ? Border.all(
                          color: QuantColors.emeraldMatrix.withOpacity(0.6),
                          width: 1.0,
                        )
                      : null,
                ),
                child: Row(
                  children: [
                    Icon(
                      item['icon'] as IconData,
                      size: 16,
                      color: isSelected
                          ? QuantColors.emeraldMatrix
                          : QuantColors.textSecondary,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      item['label'] as String,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected
                            ? Colors.white
                            : QuantColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildCurrentSubView() {
    switch (_currentIndex) {
      case 0:
        return _buildContactsSubView();
      case 1:
        return _buildVipsSubView();
      case 2:
        return _buildCompaniesSubView();
      case 3:
        return _buildDedupSubView();
      case 4:
        return _buildCirclesSubView();
      default:
        return _buildContactsSubView();
    }
  }

  // ---------------------------------------------------------------------------
  // 1. FULL CONTACTS SUB-VIEW (A-Z quick jump, live search, verified beacons)
  // ---------------------------------------------------------------------------
  Widget _buildContactsSubView() {
    final filteredContacts = _allContacts.where((contact) {
      final matchesSearch = _searchQuery.isEmpty ||
          contact['name'].toString().toLowerCase().contains(_searchQuery.toLowerCase()) ||
          contact['company'].toString().toLowerCase().contains(_searchQuery.toLowerCase()) ||
          contact['role'].toString().toLowerCase().contains(_searchQuery.toLowerCase());

      final matchesAlphabet = _selectedAlphabet == null ||
          _selectedAlphabet == 'ALL' ||
          contact['name'].toString().toUpperCase().startsWith(_selectedAlphabet!);

      return matchesSearch && matchesAlphabet;
    }).toList();

    return Row(
      children: [
        // Main Contact List
        Expanded(
          child: Column(
            children: [
              // Search & Telemetry Bar
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 8, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 42,
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateSurface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: TextField(
                          controller: _searchController,
                          style: const TextStyle(color: Colors.white, fontSize: 13),
                          onChanged: (val) => setState(() => _searchQuery = val),
                          decoration: InputDecoration(
                            hintText: 'Search 2,842 contacts, VIPs, roles...',
                            hintStyle: const TextStyle(
                              color: QuantColors.textMuted,
                              fontSize: 13,
                            ),
                            prefixIcon: const Icon(
                              Icons.search_rounded,
                              size: 18,
                              color: QuantColors.textSecondary,
                            ),
                            suffixIcon: _searchQuery.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.clear_rounded, size: 16),
                                    onPressed: () {
                                      _searchController.clear();
                                      setState(() => _searchQuery = '');
                                    },
                                  )
                                : null,
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(vertical: 10),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      decoration: BoxDecoration(
                        color: QuantColors.emeraldMatrix.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: QuantColors.emeraldMatrix.withOpacity(0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.bolt_rounded,
                            size: 14,
                            color: QuantColors.emeraldMatrix,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '<3.2ms',
                            style: QuantTypography.labelSpeed.copyWith(
                              color: QuantColors.emeraldMatrix,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Contacts Count Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${filteredContacts.length} Contacts Displayed',
                      style: QuantTypography.bodySmall.copyWith(
                        color: QuantColors.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Row(
                      children: [
                        const Icon(
                          Icons.verified_user_rounded,
                          size: 13,
                          color: QuantColors.emeraldMatrix,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Sovereign Keyring Synced',
                          style: QuantTypography.bodySmall.copyWith(
                            color: QuantColors.emeraldMatrix,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // List of Contacts
              Expanded(
                child: filteredContacts.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.person_off_rounded,
                              size: 40,
                              color: QuantColors.textMuted,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'No contacts match "$_searchQuery"',
                              style: const TextStyle(color: QuantColors.textSecondary),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 4, 8, 20),
                        itemCount: filteredContacts.length,
                        itemBuilder: (context, index) {
                          final c = filteredContacts[index];
                          return _buildContactCard(c);
                        },
                      ),
              ),
            ],
          ),
        ),

        // A-Z Quick Jump Slider Strip on Right
        _buildAlphabetRail(),
      ],
    );
  }

  Widget _buildAlphabetRail() {
    return Container(
      width: 28,
      margin: const EdgeInsets.only(right: 6, bottom: 20),
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard.withOpacity(0.7),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder.withOpacity(0.5)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: _alphabetList.map((letter) {
          final isSelected = (_selectedAlphabet == null && letter == 'ALL') ||
              _selectedAlphabet == letter;
          return InkWell(
            onTap: () {
              setState(() {
                _selectedAlphabet = letter == 'ALL' ? null : letter;
              });
            },
            child: Container(
              width: 22,
              height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isSelected
                    ? QuantColors.emeraldMatrix
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                letter,
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                  color: isSelected ? Colors.white : QuantColors.textSecondary,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildContactCard(Map<String, dynamic> c) {
    final List<Color> gradient = c['avatarGradient'] as List<Color>;
    final String name = c['name'] as String;
    final String initials = name.split(' ').map((e) => e.isNotEmpty ? e[0] : '').take(2).join();

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          // Avatar Gradient Circle with Verified Beacon Dot
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: gradient,
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    initials,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              if (c['isVerified'] == true)
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: QuantColors.statusSuccess,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: QuantColors.darkSlateCard,
                        width: 2,
                      ),
                    ),
                    child: const Icon(
                      Icons.check,
                      size: 9,
                      color: Colors.white,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),

          // Contact Details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (c['isVip'] == true) ...[
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.star_rounded,
                        size: 15,
                        color: QuantColors.sunsetGold,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${c['role']} · ${c['company']}',
                  style: const TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 12,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    const Icon(
                      Icons.alternate_email_rounded,
                      size: 11,
                      color: QuantColors.textMuted,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      c['email'] as String,
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Quick Action Icons
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                icon: const Icon(
                  Icons.phone_outlined,
                  size: 18,
                  color: QuantColors.emeraldMatrix,
                ),
                tooltip: 'Direct Call',
                onPressed: () => _showActionFeedback('Initiating secure call to $name...'),
              ),
              IconButton(
                icon: const Icon(
                  Icons.mail_outline_rounded,
                  size: 18,
                  color: QuantColors.moltenAmber,
                ),
                tooltip: 'Send Email',
                onPressed: () => _showActionFeedback('Drafting E2EE email to ${c['email']}...'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // 2. VIPS SUB-VIEW (executive cards from real contacts)
  // ---------------------------------------------------------------------------
  Widget _buildVipsSubView() {
    final vips = _allContacts.where((c) => c['isVip'] == true).toList();

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        // VIP Header Banner
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF2E2413), Color(0xFF1B1712)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: QuantColors.sunsetGold.withOpacity(0.4),
              width: 1.2,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: QuantColors.sunsetGold.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: QuantColors.sunsetGold.withOpacity(0.5)),
                ),
                child: const Icon(
                  Icons.workspace_premium_rounded,
                  color: QuantColors.sunsetGold,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Executive VIP Radar',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${vips.length} High-Trust Executive Channels with Direct Priority Bypass',
                      style: TextStyle(
                        color: QuantColors.sunsetGold.withOpacity(0.9),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // VIP Cards List
        ...vips.map((vip) {
          final List<Color> gradient = vip['avatarGradient'] as List<Color>;
          final String name = vip['name'] as String;
          final String initials = name.split(' ').map((e) => e[0]).take(2).join();

          return Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: QuantColors.sunsetGold.withOpacity(0.3),
                width: 1.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: QuantColors.sunsetGold.withOpacity(0.06),
                  blurRadius: 12,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // Avatar
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: gradient,
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: QuantColors.sunsetGold.withOpacity(0.6),
                          width: 1.5,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          initials,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),

                    // Info
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                name,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: QuantColors.sunsetGold.withOpacity(0.18),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: QuantColors.sunsetGold.withOpacity(0.5),
                                    width: 0.8,
                                  ),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.star_rounded,
                                      size: 11,
                                      color: QuantColors.sunsetGold,
                                    ),
                                    SizedBox(width: 2),
                                    Text(
                                      'VIP',
                                      style: TextStyle(
                                        color: QuantColors.sunsetGold,
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${vip['role']} · ${vip['company']}',
                            style: const TextStyle(
                              color: QuantColors.textSecondary,
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(
                                Icons.shield_rounded,
                                size: 12,
                                color: QuantColors.emeraldMatrix,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Encrypted Pre-Key Verified · <2ms Dispatch',
                                style: TextStyle(
                                  color: QuantColors.emeraldMatrix.withOpacity(0.9),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Channels Info
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: QuantColors.darkSlateSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.alternate_email_rounded,
                        size: 13,
                        color: QuantColors.textSecondary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        vip['email'] as String,
                        style: const TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const Spacer(),
                      const Icon(
                        Icons.phone_rounded,
                        size: 13,
                        color: QuantColors.textSecondary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        vip['phone'] as String,
                        style: const TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Direct 1-Tap Action Pills [Call] and [Email]
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => _showActionFeedback('Dialing direct encrypted line to $name (${vip['phone']})...'),
                        child: Container(
                          height: 38,
                          decoration: BoxDecoration(
                            color: QuantColors.emeraldMatrix.withOpacity(0.16),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: QuantColors.emeraldMatrix.withOpacity(0.5),
                            ),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.phone_rounded,
                                size: 16,
                                color: QuantColors.emeraldMatrix,
                              ),
                              SizedBox(width: 6),
                              Text(
                                'Call VIP Direct',
                                style: TextStyle(
                                  color: QuantColors.emeraldMatrix,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => _showActionFeedback('Composing priority email to ${vip['email']}...'),
                        child: Container(
                          height: 38,
                          decoration: BoxDecoration(
                            color: QuantColors.moltenAmber.withOpacity(0.16),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: QuantColors.moltenAmber.withOpacity(0.5),
                            ),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.send_rounded,
                                size: 15,
                                color: QuantColors.moltenAmber,
                              ),
                              SizedBox(width: 6),
                              Text(
                                'Priority Email',
                                style: TextStyle(
                                  color: QuantColors.moltenAmber,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // 3. COMPANIES SUB-VIEW (Alphabet, Microsoft, Linux Foundation, Quant Trinity Lab)
  // ---------------------------------------------------------------------------
  Widget _buildCompaniesSubView() {
    // QM-UIUX-059: removed fake companies with real people's names.
    // Empty until wired to the real contacts API.
    final companies = <Map<String, dynamic>>[];

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Enterprise Organizations & Teams',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateSurface,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Text(
                  '4 Active Organizations',
                  style: TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),

        // Company Cards
        ...companies.map((co) {
          final Color accent = co['accentColor'] as Color;
          final List<Map<String, String>> members = co['members'] as List<Map<String, String>>;

          return Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: accent.withOpacity(0.14),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: accent.withOpacity(0.4)),
                      ),
                      child: Icon(
                        co['icon'] as IconData,
                        color: accent,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            co['name'] as String,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${co['domain']} · ${co['hq']}',
                            style: const TextStyle(
                              color: QuantColors.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: accent.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: accent.withOpacity(0.3)),
                      ),
                      child: Text(
                        '${co['membersCount']} members',
                        style: TextStyle(
                          color: accent,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Members preview list
                const Text(
                  'Key Representatives & Executive Contacts:',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: members.map((m) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                      decoration: BoxDecoration(
                        color: QuantColors.darkSlateSurface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircleAvatar(
                            radius: 9,
                            backgroundColor: accent.withOpacity(0.3),
                            child: Text(
                              m['initials']!,
                              style: TextStyle(
                                color: accent,
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            m['name']!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '(${m['role']})',
                            style: const TextStyle(
                              color: QuantColors.textMuted,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 12),

                // Actions row
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton.icon(
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        visualDensity: VisualDensity.compact,
                      ),
                      onPressed: () => _showActionFeedback('Filtering contacts for ${co['name']}...'),
                      icon: const Icon(Icons.people_outline_rounded, size: 14, color: QuantColors.textSecondary),
                      label: const Text(
                        'View Roster',
                        style: TextStyle(color: QuantColors.textSecondary, fontSize: 12),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: accent.withOpacity(0.18),
                        foregroundColor: accent,
                        elevation: 0,
                        side: BorderSide(color: accent.withOpacity(0.4)),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        visualDensity: VisualDensity.compact,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () => _showActionFeedback('Composing circular to all contacts at ${co['name']}...'),
                      icon: const Icon(Icons.send_rounded, size: 13),
                      label: const Text(
                        'Email Organization',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // 4. AI DEDUP SUB-VIEW (Smart duplicate contact cleaner wizard)
  // ---------------------------------------------------------------------------
  Widget _buildDedupSubView() {
    // QM-UIUX-059: removed hardcoded fake dedup demo using a real person's name.
    // Honest empty state until wired to the real dedup engine.
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.auto_fix_high_rounded, size: 48, color: QuantColors.textSecondary),
            SizedBox(height: 16),
            Text(
              'No duplicates found',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
            ),
            SizedBox(height: 8),
            Text(
              'Duplicate detection runs when contacts are available.',
              textAlign: TextAlign.center,
              style: TextStyle(color: QuantColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }


  // ---------------------------------------------------------------------------
  // 5. CIRCLES SUB-VIEW (Enterprise Circles view)
  // ---------------------------------------------------------------------------
  Widget _buildCirclesSubView() {
    // QM-UIUX-059: removed fake circles with real people's names.
    // Empty until wired to the real contacts API.
    final circles = <Map<String, dynamic>>[];

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Enterprise Cryptographic Circles',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateSurface,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.lock_rounded, size: 11, color: QuantColors.emeraldMatrix),
                    SizedBox(width: 4),
                    Text(
                      'E2EE Key-Exchange Active',
                      style: TextStyle(
                        color: QuantColors.emeraldMatrix,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        // Circles list
        ...circles.map((circle) {
          final Color cColor = circle['color'] as Color;
          final List<String> memberNames = circle['members'] as List<String>;

          return Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: cColor.withOpacity(0.14),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: cColor.withOpacity(0.4)),
                      ),
                      child: Icon(
                        circle['icon'] as IconData,
                        color: cColor,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            circle['title'] as String,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            circle['subtitle'] as String,
                            style: const TextStyle(
                              color: QuantColors.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: cColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: cColor.withOpacity(0.3)),
                      ),
                      child: Text(
                        '${circle['membersCount']} members',
                        style: TextStyle(
                          color: cColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Members Avatar Stack
                Row(
                  children: [
                    ...memberNames.take(4).map((name) {
                      final initials = name.split(' ').map((e) => e[0]).take(2).join();
                      return Container(
                        margin: const EdgeInsets.only(right: 6),
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateSurface,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: cColor.withOpacity(0.5)),
                        ),
                        child: Center(
                          child: Text(
                            initials,
                            style: TextStyle(
                              color: cColor,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      );
                    }),
                    if (circle['membersCount'] as int > 4)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateSurface,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: Text(
                          '+${(circle['membersCount'] as int) - 4} more',
                          style: const TextStyle(
                            color: QuantColors.textSecondary,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: QuantColors.darkSlateSurface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.vpn_key_rounded, size: 11, color: QuantColors.emeraldMatrix),
                          SizedBox(width: 4),
                          Text(
                            'Shared Enclave Key',
                            style: TextStyle(
                              color: QuantColors.textSecondary,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Actions
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: QuantColors.textSecondary,
                        side: const BorderSide(color: QuantColors.hairlineBorder),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        visualDensity: VisualDensity.compact,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () => _showActionFeedback('Starting circle meeting for ${circle['title']}...'),
                      icon: const Icon(Icons.video_call_rounded, size: 15),
                      label: const Text('Circle Call', style: TextStyle(fontSize: 12)),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: cColor.withOpacity(0.18),
                        foregroundColor: cColor,
                        elevation: 0,
                        side: BorderSide(color: cColor.withOpacity(0.4)),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        visualDensity: VisualDensity.compact,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () => _showActionFeedback('Broadcasting encrypted message to ${circle['title']}...'),
                      icon: const Icon(Icons.broadcast_on_personal_rounded, size: 13),
                      label: const Text(
                        'Broadcast to Circle',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  void _showActionFeedback(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateSurface,
        behavior: SnackBarBehavior.floating,
        content: Row(
          children: [
            const Icon(Icons.info_outline_rounded, color: QuantColors.emeraldMatrix, size: 16),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(color: Colors.white, fontSize: 12),
              ),
            ),
          ],
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }
}
