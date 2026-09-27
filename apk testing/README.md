# 📱 Quant Sovereign Android Ecosystem — Standalone Independent APK Fleet

This directory contains individual, standalone Android Application Package (APK) builds for every application in the **Quant Sovereign Ecosystem**. Mirroring Big Tech architecture (Google separating Gmail, Drive, Calendar, YouTube; Meta separating Instagram, WhatsApp), each application has its own dedicated application package ID (`applicationId`), standalone persona, deep linking scheme, accent palette, and optimized native entrypoint.

---

## 📦 Standalone APK Registry (9 Independent Applications)

| #   | Application       | Standalone APK File  | Package ID (`applicationId`) | Deep Link Scheme   | Default Endpoint                    | Incumbent Parity Class     |
| --- | ----------------- | -------------------- | ---------------------------- | ------------------ | ----------------------------------- | -------------------------- |
| 1   | **QuantMail**     | `quant-mail.apk`     | `com.quant.mail`             | `quantmail://`     | `https://quantmail.in/`             | Superhuman & Gmail         |
| 2   | **QuantChat**     | `quant-chat.apk`     | `com.quant.chat`             | `quantchat://`     | `https://quantchat.quantrinity.in/` | WhatsApp & Signal          |
| 3   | **QuantGram**     | `quant-gram.apk`     | `com.quant.gram`             | `quantgram://`     | `https://quantgram.quantrinity.in/` | Instagram & Reels          |
| 4   | **QuanTube**      | `quant-tube.apk`     | `com.quant.tube`             | `quantube://`      | `https://quantube.quantrinity.in/`  | YouTube & Spotify          |
| 5   | **QuantAI**       | `quant-ai.apk`       | `com.quant.ai`               | `quantai://`       | `https://quantai.quantrinity.in/`   | ChatGPT & Claude Agent OS  |
| 6   | **QuantDrive**    | `quant-drive.apk`    | `com.quant.drive`            | `quantdrive://`    | `https://quantmail.in/drive`        | Google Drive & Dropbox     |
| 7   | **QuantCalendar** | `quant-calendar.apk` | `com.quant.calendar`         | `quantcalendar://` | `https://quantmail.in/calendar`     | Google Calendar & Calendly |
| 8   | **CodeHub**       | `quant-git.apk`      | `com.quant.git`              | `quantgit://`      | `https://quantmail.in/quantgit`     | GitHub Mobile              |
| 9   | **Quant Portal**  | `quant-app.apk`      | `com.quant.app`              | `quant://`         | `https://quantmail.in/`             | Unified SuperApp Hub       |

---

## 🛠️ Build Specifications

- **Build System**: Android Gradle Plugin (AGP) 8.9.0 / Gradle 9.1.0
- **Compile SDK**: Android 16 (API Level 36)
- **Min SDK**: Android 7.0 (API Level 24)
- **Target SDK**: Android 16 (API Level 36)
- **Language**: Kotlin 2.0.21 / Java 17
- **UI Framework**: Jetpack Compose BOM 2026.03.01 + Navigation3
- **Architectures**: Universal Multi-ABI (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`)
- **Package Size**: ~12.12 MB each

---

## 🚀 Native Architecture & Capabilities

1. **Independent Process & Sandboxing**:
   - Each app installs as an isolated Android application with its own data sandbox, cache, and preferences.
   - Users can install any combination of apps independently without dependency on the others.

2. **Native Deep Linking**:
   - Each app registers its own custom intent filters (e.g. `quantmail://`, `quantchat://`, `quantgram://`, `quantube://`, `quantai://`, `quantdrive://`, `quantcalendar://`, `quantgit://`).
   - Tapping web links or QR codes routes directly into the corresponding standalone app.

3. **Commercial Parity UI/UX**:
   - **QuantMail**: Superhuman floating shortcut dock, 10s undo-send, split inboxes, FTS5 instant search.
   - **QuantChat**: Live Audio Room stage (`AudioRoomStage.kt`), Whoxa waveform voice notes, QR peer safety verifier.
   - **QuantGram**: 9:16 full-screen Reels player, 24h disappearing stories, Shortie virtual gifts (`VirtualGiftOverlay.kt`), creator payout ledger.
   - **QuanTube**: Adaptive HLS player, segment-skipping AI button, Spotify-class background audio player dock.
   - **QuantAI**: 3D animated Voice Orb (`VoiceOrb.kt`), AgentLabs visual flow builder, MagicAI voiceover TTS.
   - **QuantDrive**: Version history rollback, FastCDC chunked deduplication, AI duplicate cleaner.
   - **QuantCalendar**: Calendly-class public booking links, slot locks, RFC 5545 recurrence.
   - **CodeHub**: In-browser code editor, PR 3-way merge conflict resolver, Actions streaming runner.

---

## 📲 How to Install

1. Transfer any desired `.apk` file (e.g. `quant-mail.apk`, `quant-gram.apk`, `quant-chat.apk`) to your Android device.
2. Tap the APK file in your device's File Manager.
3. If prompted, enable **Install unknown apps** for your file manager or browser.
4. Tap **Install** and open the application.
