# Windows runner — setup note

The full CMake-based runner (`windows/CMakeLists.txt`, `windows/runner/`,
`windows/flutter/`) is intentionally **not** committed here — a hand-written
`CMakeLists.txt` would pretend to be complete while missing the SDK-generated
ephemeral wiring.

To generate the complete, buildable runner on a Windows machine with the
Flutter SDK installed (plus Visual Studio with the "Desktop development with
C++" workload):

```sh
cd packages/ads_app
flutter create --platforms=windows .
```

Then enable the desktop target once and build:

```sh
flutter config --enable-windows-desktop
flutter build windows
```
