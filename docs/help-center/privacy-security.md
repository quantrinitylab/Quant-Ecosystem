# Privacy & Security

## Our Privacy Philosophy

Quant is built on the principle that privacy is a fundamental right. We designed our system so that even Quant cannot access your data.

## End-to-End Encryption

### How It Works

1. When you create data, it is encrypted on your device using AES-256-GCM
2. Only you hold the encryption keys (derived from your passphrase)
3. Encrypted data syncs to the cloud (if sync is enabled)
4. Quant servers store only encrypted blobs
5. When you access data on another device, it is decrypted locally

### What is Encrypted

- Email body and attachments
- Files in Drive
- Document content
- Calendar event details
- Chat messages
- Task descriptions
- Photo files
- Note content

### What is Not Encrypted (Metadata)

Minimal metadata required for routing (encrypted where possible):

- Email sender/recipient addresses (needed for delivery)
- File names (encrypted option available)
- Timestamps (needed for sync ordering)
- File sizes (needed for storage management)

## Zero-Knowledge Architecture

Quant uses a zero-knowledge design:

- Servers never see plaintext data
- Authentication does not reveal your passphrase
- Search indexes are encrypted client-side
- Even in a server breach, data remains encrypted

## Data Residency

Choose where your encrypted data is stored:

- United States (us-east-1)
- European Union (eu-west-1)
- Self-hosted (your infrastructure)

Change data region: Settings > Privacy > Data Region

## Privacy Controls

### Data Collection

Quant collects the minimum data necessary:

- Account email (for authentication)
- Encrypted data blobs (for sync)
- Anonymous usage analytics (opt-out available)
- Crash reports (opt-out available)

### Opt-Out Options

Settings > Privacy:

- [ ] Usage analytics
- [ ] Crash reports
- [ ] Product improvement data
- [ ] Email communications

### Third-Party Access

Quant never shares your data with third parties. No advertising, no data brokers, no partnerships that involve your data.

## Security Features

### Device Management

- View all connected devices
- Revoke device access remotely
- Set device trust levels
- Automatic lock after inactivity

### Passphrase Requirements

Recommendations:

- Minimum 12 characters
- Mix of words (passphrase style recommended)
- Not reused from other services
- Stored in a password manager

### Recovery Key

Your recovery key is the only way to regain access if you forget your passphrase:

- Generated at account creation
- Download and store securely (not on the same device)
- Never stored on Quant servers
- Can regenerate a new one (invalidates the old)

## Compliance

### GDPR (EU General Data Protection Regulation)

- Right to access: Export all your data anytime
- Right to erasure: Delete your account and all data
- Right to portability: Standard export formats
- Data minimization: We collect only what is necessary
- DPO contact: dpo@quant.app

### SOC 2 Type II

Annual audit covering:

- Security controls
- Availability
- Processing integrity
- Confidentiality
- Privacy

### HIPAA (Enterprise)

Enterprise plan includes:

- BAA (Business Associate Agreement)
- Additional access controls
- Audit logging
- Data retention policies

### Other Compliance

- CCPA (California Consumer Privacy Act)
- ISO 27001 (in progress)
- FIPS 140-2 (encryption modules)

## Security Practices

### Infrastructure Security

- All servers in SOC 2 compliant data centers
- Network segmentation and firewalls
- DDoS protection
- Regular vulnerability scanning
- 24/7 security monitoring

### Application Security

- Regular penetration testing
- Bug bounty program
- Dependency vulnerability scanning
- Code review for all changes
- Automated security testing in CI/CD

### Incident Response

If a security incident occurs:

1. Immediate containment and investigation
2. User notification within 72 hours
3. Transparent incident report published
4. Remediation and prevention measures

## Reporting Security Issues

Report vulnerabilities responsibly:

- Email: security@quant.app
- PGP key available at quant.app/.well-known/security.txt
- Bug bounty rewards for valid reports
- We will not pursue legal action for good-faith research
