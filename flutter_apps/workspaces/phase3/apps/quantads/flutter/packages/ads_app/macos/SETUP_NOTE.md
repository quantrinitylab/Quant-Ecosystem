# macOS runner — setup note

The full Xcode project (`macos/Runner.xcodeproj`, `macos/Runner.xcworkspace`,
entitlements, `MainFlutterWindow`) is intentionally **not** committed here.

`macos/Runner/Info.plist` is a real, minimal starter file. To generate the
complete, buildable runner on a Mac with the Flutter SDK and Xcode installed:

```sh
cd packages/ads_app
flutter create --platforms=macos .
```

This generates the Xcode project and entitlements from your local SDK
version. Never hand-write `project.pbxproj`.

Bundle identifier suggestion: `com.quantrinity.quantads`.

OAuth2/PKCE redirect scheme: `quantads` (`quantads://oauth/callback`) — add
a matching `CFBundleURLTypes` entry to the generated runner `Info.plist` if
desktop SSO via custom scheme is enabled for QuantAds.
