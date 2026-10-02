# iOS runner — setup note

The full Xcode project (`ios/Runner.xcodeproj`, `ios/Runner.xcworkspace`,
`Podfile` / `Pods`) is intentionally **not** committed here.

`ios/Runner/Info.plist` and `ios/Runner/AppDelegate.swift` are real, minimal
starter files. To generate the complete, buildable runner on a Mac with the
Flutter SDK and Xcode installed:

```sh
cd packages/ads_app
flutter create --platforms=ios .
```

This generates the Xcode project, launch screens, and plugin-registrant
wiring from your local SDK version. Never hand-write `project.pbxproj` —
it is machine-generated and thousands of lines long.

Bundle identifier for App Store / TestFlight: set
`PRODUCT_BUNDLE_IDENTIFIER` in the generated Xcode project (suggested:
`com.quantrinity.quantads`).

OAuth2/PKCE redirect scheme: `quantads` (see `CFBundleURLSchemes` in
`Info.plist` — matches the `quantads://oauth/callback` redirect registered
for the QuantAds OAuth client).
