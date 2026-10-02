# FLUTTER COMMERCIAL ENGINE EXTRACTION & ELEVATION MANIFEST
## Sovereign Modernization Blueprint for Quant Ecosystem Mobile Applications

- **Document Version**: 1.0.0
- **Author**: Subagent 2 (Flutter Commercial Engine Extractor)
- **Target Applications**: `QuantMail`, `QuantChat`, `QuantGram`, `QuanTube`, `QuantAI`
- **Source Commercial Codebases**:
  - `C:\Users\Pc\new\Whoxa App v1.0.9\source_whoxa_app\whoxa-app\lib`
  - `C:\Users\Pc\new\Shortie\New_Shortie_Without_Ad\lib`
  - `C:\Users\Pc\new\Chatter (27 Jan 2026)\source_chatter_flutter\chatter\lib`
- **Target Workspace**: `C:\Users\Pc\Quant-Ecosystem\flutter_apps`

---

## 1. Executive Summary & Ecosystem Architecture

The Quant Ecosystem mobile strategy encompasses a unified enterprise productivity suite alongside dedicated high-performance standalone applications:

1. **QuantMail (`com.quant.mail`)**: The unified enterprise productivity suite integrating **Mail, Calendar, Drive, QuantGit (CodeHub), and Contacts (QuantDex)** into a cohesive single application with a unified bottom navigation bar and single-sign-on (SSO).
2. **QuantChat (`com.quant.chat`)**: Dedicated sovereign messaging platform delivering end-to-end encrypted messaging, WebRTC audio/video calls, and live audio spaces (Clubhouse/Spaces tier).
3. **QuantGram (`com.quant.gram`)**: Dedicated creator media platform delivering vertical 9:16 video feeds (Reels/TikTok tier), camera effects, audio mixing, 24-hour ephemeral stories, and creator tipping.
4. **QuanTube (`com.quant.tube`)**: Dedicated video streaming and podcasting platform (YouTube/Spotify tier) with segment skipping, background audio, and creator studio.
5. **QuantAI (`com.quant.ai`)**: Dedicated conversational AI Agent OS (ChatGPT/AgentLabs tier) featuring streaming Markdown/LaTeX responses, 3D Voice Orb interaction, and visual workflow automation.

This manifest details the forensic extraction of battle-tested commercial Flutter codebases from `C:\Users\Pc\new`, their surgical isolation from insecure stubs and hardcoded dependencies, and their elevation into zero-mock, fully typed, hardware-accelerated, enterprise-hardened components connected directly to our Fastify microservices and WebSocket gateway (`services/ws-gateway`).

---

## 2. Commercial Source Code Forensic Audit

### 2.1 Whoxa App v1.0.9 (`source_whoxa_app\whoxa-app\lib`)

#### A. WebRTC Audio/Video Calling Architecture
- **Primary Source Files**:
  - `lib/featuers/call/web_rtc_service.dart` (910 lines)
  - `lib/featuers/call/call_manager.dart` (2,533 lines)
  - `lib/featuers/call/call_ui.dart`
  - `lib/featuers/call/call_model.dart`
  - `lib/core/services/call_audio_manager.dart`
  - `lib/core/services/call_notification_manager.dart`
- **Dependencies**: `flutter_webrtc: ^0.10.x`, `peerdart: ^0.6.x`
- **Mechanism & State Machine**:
  - `WebRTCService` is implemented as a singleton managing a `Peer` instance and `MediaStream` (local and remote).
  - Audio and video constraints are negotiated dynamically:
    - Audio: `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`, `sampleRate: 44100`, `channelCount: 1`.
    - Video: `width: {min: 640, ideal: 1280, max: 1920}`, `height: {min: 480, ideal: 720, max: 1080}`, `frameRate: {min: 15, ideal: 30, max: 60}`, `facingMode: user`, `aspectRatio: 16/9`.
  - Signal exchange uses PeerJS protocol via `_peer.call(remotePeerId, _localStream, options: callOptions)`.
  - Remote stream attachment triggers `onRemoteStreamAdded` callback which feeds `RTCVideoRenderer` widgets in `call_ui.dart`.
- **Identified Flaws & Vulnerabilities in Commercial Code**:
  - **Severe Security Vulnerability**: Lines 220-223 hardcode raw IP address and disabled TLS:
    ```dart
    host: "62.72.36.245",
    port: 4001,
    path: "/",
    secure: false, // Insecure WS transport!
    ```
  - **No Dynamic ICE/TURN Provisioning**: Uses public Google STUN servers only (`stun:stun.l.google.com:19302`) without authenticated TURN relay, leading to 100% NAT traversal failure across enterprise firewalls and symmetric NAT cellular carriers.
  - **ID Conflict Hack**: Suffixes `-retry1`, `-retry2` to user IDs rather than using cryptographic session identifiers and server-coordinated call invitations.

#### B. Real-Time Chat & Socket Architecture
- **Primary Source Files**:
  - `lib/core/services/socket/socket_service.dart` (492 lines)
  - `lib/core/services/socket/socket_manager.dart` (371 lines)
  - `lib/core/services/socket/socket_event_controller.dart` (5,241 lines)
- **Dependencies**: `socket_io_client: ^3.0.x`
- **Mechanism**:
  - `SocketService` wraps `io.Socket` with singleton lifecycle, connection retry timers, and connection state streams (`SocketConnectionState: disconnected, connecting, connected, reconnecting, error`).
  - Auth token is read from persistent storage: `SecurePrefs.getString(SecureStorageKeys.TOKEN)` and injected into socket connection options.
  - `SocketEventController` handles high-volume events:
    - Messages: `chat`, `message_sent`, `message_received`, `message_delivered`, `message_read`
    - Presence: `user_online`, `user_offline`, `get_online_users`
    - Indicators: `typing_start`, `typing_stop`
    - State: `block_updates`, `chat_list_updated`
  - Deduplication mechanism: Maintains `_recentlyProcessedMessages` and `_seenMessages` sets to suppress duplicate packet processing during network handovers.
  - Cache protection: Implements `_cacheDataProtected` flag to prevent stale server responses from overwriting freshly updated local drafts.

#### C. PDF Document Viewing
- **Primary Source File**:
  - `lib/featuers/chat/screens/pdf_viewer_screen.dart` (107 lines)
- **Dependencies**: `syncfusion_flutter_pdfviewer: ^26.x`
- **Mechanism**:
  - `SfPdfViewer.file` renders local PDF files directly from filesystem path with `PdfViewerController`.
  - Configured with `enableDoubleTapZooming: true`, `enableTextSelection: true`, `canShowScrollHead: true`, `canShowScrollStatus: true`, `canShowPaginationDialog: true`.
  - Includes zoom level reset control (`_pdfViewerController.zoomLevel = 1.0`).

---

### 2.2 Shortie (`New_Shortie_Without_Ad\lib`)

#### A. 9:16 Vertical Video Feed Caching & Preload
- **Primary Source Files**:
  - `lib/pages/reels_page/controller/reels_controller.dart` (65 lines)
  - `lib/pages/reels_page/view/reels_view.dart` (137 lines)
  - `lib/pages/reels_page/widget/reels_widget.dart` (699 lines)
- **Dependencies**: `preload_page_view: ^0.2.0`, `video_player: ^2.8.x`, `chewie: ^1.8.x`
- **Mechanism**:
  - `PreloadPageView.builder` provides vertical full-screen snapping with `preloadPagesCount: 4`:
    ```dart
    PreloadPageView.builder(
      controller: controller.preloadPageController,
      itemCount: controller.mainReels.length,
      preloadPagesCount: 4,
      scrollDirection: Axis.vertical,
      onPageChanged: (value) async {
        controller.onPagination(value);
        controller.onChangePage(value);
      },
      itemBuilder: (context, index) => PreviewReelsView(
        index: index,
        currentPageIndex: controller.currentPageIndex,
      ),
    )
    ```
  - `PreviewReelsView` encapsulates a `VideoPlayerController.networkUrl` wrapped in `ChewieController`:
    - Auto-starts strictly when `widget.index == widget.currentPageIndex && isReelsPage.value`.
    - Automatically calls `onStopVideo()` when index moves or routes transition.
    - Buffering state listener (`videoPlayerController.value.isBuffering`) drives interactive loaders.
    - Smooth double-tap like animation with heart scale tween and Lottie feedback.
    - Floating action bar: likes count with compact formatting (`CustomFormatNumber`), comments drawer, gift sender, and URL deep-link sharing.

#### B. Camera Recording & Audio Trimming Pipeline
- **Primary Source Files**:
  - `lib/pages/create_reels_page/controller/create_reels_controller.dart` (809 lines)
  - `lib/pages/trim_video_page/controller/trim_video_controller.dart` (121 lines)
- **Dependencies**: `camera: ^0.10.x`, `ffmpeg_kit_flutter: ^6.0.x`, `video_trimmer: ^3.0.x`, `audioplayers: ^6.0.x`
- **Pipeline Implementation**:
  1. **Camera Recording**: `CameraController` initialized with front/back camera, audio recording enabled, resolution preset `high`. Timer increments recording progress bar against selected cap (5, 10, 15, or 30 seconds).
  2. **Audio Stripping**:
     ```dart
     final String videoWithoutAudioPath = '${(await getTemporaryDirectory()).path}/RM_${DateTime.now().millisecondsSinceEpoch}.mp4';
     final ffmpegRemoveAudioCommand = '-i $videoPath -c copy -an $videoWithoutAudioPath';
     final sessionRemoveAudio = await FFmpegKit.executeAsync(ffmpegRemoveAudioCommand);
     ```
  3. **Audio-Video Multiplexing**:
     ```dart
     final String path = '${(await getTemporaryDirectory()).path}/FV_${DateTime.now().millisecondsSinceEpoch}.mp4';
     final minTime = (videoTime < soundTime) ? videoTime : soundTime;
     final command = '-i $videoPath -i $audioPath -t $minTime -c:v copy -c:a aac -strict experimental -map 0:v:0 -map 1:a:0 $path';
     final session = await FFmpegKit.executeAsync(command);
     ```
  4. **Non-Destructive Trimming**: `Trimmer` (`video_trimmer`) loads video into native player with dual scrub handles (`startValue`, `endValue`), generating trim bounds and thumbnail extraction via `CustomThumbnail`.

---

### 2.3 Chatter (`source_chatter_flutter\chatter\lib`)

#### A. Live Audio Spaces (Clubhouse / Twitter Spaces Architecture)
- **Primary Source Files**:
  - `lib/screens/audio_space/audio_spaces_screen/...`
  - `lib/screens/audio_space/create_audio_space_screen/...`
  - `lib/screens/audio_space/models/audio_space.dart`
  - `lib/screens/audio_space/models/audio_space_user.dart`
  - `lib/screens/audio_space/models/audio_space_message.dart`
- **Key Concepts**:
  - Multi-user audio room with three distinct role tiers: Host (`is_host`), Speaker (`is_speaker`), and Listener.
  - Hand-raise signaling flow (`raiseHand`, `acceptSpeakerRequest`, `demoteToListener`).
  - Mute state broadcasting, room participant roster with active speaker pulsing indicator.

---

## 3. Module Extraction & Destination Map

The following matrix maps commercial source components to their modernized target destinations in the Quant Ecosystem monorepo (`flutter_apps/`):

| Commercial Source Component | Target Monorepo Destination | Target App / Package | Sovereign Elevation Upgrades |
|:---|:---|:---|:---|
| **Whoxa**: `pdf_viewer_screen.dart` | `flutter_apps/packages/quant_ui/lib/components/quant_pdf_viewer.dart` | `QuantMail` (Drive & Attachments) | Add Dark Mode inverter, FastCDC chunk cache stream, print/share export, zero watermarks. |
| **Whoxa**: `web_rtc_service.dart`, `call_manager.dart` | `flutter_apps/packages/quant_rtc/lib/quant_rtc.dart` | `QuantChat` | Replace raw IP PeerJS with Sovereign Signaling via `ws-gateway`; dynamic TURN credentials; E2EE DTLS-SRTP. |
| **Whoxa**: `call_ui.dart`, `call_audio_manager.dart` | `flutter_apps/apps/quant_chat/lib/features/calls/presentation/call_screen.dart` | `QuantChat` | Frosted glass dark theme (`QuantTheme`), Picture-in-Picture (PiP), background audio call management. |
| **Whoxa**: `socket_service.dart`, `socket_event_controller.dart` | `flutter_apps/packages/quant_realtime_client/lib/quant_realtime_client.dart` | `QuantChat`, `QuantMail`, `QuantGram` | Riverpod 2.x stream providers, automatic reconnect with backoff, Bearer JWT handshake with `services/ws-gateway`. |
| **Whoxa**: `featuers/contacts/*` | `flutter_apps/packages/quant_core/lib/contacts/quant_contacts_service.dart` | `QuantMail` (QuantDex) & `QuantChat` | Offline SQLite FTS5 search index, device contact sync with hash matching, workspace member federation. |
| **Shortie**: `reels_view.dart`, `reels_widget.dart` | `flutter_apps/apps/quant_gram/lib/features/reels/presentation/reels_feed_view.dart` | `QuantGram` | Upgrade to cached `video_player` with pre-caching proxy, HLS adaptive bitrate support, double-tap haptics. |
| **Shortie**: `create_reels_controller.dart` | `flutter_apps/apps/quant_gram/lib/features/creator/camera_recording_controller.dart` | `QuantGram` | CameraX on Android, hardware-accelerated FFmpeg 6.x commands, sound-waveform sync, zero temp-file leak. |
| **Shortie**: `trim_video_controller.dart` | `flutter_apps/apps/quant_gram/lib/features/creator/video_trim_screen.dart` | `QuantGram`, `QuanTube` | Precision sub-frame timeline scrubber, aspect ratio cropping (9:16, 16:9, 1:1), audio level normalization. |
| **Chatter**: `audio_space/*` | `flutter_apps/apps/quant_chat/lib/features/audio_spaces/presentation/audio_space_room.dart` | `QuantChat`, `QuanTube` | WebRTC SFU mesh via Sovereign Media Relay, spatial audio simulation, live stage reactions, recording archive. |

---

## 4. Zero-Mock Elevation Blueprint (Direct Fastify & WS Gateway Connection)

Commercial source codebases rely on disparate PHP/Laravel endpoints and unauthenticated stubs. We elevate these components to interface natively with the Sovereign Quant backend infrastructure.

### 4.1 Real-Time WebSocket Gateway Integration (`services/ws-gateway`)

The commercial `SocketService` and `SocketEventController` are refactored into `QuantRealtimeClient` connecting directly to our high-throughput WebSocket gateway running on port 3041 (`/ws`).

```mermaid
sequenceDiagram
    autonumber
    actor User as Flutter Client (QuantChat / QuantGram)
    participant Auth as QuantAuthService
    participant WSGateway as WS Gateway (:3041)
    participant EventBus as Realtime EventBus
    participant Fastify as App Fastify Backend

    User->>Auth: getAccessToken()
    Auth-->>User: Bearer JWT Token
    User->>WSGateway: Connect wss://quantmail.in/ws (Auth: Bearer JWT)
    WSGateway->>WSGateway: Validate JWT (Issuer: quant-platform, Aud: quant-realtime)
    WSGateway-->>User: Connection Established (Client ID, Heartbeat: 30s)
    User->>WSGateway: Subscribe { channel: "conversation:uuid-101" }
    Fastify->>EventBus: publish("messages", { conversationId: "uuid-101", text: "Hello" })
    EventBus->>WSGateway: Relay to channel "conversation:uuid-101"
    WSGateway->>User: Message Frame Delivered (ACK required)
    User->>WSGateway: Message ACK { messageId: 1042 }
```

#### Protocol Specification for Modernized Socket Client:
1. **Connection URL**: `wss://quantmail.in/ws` (Staging: `wss://staging.quantmail.in/ws`)
2. **Handshake Header**: `Authorization: Bearer <access_token>`
3. **Heartbeat Invariant**: Ping/pong frame every 30 seconds; reconnect triggered if timeout exceeds 60 seconds.
4. **Resilient Channel Subscriptions**:
   - `user:<userId>:notifications`
   - `conversation:<conversationId>`
   - `calls:<callId>`
   - `presence`

### 4.2 WebRTC Sovereign Signaling & Dynamic ICE Configuration

We eliminate the hardcoded `62.72.36.245:4001` IP and replace it with dynamic ICE configuration negotiated over Fastify and WebSocket signaling:

```mermaid
sequenceDiagram
    autonumber
    actor Caller as Caller Client
    participant Fastify as Fastify API (/api/v1/calls)
    participant WSGateway as WS Gateway (/ws)
    actor Callee as Callee Client
    participant Coturn as Coturn STUN/TURN Pods

    Caller->>Fastify: GET /api/v1/calls/ice-servers
    Fastify-->>Caller: Ephemeral TURN credentials (RFC 5766, HMAC-SHA-1, TTL: 24h)
    Caller->>WSGateway: EMIT "call:invite" { targetUserId, callType, offerSDP }
    WSGateway->>Callee: FORWARD "call:incoming" { callId, callerInfo, offerSDP }
    Callee->>Fastify: GET /api/v1/calls/ice-servers
    Fastify-->>Callee: Ephemeral TURN credentials
    Callee->>WSGateway: EMIT "call:accept" { callId, answerSDP }
    WSGateway->>Caller: FORWARD "call:answered" { answerSDP }
    Caller->>Coturn: ICE Candidates Exchange (Direct P2P or Encrypted Relay)
    Callee->>Coturn: ICE Candidates Exchange
    Note over Caller,Callee: Media Flow Established (DTLS-SRTP Audio/Video)
```

### 4.3 REST API Schema Normalization

All extracted components interact through `QuantApiClient` (`flutter_apps/packages/quant_core/lib/api/quant_api_client.dart`), utilizing automatic token refresh, request queuing, and type-safe response wrappers:

```dart
// Example: Modernized Fastify Reels Feed Request
Future<List<QuantReel>> fetchReelsFeed({required int page, int limit = 20}) async {
  final response = await _apiClient.get(
    '/reels/feed',
    queryParameters: {'page': page, 'limit': limit},
  );
  return (response.data['items'] as List)
      .map((json) => QuantReel.fromJson(json))
      .toList();
}
```

---

## 5. Enterprise Security Hardening & Zero-Knowledge Invariants

The commercial codebases contain critical security liabilities that are explicitly remediated in our extraction:

```mermaid
graph TD
    A[Commercial Code Liabilities] -->|Remediation| B[Quant Ecosystem Hardened Invariants]
    
    subgraph Commercial Vulnerabilities
        A1[Hardcoded IP: 62.72.36.245:4001]
        A2[Plaintext HTTP & Insecure WS]
        A3[Unencrypted SharedPreferences]
        A4[Unsanitized Temporary File Storage]
        A5[Stale Public STUN Servers]
    end
    
    subgraph Sovereign Hardened Architecture
        B1[Dynamic Config via QuantConfig & Cluster Ingress]
        B2[Strict TLS 1.3 & WSS with Cert Pinning]
        B3[AES-256 Encrypted Keystore / Keychain Storage]
        B4[Cryptographic Cache & Zero-Trace File Scrubbing]
        B5[Ephemeral TURN Auth via RFC 5766 / Fastify]
    end
```

### Security Hardening Directives:
1. **Zero Hardcoded Secrets & Endpoints**:
   - Zero IP addresses, development domain URLs, or test API keys permitted in source code.
   - All network destinations resolved dynamically via `QuantConfig` injected at app initialization.
   - Enforced by pre-commit static analysis and CI runner checks (`services/ci-runner`).
2. **Encrypted Token Management**:
   - Authentication tokens stored exclusively via `QuantAuthService` backed by `flutter_secure_storage`.
   - Android implementation: `EncryptedSharedPreferences` backed by Android Keystore (AES-256-GCM).
   - iOS implementation: Keychain access with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
3. **Encrypted Local Cache**:
   - Local chat messages, cached emails, and contact records stored in SQLite via SQLCipher or Hive encrypted boxes (`HiveAesCipher`).
   - Cache keys derived from user master credentials using PBKDF2 with 100,000 iterations and salt.
4. **Temporary Media Scrubbing**:
   - All FFmpeg intermediate files (`RM_*.mp4`, `FV_*.mp4`, trimmed chunks) stored in an isolated app cache sandbox.
   - Automatic cleanup hook triggers upon video export completion, session logout, or application backgrounding to prevent unencrypted media leaks.
5. **Biometric & App Lock Guards**:
   - QuantMail and QuantChat enforce local biometric auth (Fingerprint / Face Unlock / Sovereign PIN) with hardware-backed cryptographic challenge verification before rendering sensitive chats or documents.

---

## 6. Implementation Phases & Step-by-Step Execution Plan

```mermaid
gantt
    title Flutter Commercial Extraction & Elevation Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1: Shared Core & Bridges
    Extract PDF Viewer to quant_ui             :done, 2026-10-02, 1d
    Design quant_rtc WebRTC package           :active, 2026-10-02, 2d
    Build quant_realtime_client (ws-gateway)  :2026-10-04, 3d
    section Phase 2: QuantMail Productivity
    Embed PDF viewer in Drive & Attachments   :2026-10-07, 2d
    Integrate Contact picker in Composer      :2026-10-09, 2d
    section Phase 3: QuantChat Sovereign
    Migrate Whoxa WebRTC to ws-gateway        :2026-10-11, 4d
    Port Call UI with Dark Frosted Glass      :2026-10-15, 3d
    Port Chatter Audio Spaces to WebRTC SFU   :2026-10-18, 4d
    section Phase 4: QuantGram Media Engine
    Port PreloadPageView 9:16 Video Feed      :2026-10-22, 3d
    Port FFmpeg Camera Recording & Audio Mix  :2026-10-25, 4d
    Port Video Trimmer & Scrubber             :2026-10-29, 3d
    section Phase 5: Verification & Quality Gate
    Comprehensive Unit & Widget Testing       :2026-11-01, 3d
    Live Device & E2E Validation              :2026-11-04, 3d
```

### Next Actionable Steps:
1. **Create Shared Packages**:
   - `flutter_apps/packages/quant_rtc` for sovereign WebRTC audio/video call management.
   - `flutter_apps/packages/quant_media` for FFmpeg camera capture, audio merging, and video trimming.
2. **Elevate PDF Viewer**:
   - Wire `PdfViewerScreen` into `flutter_apps/packages/quant_ui/lib/components/quant_pdf_viewer.dart` with support for offline FastCDC attachments.
3. **Bridge WebSocket Protocol**:
   - Create client bridge in Dart for `@quant/realtime` and `services/ws-gateway` handling message frames, ACKs, and presence heartbeats.

---
*Manifest authored in full adherence to the Sovereign Quant Ecosystem Engineering Bible and Global Autonomous Directives.*
