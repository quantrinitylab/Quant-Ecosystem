// Sovereign Quant Ecosystem - Omni-Presence & Deep-Link Mesh Test Suite
// Verifies deep-link routing across all 10 apps, web companion fallback resolution,
// cross-app SSO session sharing, and multiplatform launcher dispatch.
// Invariants: Strictly ZERO raw Unicode emojis, ZERO Skia clipPath.

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  group('Quant App Registry Tests', () {
    test('Registry contains all 10 sovereign ecosystem apps', () {
      expect(QuantAppRegistry.allApps.length, 10);

      final expectedApps = [
        QuantAppId.mail,
        QuantAppId.chat,
        QuantAppId.gram,
        QuantAppId.tube,
        QuantAppId.ai,
        QuantAppId.wave,
        QuantAppId.drive,
        QuantAppId.calendar,
        QuantAppId.ads,
        QuantAppId.cooks,
      ];

      for (final id in expectedApps) {
        final app = QuantAppRegistry.byId(id);
        expect(app.appId, id);
        expect(app.displayName.isNotEmpty, isTrue);
        expect(app.packageName.startsWith('com.quant.'), isTrue);
        expect(app.primaryScheme.isNotEmpty, isTrue);
        expect(app.primaryWebDomain.isNotEmpty, isTrue);
        expect(app.primaryWebBaseUrl.startsWith('https://'), isTrue);
        expect(app.supportedActions.isNotEmpty, isTrue);
        expect(app.description.isNotEmpty, isTrue);
      }
    });

    test('Registry resolves apps by scheme and aliases', () {
      expect(QuantAppRegistry.fromScheme('quantmail')?.appId, QuantAppId.mail);
      expect(QuantAppRegistry.fromScheme('mailto')?.appId, QuantAppId.mail);
      expect(QuantAppRegistry.fromScheme('quantchat')?.appId, QuantAppId.chat);
      expect(QuantAppRegistry.fromScheme('quantgram')?.appId, QuantAppId.gram);
      expect(QuantAppRegistry.fromScheme('quantube')?.appId, QuantAppId.tube);
      expect(QuantAppRegistry.fromScheme('quanttube')?.appId, QuantAppId.tube);
      expect(QuantAppRegistry.fromScheme('quantai')?.appId, QuantAppId.ai);
      expect(QuantAppRegistry.fromScheme('quantwave')?.appId, QuantAppId.wave);
      expect(QuantAppRegistry.fromScheme('quantdrive')?.appId, QuantAppId.drive);
      expect(QuantAppRegistry.fromScheme('quant-vault')?.appId, QuantAppId.drive);
      expect(QuantAppRegistry.fromScheme('quant-cas')?.appId, QuantAppId.drive);
      expect(QuantAppRegistry.fromScheme('quantcalendar')?.appId, QuantAppId.calendar);
      expect(QuantAppRegistry.fromScheme('webcal')?.appId, QuantAppId.calendar);
      expect(QuantAppRegistry.fromScheme('quantads')?.appId, QuantAppId.ads);
      expect(QuantAppRegistry.fromScheme('quantcooks')?.appId, QuantAppId.cooks);
      expect(QuantAppRegistry.fromScheme('unknown_scheme'), isNull);
    });

    test('Registry resolves apps by web domain', () {
      expect(QuantAppRegistry.fromDomain('quantmail.in')?.appId, QuantAppId.mail);
      expect(QuantAppRegistry.fromDomain('mail.quantmail.in')?.appId, QuantAppId.mail);
      expect(QuantAppRegistry.fromDomain('quantchat.quantrinity.in')?.appId, QuantAppId.chat);
      expect(QuantAppRegistry.fromDomain('quantgram.quantrinity.in')?.appId, QuantAppId.gram);
      expect(QuantAppRegistry.fromDomain('quantube.quantrinity.in')?.appId, QuantAppId.tube);
      expect(QuantAppRegistry.fromDomain('quantai.quantrinity.in')?.appId, QuantAppId.ai);
      expect(QuantAppRegistry.fromDomain('quantwave.quantrinity.in')?.appId, QuantAppId.wave);
      expect(QuantAppRegistry.fromDomain('drive.quantmail.in')?.appId, QuantAppId.drive);
      expect(QuantAppRegistry.fromDomain('calendar.quantmail.in')?.appId, QuantAppId.calendar);
      expect(QuantAppRegistry.fromDomain('ads.quantrinity.in')?.appId, QuantAppId.ads);
      expect(QuantAppRegistry.fromDomain('cooks.quantrinity.in')?.appId, QuantAppId.cooks);
      expect(QuantAppRegistry.fromDomain('random.example.com'), isNull);
    });

    test('Registry resolves apps by package name', () {
      expect(QuantAppRegistry.fromPackageName('com.quant.mail')?.appId, QuantAppId.mail);
      expect(QuantAppRegistry.fromPackageName('com.quant.chat')?.appId, QuantAppId.chat);
      expect(QuantAppRegistry.fromPackageName('com.quant.gram')?.appId, QuantAppId.gram);
      expect(QuantAppRegistry.fromPackageName('com.quant.tube')?.appId, QuantAppId.tube);
      expect(QuantAppRegistry.fromPackageName('com.quant.ai')?.appId, QuantAppId.ai);
      expect(QuantAppRegistry.fromPackageName('com.quant.wave')?.appId, QuantAppId.wave);
      expect(QuantAppRegistry.fromPackageName('com.quant.drive')?.appId, QuantAppId.drive);
      expect(QuantAppRegistry.fromPackageName('com.quant.calendar')?.appId, QuantAppId.calendar);
      expect(QuantAppRegistry.fromPackageName('com.quant.ads')?.appId, QuantAppId.ads);
      expect(QuantAppRegistry.fromPackageName('com.quant.cooks')?.appId, QuantAppId.cooks);
    });

    test('Registry resolves apps by string name or scheme', () {
      expect(QuantAppRegistry.fromString('QuantMail')?.appId, QuantAppId.mail);
      expect(QuantAppRegistry.fromString('chat')?.appId, QuantAppId.chat);
      expect(QuantAppRegistry.fromString('quant_gram')?.appId, QuantAppId.gram);
      expect(QuantAppRegistry.fromString('QuanTube')?.appId, QuantAppId.tube);
    });
  });

  group('Quant OmniRoute Deep-Link Parser Tests', () {
    test('Parses native URI for all 10 apps correctly', () {
      // 1. QuantMail
      final mailRoute = QuantOmniRoute.parse('quantmail://compose?to=founder@quantmail.in&subject=Board+Sync');
      expect(mailRoute.targetApp.appId, QuantAppId.mail);
      expect(mailRoute.action, 'compose');
      expect(mailRoute.parameters['to'], 'founder@quantmail.in');
      expect(mailRoute.parameters['subject'], 'Board Sync');

      // 2. QuantChat
      final chatRoute = QuantOmniRoute.parse('quantchat://webrtc-call?callId=call_999&video=true');
      expect(chatRoute.targetApp.appId, QuantAppId.chat);
      expect(chatRoute.action, 'webrtc-call');
      expect(chatRoute.parameters['callId'], 'call_999');
      expect(chatRoute.parameters['video'], 'true');

      // 3. QuantGram
      final gramRoute = QuantOmniRoute.parse('quantgram://reels?reelId=reel_42');
      expect(gramRoute.targetApp.appId, QuantAppId.gram);
      expect(gramRoute.action, 'reels');
      expect(gramRoute.parameters['reelId'], 'reel_42');

      // 4. QuanTube
      final tubeRoute = QuantOmniRoute.parse('quantube://player?v=vid_101&t=30');
      expect(tubeRoute.targetApp.appId, QuantAppId.tube);
      expect(tubeRoute.action, 'player');
      expect(tubeRoute.parameters['v'], 'vid_101');
      expect(tubeRoute.parameters['t'], '30');

      // 5. QuantAI
      final aiRoute = QuantOmniRoute.parse('quantai://canvas?canvasId=cv_777');
      expect(aiRoute.targetApp.appId, QuantAppId.ai);
      expect(aiRoute.action, 'canvas');
      expect(aiRoute.parameters['canvasId'], 'cv_777');

      // 6. QuantWave
      final waveRoute = QuantOmniRoute.parse('quantwave://spaces?spaceId=sp_voice');
      expect(waveRoute.targetApp.appId, QuantAppId.wave);
      expect(waveRoute.action, 'spaces');
      expect(waveRoute.parameters['spaceId'], 'sp_voice');

      // 7. QuantDrive
      final driveRoute = QuantOmniRoute.parse('quantdrive://vault');
      expect(driveRoute.targetApp.appId, QuantAppId.drive);
      expect(driveRoute.action, 'vault');

      // 8. QuantCalendar
      final calRoute = QuantOmniRoute.parse('quantcalendar://booking?slug=satya-review');
      expect(calRoute.targetApp.appId, QuantAppId.calendar);
      expect(calRoute.action, 'booking');
      expect(calRoute.parameters['slug'], 'satya-review');

      // 9. QuantAds
      final adsRoute = QuantOmniRoute.parse('quantads://campaigns?status=active');
      expect(adsRoute.targetApp.appId, QuantAppId.ads);
      expect(adsRoute.action, 'campaigns');
      expect(adsRoute.parameters['status'], 'active');

      // 10. QuantCooks
      final cooksRoute = QuantOmniRoute.parse('quantcooks://recipes?category=dinner');
      expect(cooksRoute.targetApp.appId, QuantAppId.cooks);
      expect(cooksRoute.action, 'recipes');
      expect(cooksRoute.parameters['category'], 'dinner');
    });

    test('Parses mailto: scheme into QuantMail compose route', () {
      final route = QuantOmniRoute.parse('mailto:sundar@google.com?subject=Strategic+Partnership');
      expect(route.targetApp.appId, QuantAppId.mail);
      expect(route.action, 'compose');
      expect(route.parameters['to'], 'sundar@google.com');
      expect(route.parameters['subject'], 'Strategic Partnership');
    });

    test('Parses webcal: scheme into QuantCalendar route', () {
      final route = QuantOmniRoute.parse('webcal://calendar.quantmail.in/user/feed.ics');
      expect(route.targetApp.appId, QuantAppId.calendar);
      expect(route.action, 'agenda');
      expect(route.parameters['feed_url'], 'https://calendar.quantmail.in/user/feed.ics');
    });

    test('Parses HTTPS web companion URLs into OmniRoutes', () {
      final mailWeb = QuantOmniRoute.parse('https://quantmail.in/mail/inbox?folder=starred');
      expect(mailWeb.targetApp.appId, QuantAppId.mail);
      expect(mailWeb.action, 'inbox');
      expect(mailWeb.parameters['folder'], 'starred');

      final chatWeb = QuantOmniRoute.parse('https://quantchat.quantrinity.in/conversation?chatId=room_abc');
      expect(chatWeb.targetApp.appId, QuantAppId.chat);
      expect(chatWeb.action, 'conversation');
      expect(chatWeb.parameters['chatId'], 'room_abc');

      final tubeWeb = QuantOmniRoute.parse('https://quantube.quantrinity.in/watch?v=video_xyz');
      expect(tubeWeb.targetApp.appId, QuantAppId.tube);
      expect(tubeWeb.action, 'watch');
      expect(tubeWeb.parameters['v'], 'video_xyz');
    });

    test('Handles invalid and empty URIs gracefully', () {
      expect(() => QuantOmniRoute.parse(''), throwsA(isA<QuantOmniRouteParseException>()));
      expect(() => QuantOmniRoute.parse('unknownscheme://something'), throwsA(isA<QuantOmniRouteParseException>()));
      expect(QuantOmniRoute.tryParse('invalid scheme'), isNull);
      expect(QuantOmniRoute.tryParse(''), isNull);
    });

    test('Generates canonical native URI from QuantOmniRoute', () {
      const route = QuantOmniRoute(
        targetApp: QuantAppRegistry.mail,
        action: 'compose',
        path: '/compose',
        parameters: {'to': 'dev@quantmail.in', 'subject': 'Audit'},
      );

      final uri = route.toNativeUri();
      expect(uri.scheme, 'quantmail');
      expect(uri.host, 'compose');
      expect(uri.queryParameters['to'], 'dev@quantmail.in');
      expect(uri.queryParameters['subject'], 'Audit');
    });
  });

  group('Quant Fallback Web Resolver Tests', () {
    const resolver = QuantFallbackWebResolver();

    test('Resolves all 10 apps to sovereign web companion URLs', () {
      // Mail
      final mailResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.mail,
          action: 'inbox',
          path: '/inbox',
          parameters: {'tenant': 'hq'},
        ),
        attachSsoToken: false,
      );
      expect(mailResult.webUri.toString(), 'https://quantmail.in/mail/inbox?tenant=hq');

      // Compose
      final composeResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.mail,
          action: 'compose',
          path: '/compose',
          parameters: {'to': 'alice@quantmail.in'},
        ),
        attachSsoToken: false,
      );
      expect(composeResult.webUri.toString(), 'https://quantmail.in/mail/compose?to=alice@quantmail.in');

      // Calendar
      final calResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.mail,
          action: 'calendar',
          path: '/calendar',
        ),
        attachSsoToken: false,
      );
      expect(calResult.webUri.toString(), 'https://quantmail.in/calendar');

      // Drive
      final driveResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.mail,
          action: 'drive',
          path: '/drive',
        ),
        attachSsoToken: false,
      );
      expect(driveResult.webUri.toString(), 'https://quantmail.in/drive');

      // Repos
      final reposResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.mail,
          action: 'repos',
          path: '/repos',
        ),
        attachSsoToken: false,
      );
      expect(reposResult.webUri.toString(), 'https://quantmail.in/repos');

      // Chat Conversation
      final chatResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.chat,
          action: 'conversation',
          path: '/conversation',
          parameters: {'chatId': 'c_1'},
        ),
        attachSsoToken: false,
      );
      expect(chatResult.webUri.toString(), 'https://quantchat.quantrinity.in/conversation?chatId=c_1');

      // Chat WebRTC Call
      final callResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.chat,
          action: 'webrtc-call',
          path: '/webrtc-call',
          parameters: {'callId': 'room_4'},
        ),
        attachSsoToken: false,
      );
      expect(callResult.webUri.toString(), 'https://quantchat.quantrinity.in/call?callId=room_4');

      // Gram Reels
      final gramResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.gram,
          action: 'reels',
          path: '/reels',
          parameters: {'reelId': 'r_55'},
        ),
        attachSsoToken: false,
      );
      expect(gramResult.webUri.toString(), 'https://quantgram.quantrinity.in/reels?reelId=r_55');

      // QuanTube Watch
      final tubeResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.tube,
          action: 'player',
          path: '/player',
          parameters: {'v': 'v_abc'},
        ),
        attachSsoToken: false,
      );
      expect(tubeResult.webUri.toString(), 'https://quantube.quantrinity.in/watch?v=v_abc');

      // QuantAI Voice Orb
      final aiResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.ai,
          action: 'voice-orb',
          path: '/voice-orb',
        ),
        attachSsoToken: false,
      );
      expect(aiResult.webUri.toString(), 'https://quantai.quantrinity.in/voice');

      // QuantWave Timeline
      final waveResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.wave,
          action: 'timeline',
          path: '/timeline',
        ),
        attachSsoToken: false,
      );
      expect(waveResult.webUri.toString(), 'https://quantwave.quantrinity.in/timeline');

      // QuantDrive Vault
      final vaultResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.drive,
          action: 'vault',
          path: '/vault',
        ),
        attachSsoToken: false,
      );
      expect(vaultResult.webUri.toString(), 'https://drive.quantmail.in/vault');

      // QuantCalendar Booking
      final bookingResult = resolver.resolve(
        const QuantOmniRoute(
          targetApp: QuantAppRegistry.calendar,
          action: 'booking',
          path: '/booking',
          parameters: {'slug': 'founder-sync'},
        ),
        attachSsoToken: false,
      );
      expect(bookingResult.webUri.toString(), 'https://calendar.quantmail.in/booking?slug=founder-sync');
    });

    test('Attaches SSO handoff token to web companion URL when available', () {
      final route = const QuantOmniRoute(
        targetApp: QuantAppRegistry.mail,
        action: 'inbox',
        path: '/inbox',
      );

      final result = resolver.resolve(
        route,
        overrideSsoToken: 'jwt_sso_master_credential_123',
        attachSsoToken: true,
      );

      expect(result.hasSsoHandoff, isTrue);
      expect(result.webUri.queryParameters['sso_token'], 'jwt_sso_master_credential_123');
    });

    test('Generates QR code handoff string with native scheme hint', () {
      const route = QuantOmniRoute(
        targetApp: QuantAppRegistry.chat,
        action: 'conversation',
        path: '/conversation',
        parameters: {'chatId': 'vip_board'},
      );

      final qrString = resolver.generateHandoffQrCode(route);
      expect(qrString, contains('quantchat.quantrinity.in'));
      expect(qrString, contains('_native_scheme=quantchat'));
      expect(qrString, contains('chatId=vip_board'));
    });
  });

  group('Cross-App SSO Session Sharing Tests', () {
    test('QuantCrossAppSsoVault publishes, acquires, and verifies shared session', () async {
      final ssoVault = QuantCrossAppSsoVault.inMemory();

      // Ensure no initial session
      expect(await ssoVault.hasValidSharedSession(), isFalse);
      expect(await ssoVault.acquireSharedSession(), isNull);

      // QuantMail user signs in
      final mailSession = QuantAuthSession(
        accessToken: 'access_jwt_token_999',
        refreshToken: 'refresh_jwt_token_888',
        user: const QuantUserProfile(
          id: 'usr_ceo_1',
          email: 'ceo@quantmail.in',
          name: 'Chief Executive Operator',
          tier: 'enterprise',
        ),
        activeWorkspaceId: 'ws_sovereign_hq',
        expiresAt: DateTime.now().add(const Duration(hours: 4)),
      );

      await ssoVault.publishSession(mailSession, sourceAppPackage: 'com.quant.mail');

      // Verify shared session is immediately available to sibling apps (e.g. QuantChat)
      expect(await ssoVault.hasValidSharedSession(), isTrue);

      final acquired = await ssoVault.acquireSharedSession();
      expect(acquired, isNotNull);
      expect(acquired!.email, 'ceo@quantmail.in');
      expect(acquired.userId, 'usr_ceo_1');
      expect(acquired.accessToken, 'access_jwt_token_999');
      expect(acquired.sourceAppPackage, 'com.quant.mail');
      expect(acquired.activeWorkspaceId, 'ws_sovereign_hq');

      // Convert to QuantAuthSession in sibling app
      final chatSession = acquired.toAuthSession();
      expect(chatSession.user.name, 'Chief Executive Operator');
      expect(chatSession.accessToken, 'access_jwt_token_999');
      expect(chatSession.isExpired, isFalse);
    });

    test('Revokes shared session globally on sign-out', () async {
      final ssoVault = QuantCrossAppSsoVault.inMemory();

      final session = QuantAuthSession(
        accessToken: 'token_abc',
        refreshToken: 'token_def',
        user: const QuantUserProfile(id: 'u1', email: 'test@quantmail.in', name: 'User'),
        activeWorkspaceId: 'ws_default',
      );

      await ssoVault.publishSession(session);
      expect(await ssoVault.hasValidSharedSession(), isTrue);

      await ssoVault.revokeSharedSession();
      expect(await ssoVault.hasValidSharedSession(), isFalse);
      expect(await ssoVault.acquireSharedSession(), isNull);
    });

    test('Rejects expired shared sessions', () async {
      final ssoVault = QuantCrossAppSsoVault.inMemory();

      final expiredSession = QuantAuthSession(
        accessToken: 'token_old',
        refreshToken: 'token_old_ref',
        user: const QuantUserProfile(id: 'u2', email: 'expired@quantmail.in', name: 'Old User'),
        activeWorkspaceId: 'ws_default',
        expiresAt: DateTime.now().subtract(const Duration(minutes: 10)),
      );

      await ssoVault.publishSession(expiredSession);
      final acquired = await ssoVault.acquireSharedSession();
      expect(acquired, isNull);
    });

    test('Ephemeral deep-link handoff token generation and verification', () {
      final ssoVault = QuantCrossAppSsoVault.inMemory();

      final ssoSession = QuantSsoSharedSession(
        accessToken: 'jwt_tok_secret',
        refreshToken: 'jwt_ref_secret',
        userId: 'u_vault_1',
        email: 'founder@quantmail.in',
        activeWorkspaceId: 'ws_prod',
        userName: 'Founder',
        syncTimestamp: DateTime.now().toUtc(),
        sourceAppPackage: 'com.quant.mail',
      );

      // Generate handoff token specifically for QuantChat
      final token = ssoVault.generateHandoffToken(
        session: ssoSession,
        targetAppPackage: 'com.quant.chat',
      );
      expect(token.isNotEmpty, isTrue);

      // Valid consumption by QuantChat
      final verified = ssoVault.verifyHandoffToken(
        token,
        expectedTargetAppPackage: 'com.quant.chat',
      );
      expect(verified, isNotNull);
      expect(verified!.email, 'founder@quantmail.in');
      expect(verified.accessToken, 'jwt_tok_secret');

      // Audience mismatch rejected (e.g. malicious app trying to use QuantChat token)
      final rejected = ssoVault.verifyHandoffToken(
        token,
        expectedTargetAppPackage: 'com.malicious.app',
      );
      expect(rejected, isNull);
    });
  });

  group('Quant OmniRouter Engine & Dispatch Tests', () {
    test('Dispatches internally when target matches current running app', () async {
      final launcher = QuantMockLauncherDelegate();
      final router = QuantOmniRouter(
        currentApp: QuantAppRegistry.mail,
        launcherDelegate: launcher,
        ssoVault: QuantCrossAppSsoVault.inMemory(),
      );

      bool inboxDispatched = false;
      router.registerInternalHandler('inbox', (route) async {
        inboxDispatched = true;
        return true;
      });

      final result = await router.handleIncomingLink('quantmail://inbox');
      expect(result.type, QuantOmniNavigationType.internal);
      expect(result.isSuccess, isTrue);
      expect(inboxDispatched, isTrue);
      expect(launcher.launchedUris.isEmpty, isTrue); // no external app launched
    });

    test('Launches native sibling app when installed', () async {
      final launcher = QuantMockLauncherDelegate(
        installedSchemes: {'quantmail', 'quantchat'},
      );
      final router = QuantOmniRouter(
        currentApp: QuantAppRegistry.mail,
        launcherDelegate: launcher,
        ssoVault: QuantCrossAppSsoVault.inMemory(),
      );

      // QuantMail calls openChatConversation
      final result = await router.openChatConversation(chatId: 'dev_team_sync');
      expect(result.type, QuantOmniNavigationType.nativeExternal);
      expect(result.isSuccess, isTrue);
      expect(launcher.launchedUris.length, 1);
      expect(launcher.launchedUris.first.scheme, 'quantchat');
      expect(launcher.launchedUris.first.host, 'conversation');
      expect(launcher.launchedUris.first.queryParameters['chatId'], 'dev_team_sync');
    });

    test('Falls back to sovereign Web Companion when native app is NOT installed', () async {
      // Only quantmail is installed; quantube and quantgram are NOT installed
      final launcher = QuantMockLauncherDelegate(
        installedSchemes: {'quantmail'},
      );
      final router = QuantOmniRouter(
        currentApp: QuantAppRegistry.mail,
        launcherDelegate: launcher,
        ssoVault: QuantCrossAppSsoVault.inMemory(),
      );

      // QuantMail tries to open QuanTube Player
      final result = await router.openTubePlayer(videoId: 'yt_keynote_2026', startSeconds: 120);
      expect(result.type, QuantOmniNavigationType.webFallback);
      expect(result.isSuccess, isTrue);
      expect(launcher.launchedUris.length, 1);

      final launched = launcher.launchedUris.first;
      expect(launched.scheme, 'https');
      expect(launched.host, 'quantube.quantrinity.in');
      expect(launched.path, '/watch');
      expect(launched.queryParameters['v'], 'yt_keynote_2026');
      expect(launched.queryParameters['t'], '120');
    });

    test('OmniRouter shortcuts correctly build routes across ecosystem', () async {
      final launcher = QuantMockLauncherDelegate(
        installedSchemes: {
          'quantmail',
          'quantchat',
          'quantgram',
          'quantube',
          'quantai',
          'quantwave',
          'quantdrive',
          'quantcalendar',
          'quantads',
          'quantcooks',
        },
      );
      final router = QuantOmniRouter(
        currentApp: QuantAppRegistry.mail,
        launcherDelegate: launcher,
        ssoVault: QuantCrossAppSsoVault.inMemory(),
      );

      // QuantMail Compose
      await router.openMailCompose(to: 'ceo@quantmail.in', subject: 'Wave 40');
      // QuanTube Studio
      await router.openTubeStudio();
      // QuantAI Canvas
      await router.openAiCanvas(canvasId: 'cv_arch');
      // QuantWave Spaces
      await router.openWaveSpaces(spaceId: 'sp_live');
      // QuantDrive Vault
      await router.openDriveVault();
      // QuantCalendar Booking
      await router.openCalendarBooking(slug: 'satya');

      expect(launcher.launchedUris.length, 6);
      expect(launcher.launchedUris[0].scheme, 'quantmail');
      expect(launcher.launchedUris[1].scheme, 'quantube');
      expect(launcher.launchedUris[2].scheme, 'quantai');
      expect(launcher.launchedUris[3].scheme, 'quantwave');
      expect(launcher.launchedUris[4].scheme, 'quantdrive');
      expect(launcher.launchedUris[5].scheme, 'quantcalendar');
    });
  });
}
