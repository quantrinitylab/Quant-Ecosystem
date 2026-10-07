// Verification script for QuanTube Sovereign Multiplatform manifests and features
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TUBE_DIR = path.join(ROOT, 'flutter_apps', 'apps', 'quant_tube');

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

console.log('=== QuanTube Sovereign Multiplatform Verification (Wave 81) ===\n');

// 1. Android Manifests
console.log('--- 1. Android Target Manifests ---');
const androidBuildGradle = path.join(TUBE_DIR, 'android', 'build.gradle');
const androidAppBuildGradle = path.join(TUBE_DIR, 'android', 'app', 'build.gradle');
const androidManifest = path.join(TUBE_DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const androidMainActivity = path.join(TUBE_DIR, 'android', 'app', 'src', 'main', 'kotlin', 'com', 'quant', 'tube', 'MainActivity.kt');
const androidSettingsGradle = path.join(TUBE_DIR, 'android', 'settings.gradle');
const androidGradleProperties = path.join(TUBE_DIR, 'android', 'gradle.properties');
const androidLaunchBg = path.join(TUBE_DIR, 'android', 'app', 'src', 'main', 'res', 'drawable', 'launch_background.xml');
const androidStyles = path.join(TUBE_DIR, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');

assert(fs.existsSync(androidBuildGradle), 'android/build.gradle exists');
assert(fs.existsSync(androidAppBuildGradle), 'android/app/build.gradle exists');
assert(fs.existsSync(androidManifest), 'android/app/src/main/AndroidManifest.xml exists');
assert(fs.existsSync(androidMainActivity), 'android/app/src/main/kotlin/com/quant/tube/MainActivity.kt exists');
assert(fs.existsSync(androidSettingsGradle), 'android/settings.gradle exists');
assert(fs.existsSync(androidGradleProperties), 'android/gradle.properties exists');
assert(fs.existsSync(androidLaunchBg), 'launch_background.xml exists');
assert(fs.existsSync(androidStyles), 'styles.xml exists');

if (fs.existsSync(androidBuildGradle)) {
  const rootGradle = fs.readFileSync(androidBuildGradle, 'utf8');
  assert(rootGradle.includes('8.2.1'), 'build.gradle specifies AGP 8.2.1');
  assert(rootGradle.includes('1.9.22'), 'build.gradle specifies Kotlin 1.9.22');
}

if (fs.existsSync(androidAppBuildGradle)) {
  const gradle = fs.readFileSync(androidAppBuildGradle, 'utf8');
  assert(gradle.includes('namespace "com.quant.tube"'), 'App build.gradle specifies namespace com.quant.tube');
  assert(gradle.includes('applicationId "com.quant.tube"'), 'App build.gradle specifies applicationId com.quant.tube');
  assert(gradle.includes('compileSdk 36'), 'App build.gradle specifies compileSdk 36');
  assert(gradle.includes('targetSdk 36'), 'App build.gradle specifies targetSdk 36');
  assert(gradle.includes('minSdk 24'), 'App build.gradle specifies minSdk 24');
  assert(gradle.includes('JavaVersion.VERSION_17'), 'App build.gradle specifies Java 17 compatibility');
}

if (fs.existsSync(androidManifest)) {
  const manifest = fs.readFileSync(androidManifest, 'utf8');
  assert(manifest.includes('package="com.quant.tube"'), 'AndroidManifest has com.quant.tube package');
  assert(manifest.includes('android.permission.INTERNET'), 'AndroidManifest has INTERNET permission');
  assert(manifest.includes('android.permission.RECORD_AUDIO'), 'AndroidManifest has RECORD_AUDIO permission');
  assert(manifest.includes('android.permission.CAMERA'), 'AndroidManifest has CAMERA permission');
  assert(manifest.includes('android.permission.BLUETOOTH'), 'AndroidManifest has BLUETOOTH permission');
  assert(manifest.includes('android.permission.READ_MEDIA_VIDEO'), 'AndroidManifest has Media Video permission');
  assert(manifest.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'), 'AndroidManifest has Foreground Service Audio/Video permission');
  assert(manifest.includes('io.flutter.embedding.android.ImpellerBackend'), 'AndroidManifest has ImpellerBackend flag');
  assert(manifest.includes('android:supportsPictureInPicture="true"'), 'AndroidManifest has supportsPictureInPicture="true"');
}

// 2. iOS Manifests
console.log('\n--- 2. iOS Target Manifests ---');
const iosPodfile = path.join(TUBE_DIR, 'ios', 'Podfile');
const iosInfoPlist = path.join(TUBE_DIR, 'ios', 'Runner', 'Info.plist');
const iosAppDelegate = path.join(TUBE_DIR, 'ios', 'Runner', 'AppDelegate.swift');
const iosBridgingHeader = path.join(TUBE_DIR, 'ios', 'Runner', 'Runner-Bridging-Header.h');

assert(fs.existsSync(iosPodfile), 'ios/Podfile exists');
assert(fs.existsSync(iosInfoPlist), 'ios/Runner/Info.plist exists');
assert(fs.existsSync(iosAppDelegate), 'ios/Runner/AppDelegate.swift exists');
assert(fs.existsSync(iosBridgingHeader), 'ios/Runner/Runner-Bridging-Header.h exists');

if (fs.existsSync(iosPodfile)) {
  const pod = fs.readFileSync(iosPodfile, 'utf8');
  assert(pod.includes("platform :ios, '14.0'"), 'Podfile targets iOS 14.0');
}

if (fs.existsSync(iosInfoPlist)) {
  const plist = fs.readFileSync(iosInfoPlist, 'utf8');
  assert(plist.includes('<string>com.quant.tube</string>'), 'Info.plist has bundle com.quant.tube');
  assert(plist.includes('<key>FLTEnableImpeller</key>'), 'Info.plist enables FLTEnableImpeller');
  assert(plist.includes('<string>audio</string>'), 'Info.plist enables background audio mode');
  assert(plist.includes('<key>NSCameraUsageDescription</key>'), 'Info.plist has camera permission description');
}

// 3. Web Manifests
console.log('\n--- 3. Web Target Manifests ---');
const webIndex = path.join(TUBE_DIR, 'web', 'index.html');
const webManifest = path.join(TUBE_DIR, 'web', 'manifest.json');

assert(fs.existsSync(webIndex), 'web/index.html exists');
assert(fs.existsSync(webManifest), 'web/manifest.json exists');

if (fs.existsSync(webIndex)) {
  const html = fs.readFileSync(webIndex, 'utf8');
  assert(html.includes('QuanTube · Sovereign Video &amp; Audio Streaming'), 'web/index.html has sovereign luxury title');
  assert(html.includes('#090A0E'), 'web/index.html uses Obsidian theme #090A0E');
  assert(html.includes("renderer: 'canvaskit'"), 'web/index.html configures CanvasKit renderer');
}

// 4. Windows Manifests
console.log('\n--- 4. Windows Desktop Manifests ---');
const winCMake = path.join(TUBE_DIR, 'windows', 'CMakeLists.txt');
const winRunnerCMake = path.join(TUBE_DIR, 'windows', 'runner', 'CMakeLists.txt');
const winMain = path.join(TUBE_DIR, 'windows', 'runner', 'main.cpp');
const winFlutterH = path.join(TUBE_DIR, 'windows', 'runner', 'flutter_window.h');
const winFlutterCpp = path.join(TUBE_DIR, 'windows', 'runner', 'flutter_window.cpp');
const winWin32H = path.join(TUBE_DIR, 'windows', 'runner', 'win32_window.h');
const winWin32Cpp = path.join(TUBE_DIR, 'windows', 'runner', 'win32_window.cpp');
const winUtilsH = path.join(TUBE_DIR, 'windows', 'runner', 'utils.h');
const winUtilsCpp = path.join(TUBE_DIR, 'windows', 'runner', 'utils.cpp');
const winRc = path.join(TUBE_DIR, 'windows', 'runner', 'Runner.rc');
const winResourceH = path.join(TUBE_DIR, 'windows', 'runner', 'resource.h');
const winManifest = path.join(TUBE_DIR, 'windows', 'runner', 'runner.exe.manifest');

assert(fs.existsSync(winCMake), 'windows/CMakeLists.txt exists');
assert(fs.existsSync(winRunnerCMake), 'windows/runner/CMakeLists.txt exists');
assert(fs.existsSync(winMain), 'windows/runner/main.cpp exists');
assert(fs.existsSync(winFlutterH), 'windows/runner/flutter_window.h exists');
assert(fs.existsSync(winFlutterCpp), 'windows/runner/flutter_window.cpp exists');
assert(fs.existsSync(winWin32H), 'windows/runner/win32_window.h exists');
assert(fs.existsSync(winWin32Cpp), 'windows/runner/win32_window.cpp exists');
assert(fs.existsSync(winUtilsH), 'windows/runner/utils.h exists');
assert(fs.existsSync(winUtilsCpp), 'windows/runner/utils.cpp exists');
assert(fs.existsSync(winRc), 'windows/runner/Runner.rc exists');
assert(fs.existsSync(winResourceH), 'windows/runner/resource.h exists');
assert(fs.existsSync(winManifest), 'windows/runner/runner.exe.manifest exists');

if (fs.existsSync(winMain)) {
  const mainCpp = fs.readFileSync(winMain, 'utf8');
  assert(mainCpp.includes('QuanTube Sovereign Stream'), 'windows/runner/main.cpp has window title "QuanTube Sovereign Stream"');
}

// 5. macOS & Linux Manifests
console.log('\n--- 5. macOS & Linux Desktop Manifests ---');
const macPodfile = path.join(TUBE_DIR, 'macos', 'Podfile');
const macPlist = path.join(TUBE_DIR, 'macos', 'Runner', 'Info.plist');
const macWindow = path.join(TUBE_DIR, 'macos', 'Runner', 'MainFlutterWindow.swift');
const linuxCMake = path.join(TUBE_DIR, 'linux', 'CMakeLists.txt');
const linuxApp = path.join(TUBE_DIR, 'linux', 'runner', 'my_application.cc');

assert(fs.existsSync(macPodfile), 'macos/Podfile exists');
assert(fs.existsSync(macPlist), 'macos/Runner/Info.plist exists');
assert(fs.existsSync(macWindow), 'macos/Runner/MainFlutterWindow.swift exists');
assert(fs.existsSync(linuxCMake), 'linux/CMakeLists.txt exists');
assert(fs.existsSync(linuxApp), 'linux/runner/my_application.cc exists');

if (fs.existsSync(macPlist)) {
  const plist = fs.readFileSync(macPlist, 'utf8');
  assert(plist.includes('com.quant.tube'), 'macOS Info.plist has bundle com.quant.tube');
}

if (fs.existsSync(linuxApp)) {
  const cc = fs.readFileSync(linuxApp, 'utf8');
  assert(cc.includes('com.quant.tube'), 'linux application-id is com.quant.tube');
  assert(cc.includes('QuanTube Sovereign Stream'), 'linux window title is "QuanTube Sovereign Stream"');
}

// 6. QuanTube Deep Domain & Screen Artifacts
console.log('\n--- 6. QuanTube Deep Domain & Screen Artifacts ---');
const modelsFile = path.join(TUBE_DIR, 'lib', 'models', 'tube_models.dart');
const repoFile = path.join(TUBE_DIR, 'lib', 'data', 'tube_repository.dart');
const videoDetailFile = path.join(TUBE_DIR, 'lib', 'screens', 'video_detail_screen.dart');
const videoPlayerFile = path.join(TUBE_DIR, 'lib', 'screens', 'video_player_screen.dart');
const creatorStudioFile = path.join(TUBE_DIR, 'lib', 'screens', 'creator_studio_screen.dart');
const channelScreenFile = path.join(TUBE_DIR, 'lib', 'screens', 'channel_screen.dart');
const testFile = path.join(TUBE_DIR, 'test', 'quant_tube_test.dart');

assert(fs.existsSync(modelsFile), 'tube_models.dart exists');
assert(fs.existsSync(repoFile), 'tube_repository.dart exists');
assert(fs.existsSync(videoDetailFile), 'video_detail_screen.dart exists');
assert(fs.existsSync(videoPlayerFile), 'video_player_screen.dart exists');
assert(fs.existsSync(creatorStudioFile), 'creator_studio_screen.dart exists');
assert(fs.existsSync(channelScreenFile), 'channel_screen.dart exists');
assert(fs.existsSync(testFile), 'quant_tube_test.dart exists');

if (fs.existsSync(modelsFile)) {
  const models = fs.readFileSync(modelsFile, 'utf8');
  assert(models.includes('0xFFF59E0B'), 'tube_models.dart includes Sponsor color #F59E0B');
  assert(models.includes('0xFF3B82F6'), 'tube_models.dart includes Self-promo color #3B82F6');
  assert(models.includes('0xFF10B981'), 'tube_models.dart includes Intermission color #10B981');
  assert(models.includes('enum UploadStage'), 'tube_models.dart defines 4-stage UploadStage');
  assert(models.includes('uploading') && models.includes('transcoding') && models.includes('thumbnail') && models.includes('published'), 'UploadStage has 4 sequential stages');
  assert(models.includes('class VideoUploadSession'), 'tube_models.dart defines VideoUploadSession');
  assert(models.includes('class ChannelProfile'), 'tube_models.dart defines ChannelProfile');
}

if (fs.existsSync(repoFile)) {
  const repo = fs.readFileSync(repoFile, 'utf8');
  assert(repo.includes('getPublicUnauthenticatedFeed'), 'tube_repository.dart provides getPublicUnauthenticatedFeed() fallback');
  assert(repo.includes('getChannelProfile'), 'tube_repository.dart provides getChannelProfile()');
}

if (fs.existsSync(videoDetailFile)) {
  const detail = fs.readFileSync(videoDetailFile, 'utf8');
  assert(detail.includes('FloatingMiniPlayer'), 'video_detail_screen.dart defines FloatingMiniPlayer');
  assert(detail.includes('Auto-Skip'), 'video_detail_screen.dart includes Auto-Skip toggle pill');
  assert(detail.includes('0xFFF59E0B') && detail.includes('0xFF3B82F6') && detail.includes('0xFF10B981'), 'video_detail_screen.dart renders timeline segments');
}

if (fs.existsSync(creatorStudioFile)) {
  const studio = fs.readFileSync(creatorStudioFile, 'utf8');
  assert(studio.includes('MultiStageUploadCard') || studio.includes('UploadStage'), 'creator_studio_screen.dart implements multi-stage upload progress');
  assert(studio.includes('Public Feed Active (Zero 401 Authentication Barrier)'), 'creator_studio_screen.dart includes public feed fallback banner');
  assert(studio.includes('Quant Credits Monetization'), 'creator_studio_screen.dart includes QC monetization meter');
}

if (fs.existsSync(channelScreenFile)) {
  const channel = fs.readFileSync(channelScreenFile, 'utf8');
  assert(channel.includes('Public Unauthenticated Feed'), 'channel_screen.dart includes public feed fallback');
  assert(channel.includes('CreatorStudioScreen'), 'channel_screen.dart links to CreatorStudioScreen');
}

console.log(`\n============================================================`);
console.log(`VERIFICATION SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log(`============================================================`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('ALL SOVEREIGN MULTIPLATFORM RUNNER & QUANTUBE CHECKS PASSED PERFECTLY!\n');
}
