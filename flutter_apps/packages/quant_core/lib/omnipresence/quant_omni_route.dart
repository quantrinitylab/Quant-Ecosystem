// Sovereign Quant Ecosystem - Omni-Presence Route Engine
// Structured deep-link representation with bidirectional native URI and web companion resolution.
// Invariants: Strictly ZERO raw Unicode emojis, ZERO Skia clipPath.

import 'quant_app_registry.dart';

/// Exception thrown when a deep link or URI cannot be parsed into a valid OmniRoute.
class QuantOmniRouteParseException implements Exception {
  final String message;
  final String rawUri;

  const QuantOmniRouteParseException(this.message, this.rawUri);

  @override
  String toString() => 'QuantOmniRouteParseException: $message (raw: "$rawUri")';
}

/// Represents an omni-presence deep link route targeted at a sovereign Quant app.
class QuantOmniRoute {
  final QuantAppMetadata targetApp;
  final String action;
  final String path;
  final List<String> pathSegments;
  final Map<String, String> parameters;
  final String? fragment;
  final String? ssoHandoffToken;

  const QuantOmniRoute({
    required this.targetApp,
    required this.action,
    required this.path,
    this.pathSegments = const [],
    this.parameters = const {},
    this.fragment,
    this.ssoHandoffToken,
  });

  /// Returns a clean copy with modified properties.
  QuantOmniRoute copyWith({
    QuantAppMetadata? targetApp,
    String? action,
    String? path,
    List<String>? pathSegments,
    Map<String, String>? parameters,
    String? fragment,
    String? ssoHandoffToken,
  }) {
    return QuantOmniRoute(
      targetApp: targetApp ?? this.targetApp,
      action: action ?? this.action,
      path: path ?? this.path,
      pathSegments: pathSegments ?? this.pathSegments,
      parameters: parameters ?? this.parameters,
      fragment: fragment ?? this.fragment,
      ssoHandoffToken: ssoHandoffToken ?? this.ssoHandoffToken,
    );
  }

  /// Constructs the canonical native deep-link URI (e.g. `quantmail://compose?to=alice@quantmail.in`).
  Uri toNativeUri() {
    final queryParams = Map<String, String>.from(parameters);
    if (ssoHandoffToken != null && ssoHandoffToken!.isNotEmpty) {
      queryParams['sso_token'] = ssoHandoffToken!;
    }

    final query = queryParams.isNotEmpty ? queryParams : null;
    final normalizedPath = path.isEmpty || path == '/' ? '' : (path.startsWith('/') ? path : '/$path');

    // Host acts as the action when there are no extra path segments, e.g. quantmail://inbox
    return Uri(
      scheme: targetApp.primaryScheme,
      host: action.isNotEmpty ? action : null,
      path: normalizedPath.isNotEmpty && normalizedPath != '/$action' ? normalizedPath : null,
      queryParameters: query,
      fragment: fragment,
    );
  }

  /// Parses a deep-link URI string (native custom scheme or https web URL) into a QuantOmniRoute.
  static QuantOmniRoute parse(String uriString) {
    final trimmed = uriString.trim();
    if (trimmed.isEmpty) {
      throw const QuantOmniRouteParseException('URI string cannot be empty', '');
    }

    final Uri parsed;
    try {
      parsed = Uri.parse(trimmed);
    } catch (e) {
      throw QuantOmniRouteParseException('Invalid URI syntax: $e', trimmed);
    }

    final scheme = parsed.scheme.toLowerCase();

    // 1. Handle mailto: scheme specifically
    if (scheme == 'mailto') {
      final recipient = parsed.path;
      final params = Map<String, String>.from(parsed.queryParameters);
      if (recipient.isNotEmpty && !params.containsKey('to')) {
        params['to'] = recipient;
      }
      return QuantOmniRoute(
        targetApp: QuantAppRegistry.mail,
        action: 'compose',
        path: '/compose',
        pathSegments: const ['compose'],
        parameters: params,
        fragment: parsed.fragment.isNotEmpty ? parsed.fragment : null,
      );
    }

    // 2. Handle webcal: scheme specifically
    if (scheme == 'webcal') {
      final params = Map<String, String>.from(parsed.queryParameters);
      params['feed_url'] = trimmed.replaceFirst('webcal://', 'https://');
      return QuantOmniRoute(
        targetApp: QuantAppRegistry.calendar,
        action: 'agenda',
        path: '/agenda',
        pathSegments: const ['agenda'],
        parameters: params,
        fragment: parsed.fragment.isNotEmpty ? parsed.fragment : null,
      );
    }

    // 3. Match by native custom scheme
    final appByScheme = QuantAppRegistry.fromScheme(scheme);
    if (appByScheme != null) {
      return _buildFromNativeUri(appByScheme, parsed);
    }

    // 4. Match by HTTPS / HTTP web companion URL
    if (scheme == 'https' || scheme == 'http') {
      final host = parsed.host.toLowerCase();
      final appByHost = QuantAppRegistry.fromDomain(host);
      if (appByHost != null) {
        return _buildFromWebUri(appByHost, parsed);
      }
    }

    throw QuantOmniRouteParseException('Unrecognized scheme or domain', trimmed);
  }

  /// Safe parse returning null on failure.
  static QuantOmniRoute? tryParse(String uriString) {
    try {
      return parse(uriString);
    } catch (_) {
      return null;
    }
  }

  /// Internal builder from native URI: scheme://action/path?params
  static QuantOmniRoute _buildFromNativeUri(QuantAppMetadata app, Uri uri) {
    // In URIs like `quantmail://inbox`, 'inbox' is parsed as host.
    // In URIs like `quantmail:/inbox`, 'inbox' is path.
    String action = '';
    List<String> segments = [];

    if (uri.host.isNotEmpty) {
      action = uri.host;
      if (uri.pathSegments.isNotEmpty) {
        segments = uri.pathSegments;
      }
    } else if (uri.pathSegments.isNotEmpty) {
      action = uri.pathSegments.first;
      segments = uri.pathSegments.skip(1).toList();
    } else {
      action = app.supportedActions.first;
    }

    final queryParams = Map<String, String>.from(uri.queryParameters);
    final ssoToken = queryParams.remove('sso_token') ?? queryParams.remove('token');

    final fullPath = segments.isNotEmpty ? '/$action/${segments.join('/')}' : '/$action';

    return QuantOmniRoute(
      targetApp: app,
      action: action,
      path: fullPath,
      pathSegments: segments,
      parameters: queryParams,
      fragment: uri.fragment.isNotEmpty ? uri.fragment : null,
      ssoHandoffToken: ssoToken,
    );
  }

  /// Internal builder from HTTPS web URI: https://domain/action/subpath?params
  static QuantOmniRoute _buildFromWebUri(QuantAppMetadata app, Uri uri) {
    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    String action = '';
    List<String> remainingSegments = [];

    if (segments.isEmpty) {
      action = app.supportedActions.first;
    } else {
      final first = segments.first.toLowerCase();
      // Handle prefix like /mail/inbox or /c/room_1
      if ((app.appId == QuantAppId.mail && (first == 'mail' || first == 'app')) && segments.length > 1) {
        action = segments[1];
        remainingSegments = segments.skip(2).toList();
      } else if (app.supportsAction(first)) {
        action = first;
        remainingSegments = segments.skip(1).toList();
      } else {
        action = first;
        remainingSegments = segments.skip(1).toList();
      }
    }

    final queryParams = Map<String, String>.from(uri.queryParameters);
    final ssoToken = queryParams.remove('sso_token') ?? queryParams.remove('token');
    final fullPath = uri.path.isNotEmpty ? uri.path : '/$action';

    return QuantOmniRoute(
      targetApp: app,
      action: action,
      path: fullPath,
      pathSegments: remainingSegments,
      parameters: queryParams,
      fragment: uri.fragment.isNotEmpty ? uri.fragment : null,
      ssoHandoffToken: ssoToken,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'targetApp': targetApp.appId.name,
      'action': action,
      'path': path,
      'pathSegments': pathSegments,
      'parameters': parameters,
      'fragment': fragment,
      'ssoHandoffToken': ssoHandoffToken,
    };
  }

  @override
  String toString() => 'QuantOmniRoute(${targetApp.displayName}, action: $action, path: $path, params: $parameters)';
}
