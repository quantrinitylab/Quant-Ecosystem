// Verification script for QuantChat Sovereign Omni-Presence manifests and features
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHAT_DIR = path.join(ROOT, 'flutter_apps', 'apps', 'quant_chat');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    testsFailed++;
  } else {
    console.log('PASS:', message);
    testsPassed++;
  }
}

console.log('=== QuantChat Sovereign Multiplatform Verification ===\n');

// 1. Android Manifests
const androidBuildGradle = path.join(CHAT_DIR, 'android', 'build.gradle');
const androidAppBuildGradle = path.join(CHAT_DIR, 'android', 'app', 'build.gradle');
const androidManifest = path.join(CHAT_DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const androidMainActivity = path.join(CHAT_DIR, 'android', 'app', 'src', 'main', 'kotlin', 'com', 'quant', 'chat', 'MainActivity.kt');

assert(fs.existsSync(androidBuildGradle), 'android/build.gradle exists');
assert(fs.existsSync(androidAppBuildGradle), 'android/app/build.gradle exists');
assert(fs.existsSync(androidManifest), 'android/app/src/main/AndroidManifest.xml exists');
assert(fs.existsSync(androidMainActivity), 'android/app/src/main/kotlin/com/quant/chat/MainActivity.kt exists');

if (fs.existsSync(androidAppBuildGradle)) {
  const gradle = fs.readFileSync(androidAppBuildGradle, 'utf8');
  assert(gradle.includes('namespace "com.quant.chat"'), 'App build.gradle specifies namespace com.quant.chat');
  assert(gradle.includes('compileSdk 36'), 'App build.gradle specifies compileSdk 36');
  assert(gradle.includes('JavaVersion.VERSION_17'), 'App build.gradle specifies Java 17 compatibility');
}

if (fs.existsSync(androidManifest)) {
  const manifest = fs.readFileSync(androidManifest, 'utf8');
  assert(manifest.includes('package="com.quant.chat"'), 'AndroidManifest has com.quant.chat package');
  assert(manifest.includes('android.permission.CAMERA'), 'AndroidManifest has CAMERA permission');
  assert(manifest.includes('android.permission.RECORD_AUDIO'), 'AndroidManifest has RECORD_AUDIO permission');
  assert(manifest.includes('android.permission.INTERNET'), 'AndroidManifest has INTERNET permission');
  assert(manifest.includes('android.permission.BLUETOOTH'), 'AndroidManifest has BLUETOOTH permission');
  assert(manifest.includes('android.permission.VIBRATE'), 'AndroidManifest has VIBRATE permission');
}

// 2. iOS Manifests
const iosPodfile = path.join(CHAT_DIR, 'ios', 'Podfile');
const iosInfoPlist = path.join(CHAT_DIR, 'ios', 'Runner', 'Info.plist');
const iosAppDelegate = path.join(CHAT_DIR, 'ios', 'Runner', 'AppDelegate.swift');

assert(fs.existsSync(iosPodfile), 'ios/Podfile exists');
assert(fs.existsSync(iosInfoPlist), 'ios/Runner/Info.plist exists');
assert(fs.existsSync(iosAppDelegate), 'ios/Runner/AppDelegate.swift exists');

if (fs.existsSync(iosInfoPlist)) {
  const plist = fs.readFileSync(iosInfoPlist, 'utf8');
  assert(plist.includes('NSCameraUsageDescription'), 'Info.plist has NSCameraUsageDescription');
  assert(plist.includes('NSMicrophoneUsageDescription'), 'Info.plist has NSMicrophoneUsageDescription');
  assert(plist.includes('NSPhotoLibraryUsageDescription'), 'Info.plist has NSPhotoLibraryUsageDescription');
  assert(plist.includes('com.quant.chat'), 'Info.plist has bundle identifier com.quant.chat');
}

// 3. Web Manifests
const webIndex = path.join(CHAT_DIR, 'web', 'index.html');
const webManifest = path.join(CHAT_DIR, 'web', 'manifest.json');

assert(fs.existsSync(webIndex), 'web/index.html exists');
assert(fs.existsSync(webManifest), 'web/manifest.json exists');

if (fs.existsSync(webIndex)) {
  const html = fs.readFileSync(webIndex, 'utf8');
  assert(html.includes('#090A0E'), 'web/index.html uses Obsidian theme #090A0E');
  assert(html.includes('QuantChat · Sovereign E2EE Communications'), 'web/index.html has title QuantChat · Sovereign E2EE Communications');
}

// 4. Windows Manifests
const winCMake = path.join(CHAT_DIR, 'windows', 'CMakeLists.txt');
const winMain = path.join(CHAT_DIR, 'windows', 'runner', 'main.cpp');
const winFlutterWindow = path.join(CHAT_DIR, 'windows', 'runner', 'flutter_window.cpp');

assert(fs.existsSync(winCMake), 'windows/CMakeLists.txt exists');
assert(fs.existsSync(winMain), 'windows/runner/main.cpp exists');
assert(fs.existsSync(winFlutterWindow), 'windows/runner/flutter_window.cpp exists');

// 5. macOS and Linux
const macPodfile = path.join(CHAT_DIR, 'macos', 'Podfile');
const macInfoPlist = path.join(CHAT_DIR, 'macos', 'Runner', 'Info.plist');
const linuxCMake = path.join(CHAT_DIR, 'linux', 'CMakeLists.txt');
const linuxMain = path.join(CHAT_DIR, 'linux', 'runner', 'main.cc');

assert(fs.existsSync(macPodfile), 'macos/Podfile exists');
assert(fs.existsSync(macInfoPlist), 'macos/Runner/Info.plist exists');
assert(fs.existsSync(linuxCMake), 'linux/CMakeLists.txt exists');
assert(fs.existsSync(linuxMain), 'linux/runner/main.cc exists');

// 6. Invariant Checks across all .dart files
console.log('\n=== Invariant Assertion Checks across quant_chat Dart Files ===');
function scanDir(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...scanDir(full));
    else if (full.endsWith('.dart')) files.push(full);
  }
  return files;
}

const dartFiles = scanDir(CHAT_DIR);
console.log(`Auditing ${dartFiles.length} Dart source files...`);

const emojiRegex = /[\u{1F000}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2600}-\u{27BF}]|[\u{2B50}-\u{2B55}]/u;
const clipPathRegex = /(\.clipPath\s*\(|canvas\.clipPath\s*\()/;

let emojiViolations = 0;
let clipPathViolations = 0;

for (const file of dartFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(CHAT_DIR, file);

  // Check emoji
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const match = line.match(emojiRegex);
    if (match) {
      const code = match[0].codePointAt(0);
      if (code !== 0x2318) { // allow command key symbol if any
        console.error(`Violation: Raw Unicode emoji in ${relPath}:${idx + 1}: ${line.trim()}`);
        emojiViolations++;
      }
    }
  });

  // Check clipPath in lib/
  if (file.includes('lib')) {
    if (clipPathRegex.test(content)) {
      console.error(`Violation: Skia clipPath in ${relPath}`);
      clipPathViolations++;
    }
  }
}

assert(emojiViolations === 0, `ZERO raw Unicode emojis across all files (found: ${emojiViolations})`);
assert(clipPathViolations === 0, `ZERO Skia clipPath calls in lib/ (found: ${clipPathViolations})`);

// 7. Verify Domain Models & Screens
const chatModels = fs.readFileSync(path.join(CHAT_DIR, 'lib', 'models', 'chat_models.dart'), 'utf8');
assert(chatModels.includes('pending'), 'MessageDeliveryStatus has pending status');
assert(chatModels.includes('sent'), 'MessageDeliveryStatus has sent status');
assert(chatModels.includes('delivered'), 'MessageDeliveryStatus has delivered status');
assert(chatModels.includes('read'), 'MessageDeliveryStatus has read status');
assert(chatModels.includes('isDisappearing'), 'ChatMessage has isDisappearing');
assert(chatModels.includes('serverDestructionCode'), 'ChatMessage has serverDestructionCode');
assert(chatModels.includes('CallParticipant'), 'chat_models has CallParticipant');

const conversationScreen = fs.readFileSync(path.join(CHAT_DIR, 'lib', 'screens', 'conversation_screen.dart'), 'utf8');
assert(conversationScreen.includes('Icons.access_time_rounded'), 'conversation_screen has clock icon for pending');
assert(conversationScreen.includes('Icons.check_rounded'), 'conversation_screen has single check for sent');
assert(conversationScreen.includes('Color(0xFF94A3B8)'), 'conversation_screen has double check grey for delivered');
assert(conversationScreen.includes('Color(0xFFFF8C42)'), 'conversation_screen has double check molten amber for read');
assert(conversationScreen.includes('_scrubAudioProgress'), 'conversation_screen has audio waveform scrubber');
assert(conversationScreen.includes('_cycleAudioPlaybackSpeed'), 'conversation_screen has 1.0x/1.5x/2.0x speed toggle');
assert(conversationScreen.includes('410 Server Destruction'), 'conversation_screen has 410 server destruction countdown');
assert(conversationScreen.includes('HTTP 410 GONE'), 'conversation_screen has HTTP 410 GONE destruction tombstone');

const callScreen = fs.readFileSync(path.join(CHAT_DIR, 'lib', 'screens', 'call_screen.dart'), 'utf8');
assert(callScreen.includes('_buildFloatingParticipantStrip'), 'call_screen has floating participant grid');
assert(callScreen.includes('_toggleMute'), 'call_screen has mute mic');
assert(callScreen.includes('_switchCamera'), 'call_screen has switch camera');
assert(callScreen.includes('_toggleScreenShare'), 'call_screen has screen share toggle');

const audioSpaceScreen = fs.readFileSync(path.join(CHAT_DIR, 'lib', 'screens', 'audio_space_screen.dart'), 'utf8');
assert(audioSpaceScreen.includes('_toggleStageScreenShare'), 'audio_space_screen has screen share toggle');
assert(audioSpaceScreen.includes('_buildStageScreenShareBanner'), 'audio_space_screen has stage screen share banner');

console.log(`\n===========================================`);
console.log(`Summary: ${testsPassed} Passed, ${testsFailed} Failed`);
console.log(`===========================================`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('ALL VERIFICATIONS GREEN & PASSING!');
}
