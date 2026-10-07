# Frequently Asked Questions

## General

### What is Quant?

Quant is a privacy-first productivity suite with 13 integrated apps (Mail, Drive, Docs, Calendar, Meet, Chat, Tasks, Code, Sheets, Slides, Photos, Notes, Forms). All data is end-to-end encrypted and stored locally first.

### How is Quant different from Google Workspace or Microsoft 365?

Quant provides similar functionality but with end-to-end encryption by default, local-first architecture, and a zero-knowledge design. Your data is never accessible to Quant servers.

### Is Quant free?

Yes, Quant has a free plan with 5GB storage and access to all 13 apps. Pro ($12/month) adds 100GB storage and advanced AI. Enterprise pricing is custom.

### What platforms does Quant support?

Web (all modern browsers), macOS, Windows, Linux, iOS, and Android. All platforms sync seamlessly.

### Can I use Quant offline?

Yes. Quant is local-first, meaning all apps work fully offline. Data syncs automatically when you reconnect.

## Privacy & Security

### How does end-to-end encryption work?

Your data is encrypted on your device before it ever leaves. Only you (and people you explicitly share with) hold the decryption keys. Quant servers store only encrypted data.

### Can Quant read my data?

No. Quant uses zero-knowledge encryption. Even Quant employees cannot access your plaintext data. This is mathematically guaranteed by the encryption design.

### What happens if I forget my passphrase?

You can recover your account using your recovery key. Without both your passphrase and recovery key, account recovery is impossible due to zero-knowledge encryption. Please store your recovery key safely.

### Is Quant GDPR compliant?

Yes. Quant is fully GDPR compliant with data residency options in the EU. You can export or delete all your data at any time.

### Does Quant train AI on my data?

No. Your data is never used to train AI models. AI features use pre-trained models with zero-retention processing.

### Has Quant been audited?

Yes. Quant holds SOC 2 Type II certification and undergoes annual third-party security audits and penetration testing.

## Accounts

### How do I create an account?

Visit quant.app/signup, enter your email and passphrase. Your encryption keys are generated locally.

### Can I change my email address?

Yes. Go to Settings > Account > Email. You will need to verify the new address.

### How do I delete my account?

Go to Settings > Account > Delete Account. This permanently deletes all your data from Quant servers. Local data remains on your devices until you remove the app.

### Can I export my data?

Yes. Go to Settings > Data > Export. Quant exports in standard formats (MBOX for mail, WebDAV for files, CalDAV for calendar, etc.).

## Pricing & Billing

### What is included in the Free plan?

5GB storage, all 13 apps, end-to-end encryption, basic AI features, up to 3 collaborators per document, and community support.

### What does Pro add?

100GB storage, advanced AI features, unlimited collaborators, priority support, custom integrations, and admin dashboard.

### What is the Enterprise plan?

Unlimited storage, dedicated support with SLA, SSO/SAML, audit logs, DLP, on-premise deployment option, and 99.99% uptime SLA. Contact sales for pricing.

### Can I cancel anytime?

Yes. Cancel anytime from Settings > Billing. You keep access until the end of your billing period.

### Do you offer refunds?

Yes, within 30 days of purchase if you are not satisfied. Contact support@quant.app.

## Technical

### What encryption does Quant use?

AES-256-GCM for data encryption, X25519 for key exchange, Argon2id for key derivation, and Ed25519 for signatures.

### How does real-time collaboration work without compromising encryption?

Quant uses encrypted CRDTs (Conflict-Free Replicated Data Types). Each change is encrypted before transmission. Collaborators share document-specific keys.

### Can I self-host Quant?

Yes, Enterprise customers can self-host Quant on their own infrastructure using Kubernetes or Docker Compose.

### Does Quant support integrations?

Yes. Quant has a REST API, WebSocket API, webhooks, and official SDKs for JavaScript, Python, Go, and Rust.

### What is local-first architecture?

Local-first means your data is stored on your device as the primary copy. Cloud sync is optional and encrypted. Apps work fully offline and sync when connected.

### How much bandwidth does sync use?

Quant uses incremental sync with CRDTs, so only changes are transmitted. Typical usage is under 50MB/day for active users.

## Migration

### Can I import from Google Workspace?

Yes. Quant supports importing Mail (IMAP), Drive (files), Docs (Google Docs format), Calendar (CalDAV), and Contacts (CardDAV) from Google Workspace.

### Can I import from Microsoft 365?

Yes. Import Outlook mail, OneDrive files, Word/Excel/PowerPoint documents, and calendar events.

### How long does migration take?

Depending on data volume: typically 1-4 hours for personal accounts, 1-7 days for large organizational migrations.

### Will my sharing links still work?

Quant provides redirect support for imported sharing links during a transition period. New sharing links use Quant's format.
