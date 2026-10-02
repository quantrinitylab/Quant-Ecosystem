# macOS runner — setup note

The full Xcode project (`macos/Runner.xcodeproj`, `macos/Runner.xcworkspace`,
entitlements, `MainFlutterWindow`) is intentionally **not** committed here.

To generate the complete, buildable runner on a Mac with the Flutter SDK and
Xcode installed:

```sh
cd packages/quant_wave_app
flutter create --platforms=macos .
```

This generates the Xcode project and entitlements from your local SDK
version. Never hand-write `project.pbxproj`.

Bundle identifier suggestion: `com.quantrinity.quantwave`.
