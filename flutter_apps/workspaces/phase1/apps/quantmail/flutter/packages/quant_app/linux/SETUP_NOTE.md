# Linux runner — setup note

The full CMake-based runner (`linux/CMakeLists.txt`, `linux/runner/`,
`linux/flutter/`) is intentionally **not** committed here — a hand-written
`CMakeLists.txt` would pretend to be complete while missing the SDK-generated
ephemeral wiring.

To generate the complete, buildable runner on a Linux machine with the
Flutter SDK installed (plus the desktop prerequisites: `clang`, `cmake`,
`ninja-build`, GTK dev libraries):

```sh
cd packages/quant_app
flutter create --platforms=linux .
```

Then enable the desktop target once and build:

```sh
flutter config --enable-linux-desktop
flutter build linux
```

Application ID suggestion: `com.quantrinity.quantmail`.
