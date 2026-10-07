# macOS runner — setup note

The full Xcode project (`macos/Runner.xcodeproj`, `macos/Runner.xcworkspace`,
entitlements, `MainFlutterWindow`) is intentionally **not** committed here.

To generate the complete, buildable runner on a Mac with the Flutter SDK
and Xcode installed:

```sh
cd packages/quantmax_app
flutter create --platforms=macos .
```

This generates the Xcode project and entitlements from your local SDK
version. Never hand-write `project.pbxproj`.

Bundle identifier suggestion: `com.quantrinity.quantmax`.

Register the OAuth2/PKCE redirect scheme (`com.quantrinity.quantmax`) in
the generated `Info.plist` under `CFBundleURLTypes` (mirror
`ios/Runner/Info.plist`) so the system-browser consent step can return to
the app.
