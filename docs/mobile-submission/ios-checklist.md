# iOS App Store Submission Checklist

## App Store Connect Setup

- [ ] Apple Developer Program membership active
- [ ] App ID registered in Developer Portal
- [ ] Bundle ID matches project configuration
- [ ] Provisioning profiles created (distribution)
- [ ] Signing certificate valid (not expiring within 30 days)

## Build Requirements

- [ ] Archive built with Release configuration
- [ ] Bitcode enabled (if required)
- [ ] Minimum iOS version set (iOS 16.0+)
- [ ] All architectures included (arm64)
- [ ] No simulator code in release build
- [ ] App thinning configured

## App Store Metadata

### Required Fields

- [ ] App name (30 character max)
- [ ] Subtitle (30 character max)
- [ ] Description (4000 character max)
- [ ] Keywords (100 character max, comma separated)
- [ ] Category: Productivity (primary), Social Networking (secondary)
- [ ] Content rating completed
- [ ] Copyright information
- [ ] Privacy policy URL
- [ ] Support URL

### Screenshots

Required sizes:

- [ ] iPhone 6.7" (1290 x 2796) - iPhone 15 Pro Max
- [ ] iPhone 6.5" (1284 x 2778) - iPhone 14 Plus
- [ ] iPhone 5.5" (1242 x 2208) - iPhone 8 Plus
- [ ] iPad Pro 12.9" (2048 x 2732) - 6th gen
- [ ] iPad Pro 12.9" (2048 x 2732) - 2nd gen

Screenshot requirements:

- [ ] Minimum 3, maximum 10 per device size
- [ ] No alpha channel
- [ ] PNG or JPEG format
- [ ] No device frames in images (Apple adds them)
- [ ] Accurate representation of app functionality

### App Preview Videos (Optional)

- [ ] 15-30 seconds duration
- [ ] Captured on device (not simulator)
- [ ] No misleading content
- [ ] Appropriate for all ages

## Privacy and Compliance

### App Privacy (Nutrition Labels)

- [ ] Data collection practices declared
- [ ] Data types categorized:
  - Contact info (email, name)
  - Identifiers (user ID)
  - Usage data (product interaction)
  - Diagnostics (crash data, performance)
- [ ] Data linked to identity declared
- [ ] Data used for tracking declared (or App Tracking Transparency)

### Export Compliance

- [ ] Encryption usage declared
- [ ] ECCN classification (5D002 for E2EE)
- [ ] Export compliance documentation on file
- [ ] Annual self-classification report submitted (by Feb 1)

### App Tracking Transparency

- [ ] ATT framework integrated (if tracking)
- [ ] Purpose string provided in Info.plist
- [ ] Pre-permission prompt implemented (if applicable)

## Technical Requirements

### Performance

- [ ] Launch time < 2 seconds (cold start)
- [ ] No memory leaks detected (Instruments)
- [ ] No excessive battery drain
- [ ] Network calls handle offline gracefully
- [ ] Background tasks registered properly

### Accessibility

- [ ] VoiceOver support tested
- [ ] Dynamic Type support
- [ ] Sufficient color contrast
- [ ] Touch targets minimum 44x44pt
- [ ] Accessibility labels on all interactive elements

### Permissions

Each permission has a purpose string in Info.plist:

- [ ] Camera (if used): "Used for profile photos and document scanning"
- [ ] Photo Library: "Used to attach images to messages"
- [ ] Notifications: "Receive message and activity notifications"
- [ ] Contacts (if used): "Find friends using Quant"
- [ ] Microphone (if used): "Record voice messages"
- [ ] Face ID/Touch ID: "Secure app access with biometrics"

## Review Information

- [ ] Demo account credentials provided
- [ ] Notes for reviewer explaining key features
- [ ] Contact information for review team questions
- [ ] Any special configuration documented

## Pre-Submission Verification

- [ ] TestFlight build tested by internal team
- [ ] TestFlight build tested by external beta testers
- [ ] All third-party SDKs are App Store compliant
- [ ] No private API usage
- [ ] No UIWebView usage (deprecated)
- [ ] Rate limiting on server side functional
- [ ] Deep links working correctly
- [ ] Universal links configured and tested
- [ ] Push notifications working end-to-end
- [ ] In-App Purchases configured (if applicable)
- [ ] Subscription management working (if applicable)
- [ ] Account deletion functionality implemented (required)
- [ ] Sign in with Apple implemented (if other social logins exist)
