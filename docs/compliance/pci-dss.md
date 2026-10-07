# PCI-DSS Compliance Framework

## Overview

PCI Data Security Standard v4.0 applies to Quant platform components that store, process, or transmit cardholder data (CHD). The platform uses a third-party payment processor to minimize PCI scope.

## Scope Reduction Strategy

- **Tokenization**: Card numbers replaced with tokens at point of entry
- **SAQ-A Eligibility**: All payment pages hosted by payment processor
- **Segmentation**: CDE isolated via network policies and dedicated namespace

## Requirement 1: Network Security Controls

### 1.1 Network Segmentation

- Dedicated `payments` namespace with strict NetworkPolicy
- No direct internet access from payment services
- All traffic routed through internal service mesh

### 1.2 Firewall Configuration

- Default-deny ingress and egress policies
- Explicit allow rules for payment processor endpoints only
- Quarterly review of firewall rules documented

## Requirement 2: Secure Configurations

- No vendor-supplied defaults in production
- System hardening per CIS benchmarks
- Unnecessary services disabled in container images (distroless)

## Requirement 3: Protect Stored Account Data

### 3.1 Encryption of Stored Data

- CHD never stored on Quant infrastructure (tokenized)
- Tokens stored with AES-256-GCM encryption
- Encryption keys managed via dedicated HSM/KMS

### 3.2 Key Management

- Key rotation every 90 days
- Split knowledge and dual control for master keys
- Key destruction procedures documented

## Requirement 4: Encrypt Transmission

- TLS 1.3 enforced for all payment-related communication
- mTLS between payment services (Istio STRICT mode)
- Certificate pinning for payment processor connections

## Requirement 5: Anti-Malware

- Container image scanning via Trivy (CRITICAL/HIGH threshold)
- Runtime protection via container security policies
- No writable filesystem in payment containers

## Requirement 6: Secure Development

- Secure SDLC with security review for payment features
- OWASP Top 10 addressed in development guidelines
- Automated SAST/DAST in CI/CD pipeline

## Requirement 7: Restrict Access

### 7.1 Least Privilege

- Role-based access control for all payment systems
- Just-in-time access for production support
- Quarterly access reviews with evidence

### 7.2 Unique IDs

- Individual accounts for all system access
- No shared or generic accounts
- Service accounts scoped to minimum permissions

## Requirement 8: Identify Users

- Multi-factor authentication for all administrative access
- Password policy: minimum 12 characters, complexity requirements
- Account lockout after 6 failed attempts

## Requirement 9: Physical Access

- Cloud provider responsible (inherited control)
- Provider SOC 2 Type II report reviewed annually

## Requirement 10: Logging and Monitoring

- All access to payment systems logged
- Tamper-evident audit trail
- Real-time alerting on anomalous access patterns
- Log retention: 12 months online, 12 months archived

## Requirement 11: Security Testing

- Quarterly vulnerability scans (internal and external)
- Annual penetration testing
- Continuous file integrity monitoring
- Wireless scanning N/A (cloud infrastructure)

## Requirement 12: Information Security Policy

- Information security policy reviewed annually
- Security awareness training for all personnel
- Incident response plan tested annually
- Third-party service provider management program
