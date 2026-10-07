# COPPA Compliance Framework

## Overview

The Children's Online Privacy Protection Act (COPPA) applies to the Quant platform if it collects personal information from children under 13 years of age, or if it has actual knowledge that users are under 13.

## Applicability

- **Directed to Children**: Platform is NOT directed to children under 13
- **Actual Knowledge**: If user indicates age under 13, COPPA protections activate
- **Mixed Audience**: Platform designed for general audience with age gating

## Verifiable Parental Consent (Section 312.5)

### Methods Available

- Email plus (email to parent with follow-up verification)
- Credit card verification (small charge with parent confirmation)
- Government ID verification via secure form
- Video conference with trained staff

### Implementation

- Age detection at registration (date of birth field)
- Under-13 accounts blocked pending parental consent
- Consent verification workflow with parent email
- Consent records maintained with method and timestamp

## Direct Notice to Parents (Section 312.4)

### Content of Notice

- Types of personal information collected
- How information is used
- Disclosure practices (if any)
- Parent's right to refuse further collection
- Contact information for operator

### Delivery Method

- Email notification to verified parent address
- Notice displayed before any data collection
- Updated notice on material changes to practices

## Data Minimization (Section 312.7)

### Collection Limitation

- Collect ONLY what is reasonably necessary for the specific activity
- No conditioning participation on disclosure of more information than necessary
- No behavioral advertising or profiling for children

### Implementation

| Data Type       | Collected | Purpose                            | Justification                 |
| --------------- | --------- | ---------------------------------- | ----------------------------- |
| Username        | Yes       | Account identification             | Necessary for service         |
| Email (parent)  | Yes       | Parental consent and communication | Required by COPPA             |
| Date of birth   | Yes       | Age verification                   | Required for COPPA compliance |
| Profile photo   | No        | N/A                                | Not necessary                 |
| Location        | No        | N/A                                | Not necessary for children    |
| Behavioral data | No        | N/A                                | Prohibited for children       |

## Parental Access and Control (Section 312.6)

### Parent Rights

- Review personal information collected from child
- Request deletion of child's information
- Refuse further collection or use
- Revoke previously given consent

### Implementation

- Parent dashboard accessible via verified parent account
- Data export for child account (JSON format)
- One-click deletion of child account and all data
- Consent revocation terminates child account

## Data Security (Section 312.8)

- Reasonable procedures to protect confidentiality, security, integrity
- Additional safeguards for children's data beyond standard measures
- Encryption at rest and in transit
- Access limited to minimum necessary personnel
- Annual security review of children's data handling

## Retention Limitation (Section 312.10)

- Retain data only as long as reasonably necessary
- Delete when no longer needed for purpose collected
- Automatic deletion schedule for inactive child accounts (180 days)
- Parent can request immediate deletion at any time

## Third-Party Disclosure

- No disclosure of children's personal information to third parties
- Service providers bound by contract to maintain confidentiality
- No sale of children's personal information under any circumstances

## Safe Harbor Programs

- Consider participation in FTC-approved Safe Harbor program
- Programs provide guidelines and independent assessments
- Programs include: CARU, ESRB, TRUSTe/kidSAFE

## Operator Responsibilities

| Responsibility        | Implementation                          | Evidence                 |
| --------------------- | --------------------------------------- | ------------------------ |
| Post privacy policy   | Child-specific privacy page             | URL and content review   |
| Obtain consent        | Consent workflow with verification      | Consent records database |
| Honor parent requests | Parent dashboard with delete/export     | Request logs             |
| Protect data          | Enhanced encryption and access controls | Security audit reports   |
| Limit retention       | 180-day auto-deletion for inactive      | Deletion logs            |
| No behavioral ads     | Ad-free experience for child accounts   | Configuration audit      |

## Annual Review

- COPPA compliance reviewed annually
- Updates when FTC issues new guidance
- Training for all personnel who may access children's data
- Incident response specific to children's data breaches
