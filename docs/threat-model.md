# Threat Model - STRIDE Analysis

## Overview

This document presents a STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) threat analysis for each service in the Quant Ecosystem.

## Methodology

Each service is analyzed against the six STRIDE categories. Threats are rated by:

- **Likelihood**: 1 (Very Low) to 5 (Very High)
- **Impact**: 1 (Minimal) to 5 (Catastrophic)
- **Risk Score**: Likelihood x Impact

## Service: Identity (services/identity)

| Category               | Threat                                             | Likelihood | Impact | Risk | Mitigation                                              |
| ---------------------- | -------------------------------------------------- | ---------- | ------ | ---- | ------------------------------------------------------- |
| Spoofing               | Credential stuffing attacks against login endpoint | 4          | 5      | 20   | Rate limiting, MFA, breached password detection         |
| Spoofing               | Token forgery via weak JWT signing                 | 2          | 5      | 10   | RS256 signing, short token TTL, key rotation            |
| Tampering              | Session token modification                         | 2          | 5      | 10   | Signed JWTs, server-side session validation             |
| Repudiation            | Login/logout events not tracked                    | 2          | 3      | 6    | Comprehensive audit logging with tamper-evident storage |
| Information Disclosure | User enumeration via login responses               | 3          | 3      | 9    | Generic error messages, timing-safe comparisons         |
| Denial of Service      | Login endpoint flooding                            | 4          | 3      | 12   | Rate limiting, CAPTCHA, IP reputation                   |
| Elevation of Privilege | Role manipulation in JWT claims                    | 2          | 5      | 10   | Server-side role resolution, claim validation           |

## Service: Mail API (services/mail-api)

| Category               | Threat                                | Likelihood | Impact | Risk | Mitigation                                          |
| ---------------------- | ------------------------------------- | ---------- | ------ | ---- | --------------------------------------------------- |
| Spoofing               | Email header spoofing                 | 4          | 4      | 16   | SPF, DKIM, DMARC enforcement                        |
| Tampering              | Email content modification in transit | 2          | 4      | 8    | TLS enforcement, S/MIME support                     |
| Repudiation            | Sent email denial                     | 2          | 3      | 6    | Immutable sent-mail audit log                       |
| Information Disclosure | Email content exposure                | 3          | 5      | 15   | E2E encryption, at-rest encryption, access controls |
| Denial of Service      | Mailbox flooding                      | 4          | 3      | 12   | Rate limiting, spam filtering, storage quotas       |
| Elevation of Privilege | Access to other users mailboxes       | 2          | 5      | 10   | Strict authorization checks, row-level security     |

## Service: Chat API (services/chat-api)

| Category               | Threat                         | Likelihood | Impact | Risk | Mitigation                                       |
| ---------------------- | ------------------------------ | ---------- | ------ | ---- | ------------------------------------------------ |
| Spoofing               | Impersonation in chat channels | 3          | 3      | 9    | Verified identity badges, message signing        |
| Tampering              | Message content modification   | 2          | 3      | 6    | Message integrity hashes, edit history           |
| Repudiation            | Denial of sent messages        | 2          | 2      | 4    | Immutable message store with timestamps          |
| Information Disclosure | Private message leakage        | 3          | 4      | 12   | E2E encryption for DMs, access controls          |
| Denial of Service      | WebSocket connection flooding  | 4          | 3      | 12   | Connection rate limiting, message throttling     |
| Elevation of Privilege | Channel admin escalation       | 2          | 4      | 8    | Role-based access control, permission validation |

## Service: AI API (services/ai-api)

| Category               | Threat                                  | Likelihood | Impact | Risk | Mitigation                                              |
| ---------------------- | --------------------------------------- | ---------- | ------ | ---- | ------------------------------------------------------- |
| Spoofing               | API key theft and reuse                 | 3          | 4      | 12   | Key rotation, IP allowlisting, short TTL                |
| Tampering              | Prompt injection attacks                | 4          | 4      | 16   | Input sanitization, prompt boundaries, output filtering |
| Repudiation            | AI-generated content attribution        | 3          | 3      | 9    | Generation audit trail, content fingerprinting          |
| Information Disclosure | Training data leakage via prompts       | 3          | 4      | 12   | Output filtering, PII detection, guardrails             |
| Denial of Service      | Resource exhaustion via complex prompts | 4          | 3      | 12   | Token limits, request queuing, cost controls            |
| Elevation of Privilege | System prompt extraction                | 3          | 3      | 9    | Prompt isolation, instruction hierarchy                 |

## Service: SMTP Inbound (services/smtp-inbound)

| Category               | Threat                       | Likelihood | Impact | Risk | Mitigation                                    |
| ---------------------- | ---------------------------- | ---------- | ------ | ---- | --------------------------------------------- |
| Spoofing               | Sender address spoofing      | 5          | 3      | 15   | SPF/DKIM/DMARC validation, reputation scoring |
| Tampering              | Email modification via relay | 2          | 4      | 8    | TLS enforcement, ARC headers                  |
| Repudiation            | Mail delivery denial         | 2          | 2      | 4    | Delivery receipts, audit logging              |
| Information Disclosure | TLS downgrade attacks        | 3          | 4      | 12   | STARTTLS enforcement, MTA-STS                 |
| Denial of Service      | Spam/bounce flooding         | 5          | 3      | 15   | Rate limiting, greylisting, spam filtering    |
| Elevation of Privilege | Mail routing manipulation    | 2          | 4      | 8    | Strict routing rules, domain verification     |

## Service: Search (services/search)

| Category               | Threat                              | Likelihood | Impact | Risk | Mitigation                                |
| ---------------------- | ----------------------------------- | ---------- | ------ | ---- | ----------------------------------------- |
| Spoofing               | Search result manipulation          | 2          | 3      | 6    | Result integrity verification             |
| Tampering              | Index poisoning                     | 2          | 4      | 8    | Input validation, index integrity checks  |
| Information Disclosure | Cross-user data leakage in results  | 3          | 5      | 15   | Tenant isolation, access-filtered queries |
| Denial of Service      | Complex query resource exhaustion   | 4          | 3      | 12   | Query complexity limits, timeouts         |
| Elevation of Privilege | Accessing restricted search indexes | 2          | 4      | 8    | Index-level ACLs, query authorization     |

## Cross-Cutting Concerns

### Network Security

- All inter-service communication uses mTLS (Istio STRICT mode)
- Network policies enforce deny-by-default with explicit allow rules
- External traffic filtered through WAF and DDoS protection

### Data Protection

- AES-256-GCM encryption at rest for all personal data
- TLS 1.3 enforced for all data in transit
- Key rotation every 90 days via Secret Manager

### Monitoring and Response

- All security events logged to tamper-evident audit trail
- Real-time alerting on anomalous patterns
- Incident response playbooks for each threat category

## Risk Matrix Summary

| Risk Level       | Count | Action                             |
| ---------------- | ----- | ---------------------------------- |
| Critical (20-25) | 1     | Immediate remediation required     |
| High (12-19)     | 14    | Remediation within current sprint  |
| Medium (6-11)    | 12    | Planned remediation within quarter |
| Low (1-5)        | 3     | Accept or monitor                  |
