# Release Cadence

## Overview

Quant follows a structured release cadence that balances rapid iteration with stability guarantees.

## Quarterly Major Ships

### Release Train Schedule

| Quarter | Planning | Development    | Stabilization  | Release |
| ------- | -------- | -------------- | -------------- | ------- |
| Q1      | Jan 1-7  | Jan 8 - Feb 21 | Feb 22 - Mar 7 | Mar 8   |
| Q2      | Apr 1-7  | Apr 8 - May 21 | May 22 - Jun 7 | Jun 8   |
| Q3      | Jul 1-7  | Jul 8 - Aug 21 | Aug 22 - Sep 7 | Sep 8   |
| Q4      | Oct 1-7  | Oct 8 - Nov 21 | Nov 22 - Dec 7 | Dec 8   |

### Release Types

| Type   | Cadence   | Content                              | Approval            |
| ------ | --------- | ------------------------------------ | ------------------- |
| Major  | Quarterly | New features, breaking changes       | Product Council     |
| Minor  | Bi-weekly | Enhancements, non-breaking additions | Engineering Lead    |
| Patch  | As needed | Bug fixes, security patches          | On-call engineer    |
| Hotfix | Emergency | Critical fixes                       | Any senior engineer |

## Feature Flag Lifecycle

### Stages

1. **Created**: Flag defined with default off
2. **Development**: Flag used to gate in-progress feature
3. **Testing**: Flag enabled for QA and internal users
4. **Beta**: Flag enabled for beta program participants
5. **Rollout**: Gradual percentage increase (10% > 25% > 50% > 100%)
6. **Stable**: Flag at 100%, code cleanup scheduled
7. **Removed**: Flag and conditional code removed

### Flag Naming Convention

```
[team].[feature].[variant]
```

Examples:

- `mail.smart-compose.enabled`
- `drive.ai-search.model-v2`
- `platform.new-auth-flow.enabled`

### Flag Expiration

- Maximum lifetime: 90 days after reaching 100% rollout
- Cleanup tracked as tech debt if exceeded
- Quarterly flag audit to identify stale flags

### Rollback Triggers

Automatic rollback if any threshold breached during rollout:

- Error rate increases > 0.1% above baseline
- P95 latency increases > 20% above baseline
- Crash rate increases > 0.05% above baseline
- User complaints spike > 3x normal rate

## Staged Rollout Process

### Rollout Plan Template

```
Feature: [Name]
Flag: [flag.name]
Owner: [Engineer]
Start: [Date]

Day 1: 10% (canary)
  - Monitor: errors, latency, user feedback
  - Hold minimum: 24 hours

Day 2-3: 25%
  - Monitor: same + business metrics
  - Hold minimum: 48 hours

Day 4-5: 50%
  - Monitor: same + support tickets
  - Hold minimum: 48 hours

Day 6-7: 100%
  - Full deployment
  - Flag cleanup scheduled
```

### Go/No-Go Criteria

Before advancing rollout percentage:

- [ ] No new errors attributed to feature
- [ ] Latency within budget
- [ ] No increase in support tickets
- [ ] Positive user sentiment (if applicable)
- [ ] No security concerns raised

## Version Numbering

### Semantic Versioning

```
MAJOR.MINOR.PATCH
```

- **MAJOR**: Breaking API changes, major UX overhauls
- **MINOR**: New features, backward-compatible changes
- **PATCH**: Bug fixes, performance improvements

### Platform Version

- Mobile apps: `YEAR.QUARTER.PATCH` (e.g., 2024.3.2)
- API: Standard semver with deprecation notices
- Packages: Standard semver
