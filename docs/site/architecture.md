# System Architecture

This document provides an overview of the Quant platform architecture.

## Design Principles

1. **Local-First**: Data is stored and processed on the client device first
2. **End-to-End Encrypted**: All data is encrypted before leaving the device
3. **CRDT-Based Sync**: Conflict-free replicated data types for real-time collaboration
4. **Service-Oriented**: Independent microservices for each domain
5. **AI-Augmented**: AI features integrated at every layer while preserving privacy

## High-Level Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Client Layer    |     |   API Gateway     |     |  Service Layer    |
|                   |     |                   |     |                   |
| - Web App         |<--->| - Auth/Rate Limit |<--->| - Mail Service    |
| - Desktop App     |     | - Load Balancing  |     | - Drive Service   |
| - Mobile App      |     | - WebSocket Proxy |     | - Docs Service    |
| - CLI             |     | - TLS Termination |     | - Calendar Svc    |
+-------------------+     +-------------------+     | - Chat Service    |
                                                    | - Tasks Service   |
                                                    | - AI Service      |
                                                    | - Search Service  |
                                                    | - Sync Engine     |
                                                    +-------------------+
                                                            |
                                                    +-------------------+
                                                    |   Data Layer      |
                                                    |                   |
                                                    | - PostgreSQL      |
                                                    | - Redis           |
                                                    | - S3 (encrypted)  |
                                                    | - Elasticsearch   |
                                                    | - ClickHouse      |
                                                    +-------------------+
```

## Client Architecture

### Local-First Engine

The client maintains a local database (IndexedDB/SQLite) that serves as the source of truth:

- **Local Storage**: All user data stored in encrypted local database
- **CRDT Engine**: Manages conflict-free data structures for collaborative editing
- **Sync Manager**: Handles background sync with the cloud when connected
- **Crypto Layer**: Encrypts/decrypts data using client-held keys

### Encryption Model

```
User Passphrase
      |
      v
Key Derivation (Argon2id)
      |
      v
Master Key
      |
      +--> Document Keys (AES-256-GCM)
      |
      +--> Communication Keys (X25519 + ChaCha20-Poly1305)
      |
      +--> Storage Keys (AES-256-GCM)
```

## Service Architecture

### API Gateway

- Request routing and load balancing
- Authentication and authorization
- Rate limiting per user/plan
- WebSocket connection management
- TLS termination and certificate management

### Core Services

Each service is independently deployable and horizontally scalable:

| Service  | Responsibility                     | Protocol         |
| -------- | ---------------------------------- | ---------------- |
| Auth     | Authentication, SSO, tokens        | REST             |
| Mail     | Email send/receive/storage         | REST + IMAP/SMTP |
| Drive    | File storage and sharing           | REST + WebDAV    |
| Docs     | Document editing and collaboration | REST + WebSocket |
| Calendar | Events, scheduling, availability   | REST + CalDAV    |
| Chat     | Messaging, channels, threads       | REST + WebSocket |
| Tasks    | Projects, tasks, assignments       | REST             |
| Code     | IDE, execution, version control    | REST + WebSocket |
| Sync     | CRDT sync engine                   | WebSocket        |
| AI       | ML inference, embeddings, search   | REST + gRPC      |
| Search   | Full-text and semantic search      | REST             |

### Sync Engine

The sync engine uses CRDTs for conflict-free collaboration:

- **Automerge** for document-level CRDTs
- **Yjs** for real-time collaborative editing
- **Custom CRDT** for metadata and state sync
- **Vector clocks** for causal ordering

## Infrastructure

### Deployment

- **Kubernetes** (EKS) for container orchestration
- **Helm** charts for service deployment
- **ArgoCD** for GitOps continuous delivery
- **Terraform** for infrastructure as code

### Observability

- **Prometheus** for metrics collection
- **Grafana** for dashboards and alerting
- **OpenTelemetry** for distributed tracing
- **Loki** for log aggregation

### Data Storage

- **PostgreSQL**: Metadata, user records, service state
- **Redis**: Caching, session management, real-time presence
- **S3**: Encrypted file storage (client-side encryption)
- **Elasticsearch**: Search indexes (encrypted)
- **ClickHouse**: Analytics and usage metrics

### Multi-Region

- Primary: us-east-1
- Secondary: eu-west-1
- Data residency options for GDPR compliance
- Active-passive failover with Route53 health checks

## Security Architecture

### Zero-Knowledge Design

- Server never has access to plaintext data
- All encryption/decryption happens on the client
- Server stores only encrypted blobs and metadata
- Even metadata is minimized and encrypted where possible

### Key Management

- Keys derived from user passphrase via Argon2id
- Device keys for per-device access control
- Recovery keys for account recovery
- Key rotation without data re-encryption (key wrapping)

### Audit and Compliance

- SOC 2 Type II certified
- GDPR compliant with DPO
- HIPAA eligible (Enterprise plan)
- Annual penetration testing
- Bug bounty program
