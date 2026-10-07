# Sunset Policy

## Overview

This policy defines how Quant retires features, apps, and APIs while protecting user data and providing adequate transition time.

## Sunset Criteria

A feature or app may be considered for sunset when:

1. **Low Usage**: Active users < 1% of total user base for 3 consecutive months
2. **High Cost**: Maintenance cost exceeds 5x the value delivered (measured by engagement)
3. **Superseded**: A better alternative exists within the platform
4. **Security Risk**: Cannot be maintained to current security standards
5. **Strategic Misalignment**: No longer fits product direction (requires Product Council vote)

## User Notification Timeline

### 90-Day Notification Guarantee

No feature will be removed with less than 90 days advance notice. The timeline:

| Day | Action                                                                       |
| --- | ---------------------------------------------------------------------------- |
| -90 | Public announcement: blog post, in-app notification, email to affected users |
| -90 | Documentation updated with sunset notice and migration guide                 |
| -75 | Reminder notification to users who have not migrated                         |
| -60 | Second reminder with migration assistance offer                              |
| -45 | Feature marked as "Legacy" in UI                                             |
| -30 | Final reminder, data export prompt                                           |
| -14 | Last chance notification                                                     |
| -7  | Feature enters read-only mode (if applicable)                                |
| 0   | Feature disabled, data preserved for 30 additional days                      |
| +30 | Data permanently deleted (unless exported)                                   |

### Notification Channels

- Email to all affected users
- In-app banner when using the feature
- Blog post on blog.quant.app
- Social media announcement
- Community Discord/forum post
- API deprecation header (for developer APIs)

## Data Export Guarantee

### User Rights

Before any sunset:

- Users can export ALL their data from the feature
- Export available in standard, open formats (JSON, CSV, ZIP)
- Bulk export API available for developers
- Export functionality remains available until Day +30

### Supported Export Formats

| Data Type | Format              | Standard                  |
| --------- | ------------------- | ------------------------- |
| Messages  | JSON, MBOX          | RFC 4155                  |
| Documents | HTML, Markdown, PDF | Original format preserved |
| Files     | Original format     | ZIP archive               |
| Contacts  | vCard (.vcf)        | RFC 6350                  |
| Calendar  | iCalendar (.ics)    | RFC 5545                  |
| Tasks     | JSON, CSV           | Todoist/Asana compatible  |
| Settings  | JSON                | Platform-specific schema  |

### Data Portability

- Migration tools provided for common alternatives
- API documentation for custom migrations
- Support team available to assist with migration
- Enterprise customers receive dedicated migration engineer

## Migration Path Requirements

### For Every Sunset, Provide:

1. **Migration Guide**: Step-by-step instructions for moving to alternative
2. **Automated Migration**: One-click migration tool where possible
3. **Data Mapping**: Clear documentation of how data maps to new location
4. **Validation**: Users can verify migration completeness
5. **Rollback Window**: 14 days to undo migration if issues found

### Alternative Requirements

Before sunsetting, the alternative must:

- Cover >= 90% of the sunset feature's use cases
- Be stable and out of beta
- Have documentation comparable to the original
- Be accessible to all user tiers that had access to the original

## API Deprecation

### API Versioning Policy

- APIs follow semver
- Deprecated endpoints return `Deprecation` header
- Minimum 6-month deprecation period for APIs (longer than features)
- SDKs updated to use new endpoints before old ones are removed

### Deprecation Header Example

```http
Deprecation: true
Sunset: Sat, 01 Mar 2025 00:00:00 GMT
Link: <https://docs.quant.app/api/v3/migration>; rel="successor-version"
```

## Exceptions

### Emergency Removal

Features may be removed without 90-day notice only when:

- Active security vulnerability that cannot be patched
- Legal requirement (court order, regulation)
- Feature is being actively exploited to harm users

In emergency cases:

- Users notified immediately with explanation
- Data export provided within 7 days
- Post-mortem published within 30 days

## Governance

### Approval Process

1. Engineering team proposes sunset with data justification
2. Product Council reviews and votes
3. If approved, sunset timeline begins
4. Progress tracked at weekly Product Council
5. Post-sunset review after 30 days (validate no issues)

### Appeals

Users may appeal a sunset decision:

- Submit appeal via support channel
- Must include use case that cannot be met by alternative
- Product Council reviews appeals at next meeting
- Decision communicated within 14 days
