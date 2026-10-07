# GDPR Compliance Framework

## Overview

The General Data Protection Regulation (EU 2016/679) applies to the Quant platform as it processes personal data of EU/EEA residents.

## Data Subject Rights (Chapter III)

### Article 15 - Right of Access

- **Implementation**: Data export API at `/api/v1/privacy/export`
- **Response Time**: Within 30 days
- **Format**: JSON and CSV export options
- **Evidence**: Automated data subject access request (DSAR) workflow

### Article 16 - Right to Rectification

- **Implementation**: Self-service profile editing, support ticket for complex corrections
- **Response Time**: Within 30 days without undue delay
- **Evidence**: Correction audit trail maintained

### Article 17 - Right to Erasure

- **Implementation**: Account deletion API with cascade to all services
- **Exceptions**: Legal retention requirements, legitimate interest
- **Response Time**: Within 30 days
- **Evidence**: Deletion confirmation and audit log

### Article 20 - Right to Data Portability

- **Implementation**: Machine-readable export (JSON) of user-provided data
- **Scope**: Data provided by consent or contract
- **Evidence**: Export includes all Article 20 eligible data categories

## Governance

### Data Protection Officer (Article 37)

- DPO appointed and registered with supervisory authority
- Contact: dpo@quant.app
- Independent reporting line to board

### Breach Notification (Article 33-34)

- **To Authority**: Within 72 hours of becoming aware
- **To Data Subjects**: Without undue delay when high risk
- **Process**: Automated breach detection, classification, and notification workflow
- **Documentation**: Breach register maintained per Article 33(5)

### Records of Processing (Article 30)

- Maintained for all processing activities
- Includes: purposes, categories, recipients, transfers, retention, security measures
- Updated on each new feature deployment

## Legal Basis (Article 6)

| Processing Activity | Legal Basis                 | Documentation     |
| ------------------- | --------------------------- | ----------------- |
| Account creation    | Contract (6.1.b)            | Terms of Service  |
| Email processing    | Contract (6.1.b)            | Service Agreement |
| Analytics           | Legitimate Interest (6.1.f) | LIA documented    |
| Marketing emails    | Consent (6.1.a)             | Consent records   |
| Security logging    | Legitimate Interest (6.1.f) | LIA documented    |
| Payment processing  | Contract (6.1.b)            | Payment Terms     |

## Security Measures (Article 32)

- Encryption at rest: AES-256-GCM
- Encryption in transit: TLS 1.3
- Access control: RBAC with least privilege
- Pseudonymization: Applied to analytics data
- Regular security testing: Quarterly pen tests
- Incident response: 24/7 security operations

## International Transfers (Chapter V)

- Primary data storage: EU region
- Sub-processors: Assessed for adequacy decisions or SCCs
- Transfer Impact Assessments: Conducted per EDPB guidance
