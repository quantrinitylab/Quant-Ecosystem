// Sovereign Quant Ecosystem - Fallback Web Resolver
// Seamlessly resolves sovereign deep links to cloud web companions when native applications are absent.
// Invariants: Strictly ZERO raw Unicode emojis, ZERO Skia clipPath.

import 'quant_app_registry.dart';
import 'quant_omni_route.dart';

/// Resolution result encapsulating the resolved web companion URI and metadata.
class QuantWebResolutionResult {
  final Uri webUri;
  final QuantAppMetadata targetApp;
  final String action;
  final bool hasSsoHandoff;
  final Map<String, String> queryParameters;

  const QuantWebResolutionResult({
    required this.webUri,
    required this.targetApp,
    required this.action,
    this.hasSsoHandoff = false,
    this.queryParameters = const {},
  });

  @override
  String toString() => 'QuantWebResolutionResult(app: ${targetApp.displayName}, webUri: $webUri)';
}

/// Fallback Web Resolver that maps any QuantOmniRoute to its sovereign web companion counterpart.
class QuantFallbackWebResolver {
  const QuantFallbackWebResolver();

  /// Resolves an OmniRoute into a sovereign web companion URI with full query parameter fidelity.
  QuantWebResolutionResult resolve(
    QuantOmniRoute route, {
    String? overrideSsoToken,
    bool attachSsoToken = true,
  }) {
    final app = route.targetApp;
    final action = route.action.toLowerCase().trim();
    final params = Map<String, String>.from(route.parameters);

    final ssoToken = overrideSsoToken ?? route.ssoHandoffToken;
    if (attachSsoToken && ssoToken != null && ssoToken.isNotEmpty) {
      params['sso_token'] = ssoToken;
    }

    final webPath = _mapActionToWebPath(app.appId, action, route.pathSegments);
    final baseUri = Uri.parse(app.primaryWebBaseUrl);

    final resolvedUri = Uri(
      scheme: baseUri.scheme,
      host: baseUri.host,
      port: baseUri.hasPort ? baseUri.port : null,
      path: webPath,
      queryParameters: params.isNotEmpty ? params : null,
      fragment: route.fragment,
    );

    return QuantWebResolutionResult(
      webUri: resolvedUri,
      targetApp: app,
      action: action,
      hasSsoHandoff: ssoToken != null && ssoToken.isNotEmpty,
      queryParameters: params,
    );
  }

  /// Maps an app ID and action to its canonical web companion route path.
  String _mapActionToWebPath(QuantAppId appId, String action, List<String> segments) {
    final subpath = segments.isNotEmpty ? '/${segments.join('/')}' : '';

    switch (appId) {
      case QuantAppId.mail:
        switch (action) {
          case 'inbox':
            return '/mail/inbox$subpath';
          case 'compose':
            return '/mail/compose$subpath';
          case 'calendar':
            return '/calendar$subpath';
          case 'drive':
            return '/drive$subpath';
          case 'repos':
            return '/repos$subpath';
          case 'settings':
            return '/settings$subpath';
          default:
            return '/mail/$action$subpath';
        }

      case QuantAppId.chat:
        switch (action) {
          case 'conversation':
            return '/conversation$subpath';
          case 'webrtc-call':
          case 'call':
            return '/call$subpath';
          case 'contacts':
            return '/contacts$subpath';
          case 'room':
            return '/room$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.gram:
        switch (action) {
          case 'reels':
            return '/reels$subpath';
          case 'stories':
            return '/stories$subpath';
          case 'explore':
            return '/explore$subpath';
          case 'post':
            return '/p$subpath';
          case 'profile':
            return '/u$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.tube:
        switch (action) {
          case 'player':
          case 'watch':
            return '/watch$subpath';
          case 'stream':
            return '/live$subpath';
          case 'studio':
            return '/studio$subpath';
          case 'channel':
            return '/c$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.ai:
        switch (action) {
          case 'canvas':
            return '/canvas$subpath';
          case 'voice-orb':
          case 'voice':
            return '/voice$subpath';
          case 'chat':
            return '/chat$subpath';
          case 'agents':
            return '/agents$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.wave:
        switch (action) {
          case 'timeline':
            return '/timeline$subpath';
          case 'spaces':
            return '/spaces$subpath';
          case 'trending':
            return '/trending$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.drive:
        switch (action) {
          case 'explorer':
            return '/explorer$subpath';
          case 'vault':
            return '/vault$subpath';
          case 'file':
            return '/f$subpath';
          case 'folder':
            return '/d$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.calendar:
        switch (action) {
          case 'agenda':
            return '/agenda$subpath';
          case 'booking':
            return '/booking$subpath';
          case 'new-event':
            return '/event/new$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.ads:
        switch (action) {
          case 'campaigns':
            return '/campaigns$subpath';
          case 'analytics':
            return '/analytics$subpath';
          case 'creator-portal':
            return '/creators$subpath';
          default:
            return '/$action$subpath';
        }

      case QuantAppId.cooks:
        switch (action) {
          case 'recipes':
            return '/recipes$subpath';
          case 'pantry':
            return '/pantry$subpath';
          case 'meal-planner':
            return '/planner$subpath';
          default:
            return '/$action$subpath';
        }
    }
  }

  /// Generates a standardized QR code string representation for handoff across devices.
  String generateHandoffQrCode(QuantOmniRoute route) {
    // QR codes encode the sovereign web companion URL with deep link fallback scheme parameter
    final resolved = resolve(route);
    final uriWithSchemeHint = resolved.webUri.replace(
      queryParameters: {
        ...resolved.queryParameters,
        '_native_scheme': route.targetApp.primaryScheme,
      },
    );
    return uriWithSchemeHint.toString();
  }
}
