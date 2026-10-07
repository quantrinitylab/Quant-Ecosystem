# QuantChat — E2EE & Multi-Device Cryptographic Architecture

**Status:** Target-state security contract  
**Scope:** Private messaging, groups, attachments, device enrollment, verification, multi-device synchronization, recovery and the Quanty plaintext boundary.

## 1. Security thesis

QuantChat must provide two distinct guarantees:

1. The server can route, deliver, authorize and enforce product policy without requiring access to protected plaintext.
2. Authorized user devices can establish cryptographic sessions and decrypt content without trusting the UI or a single server credential.

E2EE is a protocol boundary, not a visual setting.

Server-side application services must never receive private keys, session secrets or plaintext from an E2EE conversation unless the user explicitly establishes an authorized plaintext boundary on a trusted device.

## 2. Identity hierarchy

Separate:

Human identity
→ account identity
→ device identity
→ cryptographic identity
→ conversation membership
→ session keys.

A user account is not itself an E2EE device.

Every device receives a unique cryptographic identity and independent authorization state.

## 3. Device cryptographic state

Conceptual device record:

Device identity key pair
Signed prekey
One-time prekeys
Key version
Verification state
Trust state
Enrollment timestamp
Revocation timestamp

Private material remains in OS secure storage / hardware-backed keystore where available.

Server stores only public key material and encrypted protocol metadata required for delivery.

## 4. Initial device enrollment

Flow:

account authentication
→ create device identity
→ generate prekeys locally
→ register public prekey bundle
→ authenticate/approve device
→ establish verification relationship
→ activate device
→ synchronize authorized history.

A device is not trusted merely because login succeeded.

Sensitive enrollment can require:
existing trusted device approval
or
step-up authentication
or
recovery mechanism.

## 5. Device verification

Verification states:

unverified
→ verification_pending
→ verified
→ revoked.

Verification may use:
- QR comparison
- safety-number comparison
- trusted-device approval
- secure recovery flow.

UI must make clear that account authentication and cryptographic device verification are different.

## 6. Session establishment

For compatible private conversations, use an established audited E2EE protocol family based on:

X3DH-style authenticated key agreement
+
Double Ratchet-style per-message key evolution.

Protocol selection and implementation must be independently audited before production.

The server routes encrypted envelopes and public key material but does not participate as a plaintext holder.

## 7. Message encryption lifecycle

Sender:

plaintext
→ local composition
→ local encryption
→ ciphertext envelope
→ authenticated transport
→ server routing
→ recipient device
→ local verification/decryption
→ local display.

Server:

ciphertext envelope
→ authorization/routing/delivery metadata
→ ciphertext persistence where policy permits.

Server must never transform E2EE plaintext into notifications, search documents or AI context.

## 8. Message keys

Every message uses fresh derived message-key material according to the selected protocol.

Key state is advanced independently per conversation/device session.

Lost or delayed messages do not permit arbitrary rollback to older key state.

Out-of-order delivery is supported within the protocol's skipped-key policy.

## 9. Group messaging

For small private groups, use a sender-key/group-session model compatible with the selected audited E2EE protocol.

Membership changes trigger cryptographic state changes.

When a member leaves or is removed:
- future protected messages are encrypted under new group state
- removed member must not receive future group keys
- device/session revocation propagates to group cryptographic state.

For large communities/channels, distinguish:
- public/server-readable content where policy allows
- private E2EE conversations where the protocol supports the required scale.

Do not falsely label server-readable community messages as E2EE.

## 10. Multi-device model

Each account may have multiple active devices.

A message sent to an account is encrypted for the authorized device set according to the protocol.

Device sync includes:
- conversation membership
- encrypted message envelopes
- receipts where policy allows
- settings/policy state
- key/session metadata required by clients.

Private key material is not copied through ordinary server APIs.

## 11. Device addition

New device flow:

new device creates keys
→ server registers public bundle
→ existing trusted device or recovery authorizes
→ encrypted bootstrap package is transferred
→ new device verifies
→ new device becomes active.

Bootstrap package must not expose long-lived account master secrets to the server.

## 12. Device removal

When a device is revoked:

server authorization is revoked immediately
→ realtime revocation sent to active session
→ future encrypted delivery excludes device
→ group/session key state is rotated as required
→ indexes/projections are updated
→ audit event emitted.

A previously downloaded ciphertext may remain on the revoked device; revocation prevents future authorized access and key continuation, not physical destruction of already-held bytes.

## 13. Sender-key rotation

Rotation triggers include:
- member removal
- device revocation
- suspicious key change
- explicit security reset
- policy-required periodic rotation.

Rotation state must be durable enough to recover safely after reconnect.

## 14. Key-change handling

If a peer's identity key changes:

do not silently accept it.

Client displays:
- identity changed
- previous verification state
- new verification state
- action required.

Policy may allow temporary restricted communication, but must not silently downgrade trust.

## 15. Attachments / media

Media encryption occurs before upload.

Pipeline:

local plaintext media
→ generated content key
→ encrypt media locally
→ upload ciphertext
→ store object reference
→ encrypt/wrap content key for authorized recipients
→ message carries encrypted metadata/reference.

R2/object storage sees ciphertext.

CDN delivery never implies plaintext access.

View-once media has explicit local lifecycle and server-side expiry metadata.

## 16. Voice notes and calls

Voice notes use the same protected media boundary where the conversation is E2EE.

Call media uses WebRTC encryption plus the application's call security model.

Do not claim that transport encryption automatically equals end-to-end identity authentication.

For highly sensitive calls, participant/device verification status should be visible.

## 17. Backups and recovery

Recovery is a separate security domain.

Possible modes:
- no server-readable backup
- encrypted backup protected by user-controlled recovery secret
- trusted-device recovery
- platform secure backup where cryptographic guarantees are preserved.

Server must not silently convert E2EE backup into plaintext cloud storage.

Recovery UX must clearly state:
what is recoverable
what is not
who can decrypt
what happens after losing all trusted devices.

## 18. Search boundary

E2EE search is primarily local.

Local index may store:
- decrypted message text
- local-only metadata
- conversation references.

Cloud search receives no plaintext unless the user explicitly authorizes a supported plaintext boundary.

Deletion must remove local searchable data according to local retention policy.

## 19. Quanty boundary

Quanty is not automatically entitled to E2EE plaintext.

Supported modes:

### Local Quanty
Runs on the authorized device and may operate over decrypted content according to user permission.

### Explicit plaintext handoff
User selects content/context and grants Quanty a narrowly scoped capability.

### Server Quanty
Can operate only on content that is legitimately server-readable under the conversation's security mode.

A general "AI enabled" toggle must never imply unrestricted plaintext access.

## 20. Notifications

For E2EE messages, notification policy should prefer:
- generic notification
- sender name where allowed
- local decryption on-device for richer preview.

Server push payload must not contain protected message plaintext unless the product's explicit security model permits it.

## 21. Receipts / typing / presence

These are separate metadata channels.

Typing indicators:
ephemeral, TTL-bound.

Presence:
policy-controlled and ephemeral.

Read receipts:
durable metadata only where enabled.

E2EE message content and metadata privacy are separate decisions.

## 22. Cryptographic state persistence

Client stores:
identity private key
session state
ratchet state
skipped message keys
trusted device records
encrypted local message database.

Use secure local storage and authenticated encryption.

Never log cryptographic material.

## 23. Protocol versioning

Every encrypted envelope identifies:
protocol family
protocol version
cipher suite/profile
key epoch
sender device reference
message/session metadata required for decoding.

Unsupported versions fail safely and trigger upgrade/recovery paths.

Never silently reinterpret ciphertext under a different protocol.

## 24. Key transparency / verification infrastructure

Long-term architecture should provide a transparency mechanism for public identity keys.

Goals:
- detect unexpected key replacement
- detect malicious server equivocation
- provide auditable key history
- help devices verify expected identity state.

Transparency data must itself be authenticated and privacy-conscious.

## 25. Cryptographic deletion

"Delete message" and "erase key material" are distinct.

For ephemeral content:
- delete/expire server ciphertext according to retention policy
- remove local plaintext/index
- invalidate associated content keys where the product guarantees cryptographic erasure.

Cryptographic erasure is not a promise that previously exported screenshots or copies disappear.

## 26. Abuse/safety boundary

E2EE does not eliminate safety controls.

Supported controls may include:
- user reporting with explicit evidence selection
- client-side safety classification where legally/policy appropriate
- metadata-based abuse detection
- rate limits
- spam controls
- recipient blocking
- trusted-device security alerts.

Do not secretly decrypt private messages for generalized moderation.

## 27. Admin boundary

Admins can manage:
- account/session authorization
- device revocation
- policy
- abuse workflows
- service health
- retention controls within lawful/product scope.

Admins cannot read E2EE plaintext merely because they have QuantChat admin privileges.

## 28. Audit boundary

Audit records may include:
device enrolled
device verified
device revoked
identity key changed
recovery initiated
security reset
Quanty plaintext grant created/revoked.

Audit must not contain message plaintext or private cryptographic material.

## 29. Security threat model

Threats:
- malicious server operator
- stolen session token
- compromised device
- rogue linked device
- key substitution
- replay
- message reordering
- group membership race
- notification leakage
- backup compromise
- prompt injection through message content
- malicious media
- compromised dependency.

Controls:
least privilege
device verification
key rotation
authenticated encryption
replay protection
versioned envelopes
secure storage
short-lived auth
scoped capabilities
dependency verification
audited protocol implementation.

## 30. Failure states

Key registration unavailable:
do not mark device trusted.

Identity key changed:
require verification decision.

Prekey exhaustion:
retry/refill safely; never fabricate a session.

Decryption failure:
preserve ciphertext and show recoverable state; never silently display corrupted plaintext.

Revoked device reconnect:
authentication may succeed at transport level but protected conversation access remains denied.

Recovery failure:
do not claim historical recovery succeeded.

Protocol mismatch:
request supported version; never downgrade silently.

## 31. Testing

Cryptographic:
known-answer vectors
session establishment
ratchet advancement
out-of-order messages
duplicate/replay messages
lost messages
prekey exhaustion
key rotation
group membership changes
device revoke
identity key changes.

Multi-device:
new device
trusted-device approval
device removal
concurrent devices
offline device reconnect
history bootstrap
partial bootstrap failure.

Privacy:
notification leakage
search leakage
logs
analytics
admin APIs
Quanty access
backup access.

Adversarial:
malicious server
key substitution
replay
downgrade
stale device
compromised session
prompt injection in encrypted content.

Use independently reviewed cryptographic libraries; do not invent cryptographic primitives.

## 32. Muse implementation sequence

E2EE-01 threat model and protocol decision record.
E2EE-02 device identity/key store abstraction.
E2EE-03 public prekey service.
E2EE-04 session establishment abstraction.
E2EE-05 message envelope/encryption boundary.
E2EE-06 multi-device synchronization.
E2EE-07 group key/sender-key lifecycle.
E2EE-08 encrypted media.
E2EE-09 device verification/key transparency.
E2EE-10 backup/recovery.
E2EE-11 local search + Quanty boundary.
E2EE-12 security testing and independent audit preparation.

## Architectural invariant

**QuantChat can route and govern protected communication without becoming a plaintext vault; trust belongs to verified devices, not to a server-admin role or a generic AI permission.**
