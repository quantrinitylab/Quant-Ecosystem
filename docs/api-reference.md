# API Reference

All API routes are implemented as Next.js App Router API handlers (`src/app/api/`). Authentication is handled via JWT tokens issued by QuantMail OAuth2.

## Admin API (`apps/admin`)

Base URL: `http://localhost:3100/api`

### System Statistics

| Method | Path         | Description                                         | Auth Required |
| ------ | ------------ | --------------------------------------------------- | ------------- |
| GET    | `/api/stats` | Platform-wide statistics (users, messages, storage) | Yes (admin)   |

### User Management

| Method | Path         | Description                             | Auth Required |
| ------ | ------------ | --------------------------------------- | ------------- |
| GET    | `/api/users` | List all platform users with pagination | Yes (admin)   |

### Service Management

| Method | Path                      | Description                                   | Auth Required |
| ------ | ------------------------- | --------------------------------------------- | ------------- |
| GET    | `/api/services`           | List all registered services and their status | Yes (admin)   |
| GET    | `/api/services/[id]`      | Get details of a specific service             | Yes (admin)   |
| GET    | `/api/services/[id]/logs` | Retrieve service logs                         | Yes (admin)   |

### App Management

| Method | Path                     | Description                       | Auth Required |
| ------ | ------------------------ | --------------------------------- | ------------- |
| GET    | `/api/apps`              | List all ecosystem applications   | Yes (admin)   |
| GET    | `/api/apps/[id]`         | Get app details (status, metrics) | Yes (admin)   |
| POST   | `/api/apps/[id]/restart` | Restart a specific application    | Yes (admin)   |

### Notifications

| Method | Path                           | Description                              | Auth Required |
| ------ | ------------------------------ | ---------------------------------------- | ------------- |
| GET    | `/api/notifications`           | List platform notifications              | Yes (admin)   |
| POST   | `/api/notifications/broadcast` | Send broadcast notification to all users | Yes (admin)   |

### Search

| Method | Path          | Description                         | Auth Required |
| ------ | ------------- | ----------------------------------- | ------------- |
| GET    | `/api/search` | Search across all platform entities | Yes (admin)   |

### Audit & Compliance

| Method | Path              | Description                        | Auth Required |
| ------ | ----------------- | ---------------------------------- | ------------- |
| GET    | `/api/audit`      | Query audit log entries            | Yes (admin)   |
| GET    | `/api/compliance` | View compliance reports and status | Yes (admin)   |

### Feature Flags

| Method | Path                      | Description                | Auth Required |
| ------ | ------------------------- | -------------------------- | ------------- |
| GET    | `/api/feature-flags`      | List all feature flags     | Yes (admin)   |
| POST   | `/api/feature-flags`      | Create a new feature flag  | Yes (admin)   |
| GET    | `/api/feature-flags/[id]` | Get flag details and rules | Yes (admin)   |
| PUT    | `/api/feature-flags/[id]` | Update flag configuration  | Yes (admin)   |
| DELETE | `/api/feature-flags/[id]` | Delete a feature flag      | Yes (admin)   |

### Health

| Method | Path          | Description                | Auth Required |
| ------ | ------------- | -------------------------- | ------------- |
| GET    | `/api/health` | Admin service health check | No            |

---

## QuantMail API (`apps/quantmail`)

Base URL: `http://localhost:3010/api`

### Email

| Method | Path                       | Description                       | Auth Required |
| ------ | -------------------------- | --------------------------------- | ------------- |
| GET    | `/api/emails`              | List emails (inbox, sent, drafts) | Yes           |
| POST   | `/api/emails`              | Create a new draft email          | Yes           |
| GET    | `/api/emails/[id]`         | Get email by ID                   | Yes           |
| PUT    | `/api/emails/[id]`         | Update email (mark read, labels)  | Yes           |
| DELETE | `/api/emails/[id]`         | Delete/trash an email             | Yes           |
| POST   | `/api/emails/[id]/send`    | Send a draft email                | Yes           |
| POST   | `/api/emails/[id]/reply`   | Reply to an email                 | Yes           |
| POST   | `/api/emails/[id]/archive` | Archive an email                  | Yes           |
| POST   | `/api/emails/[id]/star`    | Toggle star status                | Yes           |
| GET    | `/api/emails/search`       | Full-text email search            | Yes           |

### Threads

| Method | Path                | Description                  | Auth Required |
| ------ | ------------------- | ---------------------------- | ------------- |
| GET    | `/api/threads`      | List email threads           | Yes           |
| GET    | `/api/threads/[id]` | Get thread with all messages | Yes           |

### Contacts

| Method | Path                 | Description          | Auth Required |
| ------ | -------------------- | -------------------- | ------------- |
| GET    | `/api/contacts`      | List contacts        | Yes           |
| POST   | `/api/contacts`      | Create a new contact | Yes           |
| GET    | `/api/contacts/[id]` | Get contact details  | Yes           |
| PUT    | `/api/contacts/[id]` | Update contact       | Yes           |
| DELETE | `/api/contacts/[id]` | Delete contact       | Yes           |

### Calendar

| Method | Path                        | Description          | Auth Required |
| ------ | --------------------------- | -------------------- | ------------- |
| GET    | `/api/calendar/events`      | List calendar events | Yes           |
| POST   | `/api/calendar/events`      | Create a new event   | Yes           |
| GET    | `/api/calendar/events/[id]` | Get event details    | Yes           |
| PUT    | `/api/calendar/events/[id]` | Update event         | Yes           |
| DELETE | `/api/calendar/events/[id]` | Delete event         | Yes           |

### Drive (File Storage)

| Method | Path                                                     | Description                     | Auth Required |
| ------ | -------------------------------------------------------- | ------------------------------- | ------------- |
| GET    | `/api/drive/files`                                       | List files in current directory | Yes           |
| POST   | `/api/drive/upload`                                      | Upload a new file               | Yes           |
| GET    | `/api/drive/files/[fileId]`                              | Get file metadata               | Yes           |
| DELETE | `/api/drive/files/[fileId]`                              | Delete a file                   | Yes           |
| GET    | `/api/drive/files/[fileId]/download`                     | Download file content           | Yes           |
| POST   | `/api/drive/files/[fileId]/copy`                         | Copy a file                     | Yes           |
| POST   | `/api/drive/files/[fileId]/share`                        | Share file with users           | Yes           |
| POST   | `/api/drive/files/[fileId]/star`                         | Toggle file star                | Yes           |
| GET    | `/api/drive/files/[fileId]/versions`                     | List file versions              | Yes           |
| GET    | `/api/drive/files/[fileId]/versions/[versionId]`         | Get specific version            | Yes           |
| POST   | `/api/drive/files/[fileId]/versions/[versionId]/restore` | Restore a version               | Yes           |
| POST   | `/api/drive/files/move`                                  | Move files to folder            | Yes           |
| POST   | `/api/drive/files/trash`                                 | Move files to trash             | Yes           |
| GET    | `/api/drive/folders`                                     | List folders                    | Yes           |
| POST   | `/api/drive/folders`                                     | Create a new folder             | Yes           |
| GET    | `/api/drive/search`                                      | Search files                    | Yes           |

### Labels

| Method | Path          | Description        | Auth Required |
| ------ | ------------- | ------------------ | ------------- |
| GET    | `/api/labels` | List email labels  | Yes           |
| POST   | `/api/labels` | Create a new label | Yes           |

### Git Repositories

| Method | Path                     | Description              | Auth Required |
| ------ | ------------------------ | ------------------------ | ------------- |
| GET    | `/api/repos`             | List user's repositories | Yes           |
| POST   | `/api/repos`             | Create a new repository  | Yes           |
| GET    | `/api/repos/[id]`        | Get repository details   | Yes           |
| GET    | `/api/repos/[id]/issues` | List repository issues   | Yes           |
| GET    | `/api/repos/[id]/pulls`  | List pull requests       | Yes           |

### CI/CD

| Method | Path                | Description        | Auth Required |
| ------ | ------------------- | ------------------ | ------------- |
| GET    | `/api/ci/workflows` | List CI workflows  | Yes           |
| GET    | `/api/ci/builds`    | List recent builds | Yes           |

---

## WebSocket Gateway (`services/ws-gateway`)

Connection URL: `ws://localhost:8080/ws`

### Authentication

Connect with JWT token in the `Authorization` header or as a query parameter:

```
ws://localhost:8080/ws?token=<jwt_token>
```

### Events

| Event              | Direction        | Description               |
| ------------------ | ---------------- | ------------------------- |
| `message.new`      | Server to Client | New chat message received |
| `message.read`     | Client to Server | Mark message as read      |
| `typing.start`     | Bidirectional    | User started typing       |
| `typing.stop`      | Bidirectional    | User stopped typing       |
| `presence.online`  | Server to Client | User came online          |
| `presence.offline` | Server to Client | User went offline         |
| `channel.join`     | Client to Server | Join a channel/room       |
| `channel.leave`    | Client to Server | Leave a channel/room      |
| `notification`     | Server to Client | Push notification         |

---

## Service Health Endpoints

All services expose a `/health` endpoint:

| Service        | Health URL                         | Expected Response    |
| -------------- | ---------------------------------- | -------------------- |
| ws-gateway     | `http://localhost:3040/health`     | `{ "status": "ok" }` |
| search-indexer | `http://localhost:3022/health`     | `{ "status": "ok" }` |
| admin          | `http://localhost:3100/api/health` | `{ "status": "ok" }` |

---

## Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt_access_token>
```

Tokens are obtained via the QuantMail OAuth2 flow:

1. `GET /oauth/authorize?client_id=...&redirect_uri=...&response_type=code&code_challenge=...`
2. `POST /oauth/token` with authorization code exchange
3. Use the returned `access_token` for API calls
4. Use `refresh_token` to obtain new access tokens when expired

### Token Scopes

| Scope            | Access Level                  |
| ---------------- | ----------------------------- |
| `email:read`     | Read emails and threads       |
| `email:write`    | Send, reply, archive emails   |
| `contacts:read`  | Read contacts                 |
| `contacts:write` | Create/update/delete contacts |
| `drive:read`     | Read files                    |
| `drive:write`    | Upload, modify, delete files  |
| `calendar:read`  | Read calendar events          |
| `calendar:write` | Create/modify events          |
| `admin`          | Full admin panel access       |
| `repos`          | Repository access             |
