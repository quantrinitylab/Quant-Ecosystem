# Linux runner — setup note

The full CMake-based runner (`linux/CMakeLists.txt`, `linux/runner/`,
`linux/flutter/`) is intentionally **not** committed here — a hand-written
`CMakeLists.txt` would pretend to be complete while missing the SDK-generated
ephemeral wiring.

To generate the complete, buildable runner on a Linux machine with the
Flutter SDK installed (plus the desktop prerequisites: `clang`, `cmake`,
`ninja-build`, GTK dev libraries):

```sh
cd packages/quantmax_app
flutter create --platforms=linux .
```

Then enable the desktop target once and build:

```sh
flutter config --enable-linux-desktop
flutter build linux
```

Application ID suggestion: `com.quantrinity.quantmax`.

The OAuth2/PKCE browser flow on desktop opens the system browser; the
custom-scheme redirect (`com.quantrinity.quantmax:/oauth2redirect`) needs a
desktop protocol handler registered for the scheme (xdg mime / .desktop
entry) — verify on target hardware before release.
