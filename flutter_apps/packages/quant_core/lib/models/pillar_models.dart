// Sovereign Quant Ecosystem - Domain Models & Productivity Pillars
// Strictly ZERO raw Unicode emojis throughout this file.

/// The 5 Sovereign Productivity Pillars of the Quant Ecosystem.
enum ProductivityPillar {
  mail,
  calendar,
  drive,
  contacts,
  quantgit;

  /// Unique identifier key for the pillar.
  String get id => name;

  /// User-facing capitalized title.
  String get label {
    switch (this) {
      case ProductivityPillar.mail:
        return 'Mail';
      case ProductivityPillar.calendar:
        return 'Calendar';
      case ProductivityPillar.drive:
        return 'Drive';
      case ProductivityPillar.contacts:
        return 'Contacts';
      case ProductivityPillar.quantgit:
        return 'QuantGit';
    }
  }

  /// Signature obsidian brand accent color hex for the pillar.
  String get accentHex {
    switch (this) {
      case ProductivityPillar.mail:
        return '#FF8C42'; // Molten Amber
      case ProductivityPillar.calendar:
        return '#38BDF8'; // Sky Cyan
      case ProductivityPillar.drive:
        return '#10B981'; // Emerald
      case ProductivityPillar.contacts:
        return '#A855F7'; // Royal Purple
      case ProductivityPillar.quantgit:
        return '#6366F1'; // Indigo Sovereign
    }
  }

  /// Default route path across Web, Desktop, and Mobile.
  String get defaultRoute {
    switch (this) {
      case ProductivityPillar.mail:
        return '/mail';
      case ProductivityPillar.calendar:
        return '/calendar';
      case ProductivityPillar.drive:
        return '/drive';
      case ProductivityPillar.contacts:
        return '/contacts';
      case ProductivityPillar.quantgit:
        return '/quantgit';
    }
  }

  /// Clean SVG icon definition for the pillar.
  String get iconSvg {
    switch (this) {
      case ProductivityPillar.mail:
        return '''<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>''';
      case ProductivityPillar.calendar:
        return '''<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>''';
      case ProductivityPillar.drive:
        return '''<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>''';
      case ProductivityPillar.contacts:
        return '''<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>''';
      case ProductivityPillar.quantgit:
        return '''<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>''';
    }
  }

  /// Safe lookup from string identifier.
  static ProductivityPillar fromId(String id) {
    return ProductivityPillar.values.firstWhere(
      (element) => element.name.toLowerCase() == id.toLowerCase(),
      orElse: () => ProductivityPillar.mail,
    );
  }
}

/// Navigation destination model representing context-specific sub-tabs.
class ContextNavDestination {
  final String id;
  final String label;
  final String iconSvg;
  final int badgeCount;
  final String route;
  final Map<String, dynamic> metadata;

  const ContextNavDestination({
    required this.id,
    required this.label,
    required this.iconSvg,
    this.badgeCount = 0,
    this.route = '',
    this.metadata = const {},
  });

  /// Creates a copy with modified properties.
  ContextNavDestination copyWith({
    String? id,
    String? label,
    String? iconSvg,
    int? badgeCount,
    String? route,
    Map<String, dynamic>? metadata,
  }) {
    return ContextNavDestination(
      id: id ?? this.id,
      label: label ?? this.label,
      iconSvg: iconSvg ?? this.iconSvg,
      badgeCount: badgeCount ?? this.badgeCount,
      route: route ?? this.route,
      metadata: metadata ?? this.metadata,
    );
  }

  /// Serializes destination to JSON map.
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'label': label,
      'iconSvg': iconSvg,
      'badgeCount': badgeCount,
      'route': route,
      'metadata': metadata,
    };
  }

  /// Deserializes destination from JSON map.
  factory ContextNavDestination.fromJson(Map<String, dynamic> json) {
    return ContextNavDestination(
      id: json['id'] as String? ?? '',
      label: json['label'] as String? ?? '',
      iconSvg: json['iconSvg'] as String? ?? '',
      badgeCount: (json['badgeCount'] as num?)?.toInt() ?? 0,
      route: json['route'] as String? ?? '',
      metadata: json['metadata'] as Map<String, dynamic>? ?? const {},
    );
  }

  @override
  String toString() => 'ContextNavDestination(id: \$id, label: \$label, badgeCount: \$badgeCount)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ContextNavDestination &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          label == other.label &&
          badgeCount == other.badgeCount &&
          route == other.route;

  @override
  int get hashCode => Object.hash(id, label, badgeCount, route);
}

/// Helper function providing the 5 authentic sub-tabs for each Productivity Pillar.
List<ContextNavDestination> getSubTabsForPillar(ProductivityPillar pillar) {
  switch (pillar) {
    case ProductivityPillar.mail:
      return const [
        ContextNavDestination(
          id: 'inbox',
          label: 'Inbox',
          badgeCount: 12,
          route: '/mail/inbox',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>''',
        ),
        ContextNavDestination(
          id: 'starred',
          label: 'VIP & Starred',
          badgeCount: 0,
          route: '/mail/starred',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>''',
        ),
        ContextNavDestination(
          id: 'sent',
          label: 'Sent',
          badgeCount: 0,
          route: '/mail/sent',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>''',
        ),
        ContextNavDestination(
          id: 'drafts',
          label: 'Drafts',
          badgeCount: 2,
          route: '/mail/drafts',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>''',
        ),
        ContextNavDestination(
          id: 'archive',
          label: 'Archive',
          badgeCount: 0,
          route: '/mail/archive',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>''',
        ),
      ];

    case ProductivityPillar.calendar:
      return const [
        ContextNavDestination(
          id: 'agenda',
          label: 'Agenda',
          badgeCount: 0,
          route: '/calendar/agenda',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>''',
        ),
        ContextNavDestination(
          id: 'day',
          label: 'Day View',
          badgeCount: 0,
          route: '/calendar/day',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="2"/></svg>''',
        ),
        ContextNavDestination(
          id: 'week',
          label: 'Week View',
          badgeCount: 0,
          route: '/calendar/week',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="10" x2="8" y2="22"/><line x1="16" y1="10" x2="16" y2="22"/></svg>''',
        ),
        ContextNavDestination(
          id: 'bookings',
          label: 'Bookings',
          badgeCount: 1,
          route: '/calendar/bookings',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>''',
        ),
        ContextNavDestination(
          id: 'sync',
          label: 'CalDAV & TZ',
          badgeCount: 0,
          route: '/calendar/sync',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>''',
        ),
      ];

    case ProductivityPillar.drive:
      return const [
        ContextNavDestination(
          id: 'files',
          label: 'All Files',
          badgeCount: 0,
          route: '/drive/files',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>''',
        ),
        ContextNavDestination(
          id: 'recent',
          label: 'Recent',
          badgeCount: 0,
          route: '/drive/recent',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>''',
        ),
        ContextNavDestination(
          id: 'starred',
          label: 'Starred',
          badgeCount: 0,
          route: '/drive/starred',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>''',
        ),
        ContextNavDestination(
          id: 'vault',
          label: 'E2EE Vault',
          badgeCount: 0,
          route: '/drive/vault',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>''',
        ),
        ContextNavDestination(
          id: 'trash',
          label: 'Trash',
          badgeCount: 0,
          route: '/drive/trash',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>''',
        ),
      ];

    case ProductivityPillar.contacts:
      return const [
        ContextNavDestination(
          id: 'all',
          label: 'All Contacts',
          badgeCount: 0,
          route: '/contacts/all',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>''',
        ),
        ContextNavDestination(
          id: 'vips',
          label: 'VIPs',
          badgeCount: 0,
          route: '/contacts/vips',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>''',
        ),
        ContextNavDestination(
          id: 'groups',
          label: 'Groups',
          badgeCount: 0,
          route: '/contacts/groups',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>''',
        ),
        ContextNavDestination(
          id: 'dedup',
          label: 'Clean & Merge',
          badgeCount: 0,
          route: '/contacts/dedup',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>''',
        ),
        ContextNavDestination(
          id: 'directory',
          label: 'Org Directory',
          badgeCount: 0,
          route: '/contacts/directory',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>''',
        ),
      ];

    case ProductivityPillar.quantgit:
      return const [
        ContextNavDestination(
          id: 'repos',
          label: 'Repositories',
          badgeCount: 0,
          route: '/quantgit/repos',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>''',
        ),
        ContextNavDestination(
          id: 'prs',
          label: 'Pull Requests',
          badgeCount: 3,
          route: '/quantgit/prs',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>''',
        ),
        ContextNavDestination(
          id: 'issues',
          label: 'Issues',
          badgeCount: 5,
          route: '/quantgit/issues',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>''',
        ),
        ContextNavDestination(
          id: 'actions',
          label: 'Actions & CI',
          badgeCount: 0,
          route: '/quantgit/actions',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>''',
        ),
        ContextNavDestination(
          id: 'copilot',
          label: 'Quanty Fleet',
          badgeCount: 0,
          route: '/quantgit/copilot',
          iconSvg: '''<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>''',
        ),
      ];
  }
}
