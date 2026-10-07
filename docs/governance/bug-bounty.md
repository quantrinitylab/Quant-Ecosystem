# Bug Bounty Program

## Overview

The Quant Bug Bounty Program rewards security researchers who responsibly discover and report vulnerabilities in our platform.

## Program Structure

### Eligibility

- Open to all security researchers worldwide
- Must be 18+ years old (or have parental consent)
- Must not be a current Quant employee or contractor
- Must not have discovered the vulnerability through privileged access
- Must follow responsible disclosure guidelines

### Registration

Register at [security.quant.app/bounty](https://security.quant.app/bounty) with:

- Valid email address
- Payment information (for rewards)
- Agreement to program terms

## Severity Tiers and Rewards

| Tier     | Severity                                        | CVSS Score | Reward Range     |
| -------- | ----------------------------------------------- | ---------- | ---------------- |
| Critical | Remote code execution, auth bypass, data breach | 9.0-10.0   | $5,000 - $25,000 |
| High     | Privilege escalation, significant data exposure | 7.0-8.9    | $2,000 - $5,000  |
| Medium   | XSS, CSRF, moderate info disclosure             | 4.0-6.9    | $500 - $2,000    |
| Low      | Minor info leaks, best practice violations      | 0.1-3.9    | $100 - $500      |

### Bonus Multipliers

| Condition                | Multiplier |
| ------------------------ | ---------- |
| E2EE bypass              | 3x         |
| Affects all users        | 2x         |
| Novel attack vector      | 1.5x       |
| Includes working exploit | 1.25x      |
| Includes fix suggestion  | 1.1x       |

## Scope

### In Scope

| Target           | Domain/Asset                       |
| ---------------- | ---------------------------------- |
| Web Applications | \*.quant.app                       |
| API              | api.quant.app                      |
| Mobile Apps      | iOS and Android production apps    |
| Desktop Apps     | macOS, Windows, Linux clients      |
| Open Source      | github.com/quant-app/\*            |
| Infrastructure   | Publicly accessible infrastructure |

### In-Scope Vulnerability Types

- Remote code execution
- SQL injection
- Authentication/authorization bypass
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Server-side request forgery (SSRF)
- Insecure direct object references (IDOR)
- E2EE implementation flaws
- Key management vulnerabilities
- Privilege escalation
- Sensitive data exposure
- Business logic flaws

### Out of Scope

- Social engineering attacks
- Physical attacks
- Denial of service (DoS/DDoS)
- Spam or content abuse
- Rate limiting issues
- Missing security headers (unless exploitable)
- Vulnerabilities in third-party services
- Outdated browser-specific issues
- Self-XSS
- Missing best practices without demonstrated impact

## Responsible Disclosure Timeline

| Day | Action                                             |
| --- | -------------------------------------------------- |
| 0   | Researcher submits report                          |
| 1   | Quant acknowledges receipt                         |
| 3   | Quant confirms validity and assigns severity       |
| 7   | Quant provides initial fix timeline                |
| 30  | Standard fix deadline (medium)                     |
| 90  | Maximum disclosure deadline                        |
| 90+ | Public disclosure allowed if unfixed (coordinated) |

### Disclosure Rules

- Do not publicly disclose before fix is deployed
- Do not access data belonging to other users
- Do not perform destructive actions
- Do not exploit vulnerabilities beyond proof of concept
- Report through official channels only
- One report per vulnerability (do not chain for higher payout without discussion)

## Hall of Fame

Top contributors are recognized on [security.quant.app/hall-of-fame](https://security.quant.app/hall-of-fame):

### Annual Awards

- **Top Researcher**: Most impactful findings over the year
- **Most Valuable Report**: Single most critical finding
- **Rising Star**: Best new researcher

### Recognition Includes

- Public acknowledgment (with permission)
- Exclusive Quant swag
- Early access to new features
- Invitation to annual security summit
- LinkedIn/resume letter of recommendation

## Reporting Process

### How to Report

1. Submit via [security.quant.app/report](https://security.quant.app/report)
2. Or email security@quant.app (PGP key available)

### Report Should Include

- Vulnerability type and affected component
- Step-by-step reproduction instructions
- Proof of concept (screenshots, video, code)
- Impact assessment
- Suggested fix (optional, earns bonus)
- Your contact information

### What Happens Next

1. Auto-acknowledgment within 1 hour
2. Human review within 24 hours
3. Severity assessment within 72 hours
4. Reward determination communicated
5. Fix development begins
6. Reporter notified when fix deployed
7. Reward paid within 30 days of fix
