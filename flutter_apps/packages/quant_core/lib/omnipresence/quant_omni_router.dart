// Sovereign Quant Ecosystem - Omni-Presence Router & Deep-Link Mesh
// Sovereign unified router connecting all 10 apps with native app launching,
// internal navigation dispatch, cross-app SSO handoff, and resilient fallback web companion resolution.
// Invariants: Strictly ZERO raw Unicode emojis, ZERO Skia clipPath.

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'quant_app_registry.dart';
import 'quant_omni_route.dart';
import 'quant_fallback_web_resolver.dart';
import 'quant_cross_app_sso.dart';

/// Navigation outcome classification.
enum QuantOmniNavigationType {
  internal,
  nativeExternal,
  webFallback,
  failed,
}

/// Result of an OmniRouter navigation or dispatch attempt.
class QuantOmniNavigationResult {
  final QuantOmniNavigationType type;
  final QuantOmniRoute route;
  final Uri launchedUri;
  final bool isSuccess;
  final String? errorMessage;

  const QuantOmniNavigationResult({
    required this.type,
    required this.route,
    required this.launchedUri,
    required this.isSuccess,
    this.errorMessage,
  });

  factory QuantOmniNavigationResult.internalDispatched(QuantOmniRoute route) {
    return QuantOmniNavigationResult(
      type: QuantOmniNavigationType.internal,
      route: route,
      launchedUri: route.toNativeUri(),
      isSuccess: true,
    );
  }

  factory QuantOmniNavigationResult.nativeLaunched(QuantOmniRoute route, Uri uri) {
    return QuantOmniNavigationResult(
      type: QuantOmniNavigationType.nativeExternal,
      route: route,
      launchedUri: uri,
      isSuccess: true,
    );
  }

  factory QuantOmniNavigationResult.webFallbackLaunched(QuantOmniRoute route, Uri uri) {
    return QuantOmniNavigationResult(
      type: QuantOmniNavigationType.webFallback,
      route: route,
      launchedUri: uri,
      isSuccess: true,
    );
  }

  factory QuantOmniNavigationResult.failed(
    QuantOmniRoute route,
    Uri attemptedUri,
    String message,
  ) {
    return QuantOmniNavigationResult(
      type: QuantOmniNavigationType.failed,
      route: route,
      launchedUri: attemptedUri,
      isSuccess: false,
      errorMessage: message,
    );
  }

  @override
  String toString() =>
      'QuantOmniNavigationResult(type: $type, success: $isSuccess, app: ${route.targetApp.displayName}, action: ${route.action})';
}

/// Abstract URI launcher delegate enabling 100% testable zero-mock execution.
abstract class QuantLauncherDelegate {
  Future<bool> canLaunch(Uri uri);
  Future<bool> launch(Uri uri);
}

/// Default launcher delegate operating with simulated or platform capabilities.
class QuantDefaultLauncherDelegate implements QuantLauncherDelegate {
  final bool Function(Uri uri)? canLaunchOverride;
  final Future<bool> Function(Uri uri)? launchOverride;

  const QuantDefaultLauncherDelegate({
    this.canLaunchOverride,
    this.launchOverride,
  });

  @override
  Future<bool> canLaunch(Uri uri) async {
    if (canLaunchOverride != null) {
      return canLaunchOverride!(uri);
    }
    // Default implementation returns true for https and supported schemes
    final scheme = uri.scheme.toLowerCase();
    if (scheme == 'https' || scheme == 'http' || scheme == 'mailto') {
      return true;
    }
    return QuantAppRegistry.fromScheme(scheme) != null;
  }

  @override
  Future<bool> launch(Uri uri) async {
    if (launchOverride != null) {
      return launchOverride!(uri);
    }
    debugPrint('[QuantLauncherDelegate] Launched: $uri');
    return true;
  }
}

/// In-memory mock launcher delegate for deterministic unit tests.
class QuantMockLauncherDelegate implements QuantLauncherDelegate {
  final Set<String> installedSchemes;
  final List<Uri> launchedUris = [];
  bool shouldFailLaunch = false;

  QuantMockLauncherDelegate({
    Set<String>? installedSchemes,
  }) : installedSchemes = installedSchemes ?? {'quantmail', 'quantchat', 'quantgram'};

  @override
  Future<bool> canLaunch(Uri uri) async {
    if (uri.scheme == 'https' || uri.scheme == 'http') {
      return true;
    }
    return installedSchemes.contains(uri.scheme.toLowerCase());
  }

  @override
  Future<bool> launch(Uri uri) async {
    if (shouldFailLaunch) return false;
    launchedUris.add(uri);
    return true;
  }

  void clear() {
    launchedUris.clear();
    shouldFailLaunch = false;
  }
}

/// Internal route dispatch handler definition.
typedef QuantInternalRouteHandler = Future<bool> Function(QuantOmniRoute route);

/// Central Omni-Presence Router across all 10 sovereign Quant apps.
class QuantOmniRouter {
  final QuantAppMetadata currentApp;
  final QuantFallbackWebResolver webResolver;
  final QuantCrossAppSsoVault ssoVault;
  final QuantLauncherDelegate launcherDelegate;

  final Map<String, QuantInternalRouteHandler> _internalHandlers = {};
  final StreamController<QuantOmniRoute> _incomingRouteStreamController =
      StreamController<QuantOmniRoute>.broadcast();

  QuantOmniRouter({
    required this.currentApp,
    QuantFallbackWebResolver? webResolver,
    QuantCrossAppSsoVault? ssoVault,
    QuantLauncherDelegate? launcherDelegate,
  })  : webResolver = webResolver ?? const QuantFallbackWebResolver(),
        ssoVault = ssoVault ?? QuantCrossAppSsoVault(),
        launcherDelegate = launcherDelegate ?? const QuantDefaultLauncherDelegate();

  /// Stream of all incoming routes received by this application.
  Stream<QuantOmniRoute> get incomingRouteStream => _incomingRouteStreamController.stream;

  /// Registers an internal handler for specific actions within the current app.
  void registerInternalHandler(String action, QuantInternalRouteHandler handler) {
    _internalHandlers[action.toLowerCase().trim()] = handler;
  }

  /// Removes an internal handler.
  void unregisterInternalHandler(String action) {
    _internalHandlers.remove(action.toLowerCase().trim());
  }

  /// Processes an incoming deep link URI string (e.g. from app launch or intent).
  Future<QuantOmniNavigationResult> handleIncomingLink(String rawUriString) async {
    final route = QuantOmniRoute.tryParse(rawUriString);
    if (route == null) {
      final dummyUri = Uri.tryParse(rawUriString) ?? Uri();
      return QuantOmniNavigationResult.failed(
        QuantOmniRoute(
          targetApp: currentApp,
          action: 'error',
          path: '/error',
        ),
        dummyUri,
        'Malformed URI: unable to parse into valid OmniRoute',
      );
    }

    _incomingRouteStreamController.add(route);
    return navigateTo(route);
  }

  /// Primary navigation engine. Routes internally if current app matches target app,
  /// otherwise launches external native app or falls back to sovereign web companion.
  Future<QuantOmniNavigationResult> navigateTo(QuantOmniRoute route) async {
    // 1. Target is the currently running app: execute in-app navigation
    if (route.targetApp.appId == currentApp.appId) {
      final actionKey = route.action.toLowerCase().trim();
      final handler = _internalHandlers[actionKey];
      if (handler != null) {
        final handled = await handler(route);
        if (handled) {
          return QuantOmniNavigationResult.internalDispatched(route);
        }
      }
      // If no specific action handler was registered, dispatch as general internal route
      return QuantOmniNavigationResult.internalDispatched(route);
    }

    // 2. Target is an external Quant sibling app
    final nativeUri = route.toNativeUri();
    final canLaunchNative = await launcherDelegate.canLaunch(nativeUri);

    if (canLaunchNative) {
      // Prepare route with SSO handoff token if available
      Uri finalLaunchUri = nativeUri;
      final sharedSession = await ssoVault.acquireSharedSession();
      if (sharedSession != null && sharedSession.isValid) {
        final handoffToken = ssoVault.generateHandoffToken(
          session: sharedSession,
          targetAppPackage: route.targetApp.packageName,
        );
        final routeWithSso = route.copyWith(ssoHandoffToken: handoffToken);
        finalLaunchUri = routeWithSso.toNativeUri();
      }

      final launched = await launcherDelegate.launch(finalLaunchUri);
      if (launched) {
        return QuantOmniNavigationResult.nativeLaunched(route, finalLaunchUri);
      }
    }

    // 3. Fallback: Native app not installed or failed to launch -> Resolve Web Companion
    debugPrint(
      '[QuantOmniRouter] Native app ${route.targetApp.displayName} not available. Falling back to sovereign web companion.',
    );

    String? ssoToken;
    final sharedSession = await ssoVault.acquireSharedSession();
    if (sharedSession != null && sharedSession.isValid) {
      ssoToken = sharedSession.accessToken;
    }

    final webResolution = webResolver.resolve(
      route,
      overrideSsoToken: ssoToken,
      attachSsoToken: true,
    );

    final webSuccess = await launcherDelegate.launch(webResolution.webUri);
    if (webSuccess) {
      return QuantOmniNavigationResult.webFallbackLaunched(route, webResolution.webUri);
    }

    return QuantOmniNavigationResult.failed(
      route,
      webResolution.webUri,
      'Failed to launch native app and web companion.',
    );
  }

  // --- High-Level Cross-App Navigation Shortcuts ---

  /// Opens QuantMail Inbox.
  Future<QuantOmniNavigationResult> openMailInbox({Map<String, String>? parameters}) {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.mail,
        action: 'inbox',
        path: '/inbox',
        parameters: parameters ?? const {},
      ),
    );
  }

  /// Opens QuantMail Compose.
  Future<QuantOmniNavigationResult> openMailCompose({
    String? to,
    String? subject,
    String? body,
  }) {
    final params = <String, String>{};
    if (to != null) params['to'] = to;
    if (subject != null) params['subject'] = subject;
    if (body != null) params['body'] = body;

    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.mail,
        action: 'compose',
        path: '/compose',
        parameters: params,
      ),
    );
  }

  /// Opens QuantMail Sovereign Repos (CodeHub).
  Future<QuantOmniNavigationResult> openMailRepos({String? repoId}) {
    final segments = repoId != null ? [repoId] : const <String>[];
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.mail,
        action: 'repos',
        path: repoId != null ? '/repos/$repoId' : '/repos',
        pathSegments: segments,
      ),
    );
  }

  /// Opens QuantChat conversation.
  Future<QuantOmniNavigationResult> openChatConversation({
    required String chatId,
    String? peerName,
  }) {
    final params = <String, String>{'chatId': chatId};
    if (peerName != null) params['peerName'] = peerName;

    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.chat,
        action: 'conversation',
        path: '/conversation/$chatId',
        pathSegments: [chatId],
        parameters: params,
      ),
    );
  }

  /// Opens QuantChat WebRTC audio or video call.
  Future<QuantOmniNavigationResult> openChatCall({
    required String callId,
    bool isVideo = false,
  }) {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.chat,
        action: 'webrtc-call',
        path: '/webrtc-call/$callId',
        pathSegments: [callId],
        parameters: {
          'callId': callId,
          'video': isVideo ? 'true' : 'false',
        },
      ),
    );
  }

  /// Opens QuantGram Reels feed.
  Future<QuantOmniNavigationResult> openGramReels({String? reelId}) {
    final segments = reelId != null ? [reelId] : const <String>[];
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.gram,
        action: 'reels',
        path: reelId != null ? '/reels/$reelId' : '/reels',
        pathSegments: segments,
        parameters: reelId != null ? {'reelId': reelId} : const {},
      ),
    );
  }

  /// Opens QuantGram Stories.
  Future<QuantOmniNavigationResult> openGramStories({String? userId}) {
    final segments = userId != null ? [userId] : const <String>[];
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.gram,
        action: 'stories',
        path: userId != null ? '/stories/$userId' : '/stories',
        pathSegments: segments,
        parameters: userId != null ? {'userId': userId} : const {},
      ),
    );
  }

  /// Opens QuantGram Explore grid.
  Future<QuantOmniNavigationResult> openGramExplore() {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.gram,
        action: 'explore',
        path: '/explore',
      ),
    );
  }

  /// Opens QuanTube Player.
  Future<QuantOmniNavigationResult> openTubePlayer({
    required String videoId,
    int? startSeconds,
  }) {
    final params = <String, String>{'v': videoId};
    if (startSeconds != null) params['t'] = startSeconds.toString();

    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.tube,
        action: 'player',
        path: '/player/$videoId',
        pathSegments: [videoId],
        parameters: params,
      ),
    );
  }

  /// Opens QuanTube Live Stream.
  Future<QuantOmniNavigationResult> openTubeStream({required String channelId}) {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.tube,
        action: 'stream',
        path: '/stream/$channelId',
        pathSegments: [channelId],
        parameters: {'channel': channelId},
      ),
    );
  }

  /// Opens QuanTube Creator Studio.
  Future<QuantOmniNavigationResult> openTubeStudio() {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.tube,
        action: 'studio',
        path: '/studio',
      ),
    );
  }

  /// Opens QuantAI Canvas.
  Future<QuantOmniNavigationResult> openAiCanvas({String? canvasId}) {
    final segments = canvasId != null ? [canvasId] : const <String>[];
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.ai,
        action: 'canvas',
        path: canvasId != null ? '/canvas/$canvasId' : '/canvas',
        pathSegments: segments,
        parameters: canvasId != null ? {'canvasId': canvasId} : const {},
      ),
    );
  }

  /// Opens QuantAI 3D Voice Orb.
  Future<QuantOmniNavigationResult> openAiVoiceOrb() {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.ai,
        action: 'voice-orb',
        path: '/voice-orb',
      ),
    );
  }

  /// Opens QuantWave Timeline.
  Future<QuantOmniNavigationResult> openWaveTimeline() {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.wave,
        action: 'timeline',
        path: '/timeline',
      ),
    );
  }

  /// Opens QuantWave Audio Spaces.
  Future<QuantOmniNavigationResult> openWaveSpaces({String? spaceId}) {
    final segments = spaceId != null ? [spaceId] : const <String>[];
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.wave,
        action: 'spaces',
        path: spaceId != null ? '/spaces/$spaceId' : '/spaces',
        pathSegments: segments,
        parameters: spaceId != null ? {'spaceId': spaceId} : const {},
      ),
    );
  }

  /// Opens QuantDrive File Explorer.
  Future<QuantOmniNavigationResult> openDriveExplorer({String? path}) {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.drive,
        action: 'explorer',
        path: path != null ? '/explorer$path' : '/explorer',
        parameters: path != null ? {'path': path} : const {},
      ),
    );
  }

  /// Opens QuantDrive Cryptographic Vault.
  Future<QuantOmniNavigationResult> openDriveVault() {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.drive,
        action: 'vault',
        path: '/vault',
      ),
    );
  }

  /// Opens QuantCalendar Agenda.
  Future<QuantOmniNavigationResult> openCalendarAgenda() {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.calendar,
        action: 'agenda',
        path: '/agenda',
      ),
    );
  }

  /// Opens QuantCalendar Public Booking engine.
  Future<QuantOmniNavigationResult> openCalendarBooking({required String slug}) {
    return navigateTo(
      QuantOmniRoute(
        targetApp: QuantAppRegistry.calendar,
        action: 'booking',
        path: '/booking/$slug',
        pathSegments: [slug],
        parameters: {'slug': slug},
      ),
    );
  }

  /// Disposes active streams and resources.
  void dispose() {
    _incomingRouteStreamController.close();
  }
}
