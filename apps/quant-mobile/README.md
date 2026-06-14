# @quant/quant-mobile — Capacitor Mega-Shell

The single native iOS/Android app that wraps the Quant web apps. The web layer
(this package) builds with Vite; Capacitor packages `dist/` into native shells.

## Build the web layer (works anywhere, CI-verified)

```bash
pnpm --filter @quant/quant-mobile build        # vite build -> dist/
pnpm --filter @quant/quant-mobile typecheck    # tsc --noEmit
pnpm --filter @quant/quant-mobile test          # vitest
```

## Generate the native apps (requires a Mac for iOS / Android SDK)

These steps need a local native toolchain and CANNOT run in CI/Codespaces:

```bash
cd apps/quant-mobile
npx cap add ios          # requires Xcode (macOS only)
npx cap add android      # requires Android Studio / SDK
pnpm build && npx cap sync
npx cap open ios         # build & run in Xcode
npx cap open android     # build & run in Android Studio
```

## What's already implemented (TypeScript, unit-tested)

- **Shell UI:** `App.tsx` (app launcher grid + bottom tab bar), `components/`
  (AppLauncherGrid, BottomNavigation, NotificationCenter, DeepLinkRouter, OfflineBanner).
- **Native plugin services** (`plugins/`): Push, Camera/Media, Contacts, FileSystem,
  Share, Biometric auth, BackgroundFetch, WebRTC, Haptics, InAppBrowser.
- **Auth:** `NativeOAuthService` (Apple / Google sign-in, PKCE).
- **Platform glue:** deep linking, widgets, offline sync queue, crash reporting,
  performance/size budgets, splash & icon config.

## Remaining for a store-shippable app

- Run `cap add ios/android` on a Mac/with Android SDK (above).
- Bind the plugin service abstractions to the real `@capacitor/*` plugin packages.
- App Store / Play Store signing, provisioning, and submission.
