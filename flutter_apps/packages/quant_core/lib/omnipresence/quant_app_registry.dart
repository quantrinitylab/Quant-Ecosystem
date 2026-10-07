// Sovereign Quant Ecosystem - Omni-Presence App Registry
// Defines metadata, deep-link schemes, web companion domains, and route capabilities across all 10 sovereign apps.
// Invariants: Strictly ZERO raw Unicode emojis, ZERO Skia clipPath.

import 'package:flutter/material.dart';

/// Identifier enum for all 10 sovereign Quant apps.
enum QuantAppId {
  mail,
  chat,
  gram,
  tube,
  ai,
  wave,
  drive,
  calendar,
  ads,
  cooks,
}

/// Rich metadata and capability descriptor for a Quant Ecosystem app.
class QuantAppMetadata {
  final QuantAppId appId;
  final String displayName;
  final String packageName;
  final String primaryScheme;
  final List<String> schemeAliases;
  final String primaryWebDomain;
  final List<String> webDomainAliases;
  final String primaryWebBaseUrl;
  final List<String> supportedActions;
  final IconData materialIcon;
  final String description;

  const QuantAppMetadata({
    required this.appId,
    required this.displayName,
    required this.packageName,
    required this.primaryScheme,
    this.schemeAliases = const [],
    required this.primaryWebDomain,
    this.webDomainAliases = const [],
    required this.primaryWebBaseUrl,
    required this.supportedActions,
    required this.materialIcon,
    required this.description,
  });

  /// All recognized schemes including primary and aliases.
  List<String> get allSchemes => [primaryScheme, ...schemeAliases];

  /// All recognized web domains including primary and aliases.
  List<String> get allWebDomains => [primaryWebDomain, ...webDomainAliases];

  /// Checks if a given URI scheme belongs to this app.
  bool matchesScheme(String scheme) {
    final normalized = scheme.toLowerCase().trim();
    return allSchemes.any((s) => s.toLowerCase() == normalized);
  }

  /// Checks if a given web host belongs to this app.
  bool matchesDomain(String host) {
    final normalized = host.toLowerCase().trim();
    return allWebDomains.any((d) => d.toLowerCase() == normalized);
  }

  /// Checks if a given action is supported by this app.
  bool supportsAction(String action) {
    final normalized = action.toLowerCase().trim();
    return supportedActions.any((a) => a.toLowerCase() == normalized);
  }

  Map<String, dynamic> toJson() {
    return {
      'appId': appId.name,
      'displayName': displayName,
      'packageName': packageName,
      'primaryScheme': primaryScheme,
      'schemeAliases': schemeAliases,
      'primaryWebDomain': primaryWebDomain,
      'webDomainAliases': webDomainAliases,
      'primaryWebBaseUrl': primaryWebBaseUrl,
      'supportedActions': supportedActions,
      'description': description,
    };
  }
}

/// Central registry of all 10 sovereign apps in the Quant Ecosystem.
class QuantAppRegistry {
  QuantAppRegistry._();

  static const QuantAppMetadata mail = QuantAppMetadata(
    appId: QuantAppId.mail,
    displayName: 'QuantMail',
    packageName: 'com.quant.mail',
    primaryScheme: 'quantmail',
    schemeAliases: ['mailto'],
    primaryWebDomain: 'quantmail.in',
    webDomainAliases: ['mail.quantmail.in', 'mail.quantrinity.in'],
    primaryWebBaseUrl: 'https://quantmail.in',
    supportedActions: [
      'inbox',
      'compose',
      'calendar',
      'drive',
      'repos',
      'message',
      'thread',
      'settings',
    ],
    materialIcon: Icons.mail_outline,
    description: 'Sovereign productivity suite unifying Mail, Calendar, Drive, and Repos.',
  );

  static const QuantAppMetadata chat = QuantAppMetadata(
    appId: QuantAppId.chat,
    displayName: 'QuantChat',
    packageName: 'com.quant.chat',
    primaryScheme: 'quantchat',
    schemeAliases: [],
    primaryWebDomain: 'quantchat.quantrinity.in',
    webDomainAliases: ['chat.quantmail.in', 'quantchat.in'],
    primaryWebBaseUrl: 'https://quantchat.quantrinity.in',
    supportedActions: [
      'conversation',
      'webrtc-call',
      'call',
      'contacts',
      'room',
      'settings',
    ],
    materialIcon: Icons.chat_bubble_outline,
    description: 'Sovereign instant messaging and HD WebRTC audio/video call mesh.',
  );

  static const QuantAppMetadata gram = QuantAppMetadata(
    appId: QuantAppId.gram,
    displayName: 'QuantGram',
    packageName: 'com.quant.gram',
    primaryScheme: 'quantgram',
    schemeAliases: [],
    primaryWebDomain: 'quantgram.quantrinity.in',
    webDomainAliases: ['gram.quantmail.in', 'quantgram.in'],
    primaryWebBaseUrl: 'https://quantgram.quantrinity.in',
    supportedActions: [
      'reels',
      'stories',
      'explore',
      'post',
      'profile',
      'direct',
    ],
    materialIcon: Icons.camera_alt_outlined,
    description: 'Sovereign short video reels, 24-hour disappearing stories, and creator media.',
  );

  static const QuantAppMetadata tube = QuantAppMetadata(
    appId: QuantAppId.tube,
    displayName: 'QuanTube',
    packageName: 'com.quant.tube',
    primaryScheme: 'quantube',
    schemeAliases: ['quanttube'],
    primaryWebDomain: 'quantube.quantrinity.in',
    webDomainAliases: ['tube.quantmail.in', 'quantube.in'],
    primaryWebBaseUrl: 'https://quantube.quantrinity.in',
    supportedActions: [
      'player',
      'watch',
      'stream',
      'studio',
      'channel',
      'history',
    ],
    materialIcon: Icons.play_circle_outline,
    description: 'Sovereign video streaming platform, live broadcaster, and creator studio.',
  );

  static const QuantAppMetadata ai = QuantAppMetadata(
    appId: QuantAppId.ai,
    displayName: 'QuantAI',
    packageName: 'com.quant.ai',
    primaryScheme: 'quantai',
    schemeAliases: [],
    primaryWebDomain: 'quantai.quantrinity.in',
    webDomainAliases: ['ai.quantmail.in', 'quantai.in'],
    primaryWebBaseUrl: 'https://quantai.quantrinity.in',
    supportedActions: [
      'canvas',
      'voice-orb',
      'chat',
      'agents',
      'models',
      'workflows',
    ],
    materialIcon: Icons.psychology_outlined,
    description: 'Sovereign Agent OS with infinite Canvas, 3D Voice Orb, and autonomous swarms.',
  );

  static const QuantAppMetadata wave = QuantAppMetadata(
    appId: QuantAppId.wave,
    displayName: 'QuantWave',
    packageName: 'com.quant.wave',
    primaryScheme: 'quantwave',
    schemeAliases: [],
    primaryWebDomain: 'quantwave.quantrinity.in',
    webDomainAliases: ['wave.quantmail.in', 'quantwave.in'],
    primaryWebBaseUrl: 'https://quantwave.quantrinity.in',
    supportedActions: [
      'timeline',
      'spaces',
      'post',
      'trending',
      'notifications',
    ],
    materialIcon: Icons.waves_outlined,
    description: 'Sovereign real-time conversational timeline, broadcast audio Spaces, and news feed.',
  );

  static const QuantAppMetadata drive = QuantAppMetadata(
    appId: QuantAppId.drive,
    displayName: 'QuantDrive',
    packageName: 'com.quant.drive',
    primaryScheme: 'quantdrive',
    schemeAliases: ['quant-vault', 'quant-cas'],
    primaryWebDomain: 'drive.quantmail.in',
    webDomainAliases: ['quantdrive.quantrinity.in'],
    primaryWebBaseUrl: 'https://drive.quantmail.in',
    supportedActions: [
      'explorer',
      'vault',
      'file',
      'folder',
      'shared',
      'trash',
    ],
    materialIcon: Icons.cloud_outlined,
    description: 'Sovereign content-addressed storage (CAS), cryptographic vault, and cloud drive.',
  );

  static const QuantAppMetadata calendar = QuantAppMetadata(
    appId: QuantAppId.calendar,
    displayName: 'QuantCalendar',
    packageName: 'com.quant.calendar',
    primaryScheme: 'quantcalendar',
    schemeAliases: ['webcal'],
    primaryWebDomain: 'calendar.quantmail.in',
    webDomainAliases: ['quantcalendar.quantrinity.in'],
    primaryWebBaseUrl: 'https://calendar.quantmail.in',
    supportedActions: [
      'agenda',
      'booking',
      'new-event',
      'event',
      'day',
      'month',
    ],
    materialIcon: Icons.calendar_month_outlined,
    description: 'Sovereign calendar engine with RFC 5545 recurrence and public slot booking.',
  );

  static const QuantAppMetadata ads = QuantAppMetadata(
    appId: QuantAppId.ads,
    displayName: 'QuantAds',
    packageName: 'com.quant.ads',
    primaryScheme: 'quantads',
    schemeAliases: [],
    primaryWebDomain: 'ads.quantrinity.in',
    webDomainAliases: ['quantads.quantmail.in'],
    primaryWebBaseUrl: 'https://ads.quantrinity.in',
    supportedActions: [
      'campaigns',
      'analytics',
      'creator-portal',
      'bidding',
      'billing',
    ],
    materialIcon: Icons.campaign_outlined,
    description: 'Sovereign privacy-first ad marketplace, creator monetization, and analytics portal.',
  );

  static const QuantAppMetadata cooks = QuantAppMetadata(
    appId: QuantAppId.cooks,
    displayName: 'QuantCooks',
    packageName: 'com.quant.cooks',
    primaryScheme: 'quantcooks',
    schemeAliases: [],
    primaryWebDomain: 'cooks.quantrinity.in',
    webDomainAliases: ['quantcooks.quantmail.in'],
    primaryWebBaseUrl: 'https://cooks.quantrinity.in',
    supportedActions: [
      'recipes',
      'pantry',
      'meal-planner',
      'grocery',
      'kitchen',
    ],
    materialIcon: Icons.restaurant_menu_outlined,
    description: 'Sovereign culinary knowledgebase, intelligent pantry management, and meal planner.',
  );

  /// All 10 apps in canonical order.
  static const List<QuantAppMetadata> allApps = [
    mail,
    chat,
    gram,
    tube,
    ai,
    wave,
    drive,
    calendar,
    ads,
    cooks,
  ];

  /// Find an app by its enum ID.
  static QuantAppMetadata byId(QuantAppId id) {
    switch (id) {
      case QuantAppId.mail:
        return mail;
      case QuantAppId.chat:
        return chat;
      case QuantAppId.gram:
        return gram;
      case QuantAppId.tube:
        return tube;
      case QuantAppId.ai:
        return ai;
      case QuantAppId.wave:
        return wave;
      case QuantAppId.drive:
        return drive;
      case QuantAppId.calendar:
        return calendar;
      case QuantAppId.ads:
        return ads;
      case QuantAppId.cooks:
        return cooks;
    }
  }

  /// Resolve an app from a custom URI scheme (e.g. "quantmail", "quantchat", "mailto", "quantube").
  static QuantAppMetadata? fromScheme(String scheme) {
    final clean = scheme.replaceAll(RegExp(r'[:/]+$'), '').toLowerCase().trim();
    for (final app in allApps) {
      if (app.matchesScheme(clean)) {
        return app;
      }
    }
    return null;
  }

  /// Resolve an app from a web host domain (e.g. "quantmail.in", "quantchat.quantrinity.in").
  static QuantAppMetadata? fromDomain(String host) {
    final clean = host.toLowerCase().trim();
    for (final app in allApps) {
      if (app.matchesDomain(clean)) {
        return app;
      }
    }
    return null;
  }

  /// Resolve an app from Android / iOS package / bundle ID.
  static QuantAppMetadata? fromPackageName(String packageName) {
    final clean = packageName.toLowerCase().trim();
    for (final app in allApps) {
      if (app.packageName.toLowerCase() == clean) {
        return app;
      }
    }
    return null;
  }

  /// Resolve an app from a generic string name or enum name.
  static QuantAppMetadata? fromString(String text) {
    final clean = text.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '').trim();
    for (final app in allApps) {
      final appNameClean = app.displayName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      final appIdClean = app.appId.name.toLowerCase();
      final schemeClean = app.primaryScheme.toLowerCase();
      if (clean == appNameClean || clean == appIdClean || clean == schemeClean) {
        return app;
      }
    }
    return null;
  }
}
