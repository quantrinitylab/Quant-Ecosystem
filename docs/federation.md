# Federation & Open Protocols

The `@quant/federation` package implements support for multiple open protocols, enabling interoperability with external services and platforms.

## Supported Protocols

### ActivityPub

Full ActivityPub implementation for decentralized social networking (W3C Recommendation).

- **Actor**: Create and manage ActivityPub actors with cryptographic key pairs
- **Inbox/Outbox**: Process incoming activities and publish outgoing ones
- **WebFinger**: RFC 7033 discovery of actors via `acct:` URIs
- **NodeInfo**: Expose server capabilities and statistics
- **HTTP Signatures**: Sign and verify requests per the HTTP Signatures spec
- **Delivery Queue**: Reliable delivery of activities to remote inboxes
- **Federation Server**: Complete routing for ActivityPub endpoints

### Matrix

Bridge between Quant conversations and Matrix rooms.

- **Bridge Bot**: Bidirectional message forwarding between Quant and Matrix
- **Room Mapper**: Map Quant conversation IDs to Matrix room IDs

### CalDAV (RFC 4791)

Calendar server implementing the CalDAV protocol for calendar synchronization.

- **PROPFIND**: List calendars and calendar resources
- **REPORT**: Query events with time-range filters
- **PUT**: Create or update calendar events (iCalendar format)
- **DELETE**: Remove calendar events
- **iCalendar Serialization**: RFC 5545 compliant VEVENT serialization and parsing

### CardDAV (RFC 6352)

Address book server implementing the CardDAV protocol for contact synchronization.

- **PROPFIND**: List address books and contact resources
- **REPORT**: Search contacts by name or email
- **PUT**: Create or update contacts (vCard format)
- **DELETE**: Remove contacts
- **vCard Serialization**: RFC 6350 (vCard 4.0) serialization and parsing

### IMAP

IMAP adapter providing mailbox access commands.

- **SELECT**: Open a mailbox for read/write access
- **FETCH**: Retrieve message data (headers, body, flags, size)
- **SEARCH**: Find messages matching criteria (from, to, subject, flags, dates)
- **STORE**: Modify message flags
- **COPY**: Copy messages between mailboxes

### POP3

Simple POP3 adapter for message retrieval.

- **USER/PASS**: Authentication
- **STAT**: Mailbox size and message count
- **LIST**: List messages with sizes
- **RETR**: Retrieve full message content
- **DELE**: Mark messages for deletion

### SMTP Relay

Outbound SMTP relay with DKIM signing support.

- **Send**: Queue messages for outbound delivery
- **DKIM Signing**: Configure domain keys and sign outgoing messages (RFC 6376)
- **Statistics**: Track delivery status (queued, sent, failed)

### OAuth2 Provider (RFC 6749)

Full OAuth2 authorization server implementation.

- **Authorization Code + PKCE**: Secure flow for public and confidential clients (RFC 7636)
- **Client Credentials**: Machine-to-machine authentication
- **Token Introspection**: RFC 7662 token status checking
- **Token Revocation**: RFC 7009 token invalidation
- **Refresh Tokens**: Token rotation support

### Webhooks

Webhook management with reliable delivery.

- **Registration**: Register endpoints with event subscriptions
- **HMAC Signing**: SHA-256 payload signatures for verification
- **Retry with Exponential Backoff**: Automatic retries on delivery failure
- **Delivery Tracking**: Monitor webhook delivery status and history

### Public API Rate Limiting

Per-scope rate limiting for API access.

- **Configurable Rules**: Define limits per scope (requests/window)
- **Burst Limits**: Optional burst capacity
- **Client Tracking**: Per-client rate limit state

## Usage

```typescript
import {
  CalDAVServer,
  CardDAVServer,
  IMAPAdapter,
  OAuth2Provider,
  WebhookManager,
  APIKeyManager,
  RateLimitConfig,
} from '@quant/federation';
```

## Architecture

All protocol implementations follow a consistent pattern:

1. Zod schemas for input validation
2. Class-based domain logic
3. In-memory state (pluggable storage backends)
4. Comprehensive test coverage with vitest
