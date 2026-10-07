# Mobile App Submission Timeline

## Overview

This document outlines the submission timeline for Quant mobile applications on iOS App Store and Google Play Store.

## Pre-Submission (2 weeks before)

### Week -2: Preparation

- [ ] All features frozen for release
- [ ] QA testing complete on physical devices
- [ ] Performance benchmarks met (startup < 2s, 60fps scrolling)
- [ ] Accessibility audit passed (WCAG 2.1 AA)
- [ ] Localization complete for all supported languages
- [ ] App size optimized (< 50MB download, < 150MB installed)

### Week -1: Assets and Metadata

- [ ] App Store screenshots captured (all device sizes)
- [ ] Google Play screenshots captured (phone + tablet)
- [ ] Promotional graphics created
- [ ] App description written and localized
- [ ] Keywords/tags researched and set
- [ ] Privacy policy URL live and current
- [ ] Support URL operational
- [ ] What's New / Release Notes drafted

## Submission Phase

### Day 0: Submit to Review

**iOS App Store:**

- Build uploaded via Xcode or Transporter
- App Store Connect metadata filled
- Review information provided (test account, notes)
- Export compliance declared
- Content rating questionnaire completed
- Pricing and availability set

**Google Play:**

- AAB uploaded to Play Console
- Store listing completed
- Content rating questionnaire completed
- Target audience and content declarations
- Data safety form completed
- Release track selected (internal > closed > open > production)

## Review Timeline

### iOS App Store

| Step                | Expected Duration |
| ------------------- | ----------------- |
| Processing          | 1-2 hours         |
| Waiting for Review  | 1-3 days          |
| In Review           | 1-2 days          |
| Approved / Rejected | -                 |
| **Total**           | **2-7 days**      |

### Google Play

| Step                | Expected Duration |
| ------------------- | ----------------- |
| Processing          | 1-2 hours         |
| In Review           | 1-3 days          |
| Approved / Rejected | -                 |
| **Total**           | **1-5 days**      |

## Post-Submission

### If Approved

1. Schedule release date (if not immediate)
2. Coordinate with marketing for announcement
3. Monitor crash reports in first 24 hours
4. Enable staged rollout (10% > 25% > 50% > 100%)
5. Monitor app store reviews and respond

### If Rejected

1. Read rejection reason carefully
2. Address all noted issues
3. Respond in Resolution Center (iOS) or appeal (Android)
4. Resubmit with explanation of changes
5. Allow additional review time (typically shorter for resubmission)

## Common Rejection Reasons

### iOS

- Crashes or bugs
- Incomplete information
- Inaccurate metadata
- Privacy concerns (missing purpose strings)
- Guideline 4.2 (minimum functionality)

### Android

- Policy violations
- Broken functionality
- Misleading store listing
- Data safety form inaccuracies
- Target audience issues

## Quarterly Release Schedule

| Quarter | Code Freeze | Submit | Expected Live |
| ------- | ----------- | ------ | ------------- |
| Q1      | Jan 15      | Jan 22 | Jan 29        |
| Q2      | Apr 15      | Apr 22 | Apr 29        |
| Q3      | Jul 15      | Jul 22 | Jul 29        |
| Q4      | Oct 15      | Oct 22 | Oct 29        |

## Emergency / Hotfix Releases

For critical security or crash fixes:

1. Skip normal freeze window
2. Fast-track QA (regression only)
3. Submit with expedited review request (iOS)
4. Use managed publishing for immediate release (Android)
5. Expected timeline: 24-48 hours
