# Android / Google Play Submission Checklist

## Google Play Console Setup

- [ ] Google Play Developer account active ($25 one-time fee paid)
- [ ] App created in Google Play Console
- [ ] Package name (applicationId) finalized and unique
- [ ] Signing key uploaded (Play App Signing enrolled)
- [ ] Upload key generated and secured

## Build Requirements

- [ ] Android App Bundle (AAB) format (not APK)
- [ ] Release build with ProGuard/R8 enabled
- [ ] Minimum SDK: API 26 (Android 8.0)
- [ ] Target SDK: API 34 (Android 14) or latest required
- [ ] App size < 150MB (base APK from AAB)
- [ ] 64-bit libraries included
- [ ] Deobfuscation mapping file uploaded (for crash reports)

## Store Listing

### Required Fields

- [ ] App name (30 character max)
- [ ] Short description (80 character max)
- [ ] Full description (4000 character max)
- [ ] Application type: Application
- [ ] Category: Productivity
- [ ] Tags selected (up to 5)
- [ ] Contact email
- [ ] Privacy policy URL

### Graphics

- [ ] App icon: 512 x 512 PNG (32-bit, no alpha)
- [ ] Feature graphic: 1024 x 500 PNG or JPEG
- [ ] Phone screenshots: minimum 2, maximum 8
  - Minimum: 320px, Maximum: 3840px
  - Aspect ratio between 16:9 and 9:16
- [ ] 7-inch tablet screenshots (recommended)
- [ ] 10-inch tablet screenshots (recommended)
- [ ] Promotional video (YouTube URL, optional)

## Content Rating

- [ ] IARC rating questionnaire completed
- [ ] Violence: None
- [ ] Sexuality: None
- [ ] Language: Mild (user-generated content possible)
- [ ] Controlled substances: None
- [ ] Interactive elements: Users interact, shares info, digital purchases

## Data Safety

### Data Collection Declaration

- [ ] Account info (name, email, user ID)
- [ ] Messages (encrypted, not accessible by developer)
- [ ] App activity (app interactions, search history)
- [ ] Device info (crash logs, diagnostics)

### Data Sharing Declaration

- [ ] No data shared with third parties
- [ ] Analytics data collected (anonymized)
- [ ] Crash data collected (for stability)

### Security Practices

- [ ] Data encrypted in transit (TLS 1.3)
- [ ] Data encrypted at rest (E2EE for messages)
- [ ] Users can request data deletion
- [ ] Follows Google Play Families Policy (if applicable)

## Target Audience and Content

- [ ] Target age group: 13+ (not designed for children)
- [ ] App does not primarily target children
- [ ] No ads targeting children
- [ ] COPPA compliance verified

## Technical Requirements

### Performance

- [ ] ANR rate < 0.47% (bad behavior threshold)
- [ ] Crash rate < 1.09% (bad behavior threshold)
- [ ] Startup time < 2 seconds (cold start)
- [ ] Smooth scrolling (no jank > 16ms frames)
- [ ] Battery usage reasonable (no wakelocks)

### Permissions

Only request necessary permissions:

- [ ] `INTERNET` - network access
- [ ] `POST_NOTIFICATIONS` (API 33+) - push notifications
- [ ] `CAMERA` (if used) - profile photos
- [ ] `READ_MEDIA_IMAGES` (API 33+) - attach images
- [ ] `USE_BIOMETRIC` - biometric authentication
- [ ] `RECEIVE_BOOT_COMPLETED` - restart background sync
- [ ] Runtime permissions requested in context

### Android 14+ Requirements

- [ ] Foreground service types declared
- [ ] Photo/video permissions use photo picker
- [ ] Exact alarms only if absolutely necessary
- [ ] Predictive back gesture supported

### Accessibility

- [ ] TalkBack tested
- [ ] Content descriptions on all images
- [ ] Touch targets minimum 48x48dp
- [ ] Color contrast ratio >= 4.5:1
- [ ] No information conveyed by color alone

## Pre-Launch Report

- [ ] Pre-launch report reviewed (automated testing by Google)
- [ ] No critical issues flagged
- [ ] Accessibility warnings addressed
- [ ] Security warnings addressed
- [ ] Stability issues resolved

## Release Management

### Release Tracks

1. **Internal testing** - Up to 100 testers, immediate availability
2. **Closed testing** - Invite-only, review may apply
3. **Open testing** - Anyone can join, review applies
4. **Production** - Full release, review applies

### Staged Rollout Plan

- [ ] Day 1: 10% rollout
- [ ] Day 3: 25% rollout (if crash rate stable)
- [ ] Day 5: 50% rollout (if no critical issues)
- [ ] Day 7: 100% rollout (if metrics healthy)

### Rollback Plan

- [ ] Previous stable version available for immediate rollback
- [ ] Halt rollout button accessible
- [ ] Server-side feature flags for emergency disable
- [ ] Communication template ready for users

## Review Verification

- [ ] App does not violate Google Play Developer Program Policies
- [ ] No deceptive behavior
- [ ] No malicious code
- [ ] Intellectual property rights respected
- [ ] Monetization policies followed
- [ ] User data policy compliance
- [ ] App functions on all declared device types
- [ ] Deep links and app links verified
- [ ] Firebase Cloud Messaging configured
- [ ] Google Play Billing (if in-app purchases)
- [ ] Account deletion option available in app and web
