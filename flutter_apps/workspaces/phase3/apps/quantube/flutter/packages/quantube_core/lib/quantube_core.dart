// QuanTube shared core — public barrel.
// W2 provides theme, W3 provides auth; this barrel only re-exports them.

// Theme (provided by W2: src/theme/quantube_theme.dart).
export 'src/theme/quantube_theme.dart';

// Token colors (used by feed skeleton shimmer + cards directly).
export 'src/theme/quantube_colors.dart';

// Auth (provided by W3: src/auth/* OAuth2+PKCE helpers).
export 'src/auth/quantube_auth.dart';

// Core provider graph: appConfigProvider, tokenManagerProvider,
// authStateProvider, apiClientProvider, isAuthenticatedProvider.
export 'src/providers/core_providers.dart';

// Offline (provided by W4: src/offline/* — download task model + manager
// contract/in-memory stub).
export 'src/offline/offline.dart';

// Playback engine contract (W3: player UI shell).
export 'src/player/player.dart';

// Feed module (W2: home feed UI shell): Video model, abstract FeedRepository
// contract, homeFeedProvider. No concrete implementation yet — the QuanTube
// API spec (app-foundations/quantube) has not been written, so the
// repository is abstract and feedRepositoryProvider throws until overridden.
export 'src/feed/feed.dart';
