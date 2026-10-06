import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// The 5 Sovereign Pillars of the Quant Unified Enterprise Suite.
enum QuantPillar {
  mail,
  calendar,
  drive,
  contacts,
  quantGit;

  String get label {
    switch (this) {
      case QuantPillar.mail:
        return 'Mail';
      case QuantPillar.calendar:
        return 'Calendar';
      case QuantPillar.drive:
        return 'Drive';
      case QuantPillar.contacts:
        return 'Contacts';
      case QuantPillar.quantGit:
        return 'QuantGit';
    }
  }

  Color get accentColor {
    switch (this) {
      case QuantPillar.mail:
        return QuantColors.moltenAmber;
      case QuantPillar.calendar:
        return QuantColors.sunsetGold;
      case QuantPillar.drive:
        return QuantColors.sovereignCyan;
      case QuantPillar.contacts:
        return QuantColors.emeraldMatrix;
      case QuantPillar.quantGit:
        return QuantColors.obsidianPurple;
    }
  }

  IconData get icon {
    switch (this) {
      case QuantPillar.mail:
        return Icons.mail_rounded;
      case QuantPillar.calendar:
        return Icons.calendar_today_rounded;
      case QuantPillar.drive:
        return Icons.folder_rounded;
      case QuantPillar.contacts:
        return Icons.people_alt_rounded;
      case QuantPillar.quantGit:
        return Icons.code_rounded;
    }
  }

  IconData get outlinedIcon {
    switch (this) {
      case QuantPillar.mail:
        return Icons.mail_outline_rounded;
      case QuantPillar.calendar:
        return Icons.calendar_month_outlined;
      case QuantPillar.drive:
        return Icons.folder_outlined;
      case QuantPillar.contacts:
        return Icons.people_outline_rounded;
      case QuantPillar.quantGit:
        return Icons.terminal_rounded;
    }
  }

  String get searchPlaceholder {
    switch (this) {
      case QuantPillar.mail:
        return 'Search emails, threads, drafts... <5ms index';
      case QuantPillar.calendar:
        return 'Search events, slots, meetings... <5ms index';
      case QuantPillar.drive:
        return 'Search files, vault, chunks... FastCDC <5ms';
      case QuantPillar.contacts:
        return 'Search contacts, VIPs, circles... <5ms index';
      case QuantPillar.quantGit:
        return 'Search repos, commits, PRs, issues... <5ms';
    }
  }

  /// Context-specific sub-views for the bottom navigation bar
  List<PillarSubView> get subViews {
    switch (this) {
      case QuantPillar.mail:
        return const [
          PillarSubView(id: 'inbox', label: 'Inbox', icon: Icons.inbox_rounded),
          PillarSubView(id: 'priority', label: 'Priority', icon: Icons.star_rounded),
          PillarSubView(id: 'teams', label: 'Teams', icon: Icons.groups_rounded),
          PillarSubView(id: 'sent', label: 'Sent', icon: Icons.send_rounded),
          PillarSubView(id: 'archive', label: 'Archive', icon: Icons.archive_rounded),
        ];
      case QuantPillar.calendar:
        return const [
          PillarSubView(id: 'agenda', label: 'Agenda', icon: Icons.view_agenda_rounded),
          PillarSubView(id: 'month', label: 'Month', icon: Icons.calendar_month_rounded),
          PillarSubView(id: 'booking', label: 'Booking', icon: Icons.event_available_rounded),
          PillarSubView(id: 'quantmeet', label: 'QuantMeet', icon: Icons.videocam_rounded),
          PillarSubView(id: 'reminders', label: 'Reminders', icon: Icons.notifications_active_rounded),
        ];
      case QuantPillar.drive:
        return const [
          PillarSubView(id: 'my_files', label: 'My Files', icon: Icons.folder_rounded),
          PillarSubView(id: 'shared', label: 'Shared', icon: Icons.folder_shared_rounded),
          PillarSubView(id: 'vault', label: 'Vault (E2EE)', icon: Icons.lock_rounded),
          PillarSubView(id: 'starred', label: 'Starred', icon: Icons.star_rounded),
          PillarSubView(id: 'cleaner', label: 'Cleaner', icon: Icons.cleaning_services_rounded),
        ];
      case QuantPillar.contacts:
        return const [
          PillarSubView(id: 'contacts', label: 'Contacts', icon: Icons.contacts_rounded),
          PillarSubView(id: 'vips', label: 'VIPs', icon: Icons.workspace_premium_rounded),
          PillarSubView(id: 'companies', label: 'Companies', icon: Icons.business_rounded),
          PillarSubView(id: 'ai_dedup', label: 'AI Dedup', icon: Icons.auto_fix_high_rounded),
          PillarSubView(id: 'circles', label: 'Circles', icon: Icons.supervised_user_circle_rounded),
        ];
      case QuantPillar.quantGit:
        return const [
          PillarSubView(id: 'repos', label: 'Repos', icon: Icons.source_rounded),
          PillarSubView(id: 'prs', label: 'PRs', icon: Icons.merge_type_rounded),
          PillarSubView(id: 'issues', label: 'Issues', icon: Icons.task_alt_rounded),
          PillarSubView(id: 'actions', label: 'Actions', icon: Icons.bolt_rounded),
          PillarSubView(id: 'copilot', label: 'Copilot', icon: Icons.smart_toy_rounded),
        ];
    }
  }
}

/// Metadata model for context-specific navigation items within each pillar
class PillarSubView {
  final String id;
  final String label;
  final IconData icon;

  const PillarSubView({
    required this.id,
    required this.label,
    required this.icon,
  });
}
