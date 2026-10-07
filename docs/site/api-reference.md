# API Reference

The Quant API provides programmatic access to all Quant services. All endpoints require authentication and return JSON responses.

## Base URL

```
https://api.quant.app/v1
```

## Authentication

All API requests require a Bearer token:

```http
Authorization: Bearer <your-api-token>
```

Generate API tokens at Settings > Developer > API Tokens.

## Rate Limits

| Plan       | Requests/minute | Requests/day |
| ---------- | --------------- | ------------ |
| Free       | 60              | 10,000       |
| Pro        | 300             | 100,000      |
| Enterprise | Custom          | Custom       |

## Common Headers

```http
Content-Type: application/json
X-Request-ID: <uuid>
X-Quant-Version: 2024-01-01
```

---

## Mail API

### List Messages

```http
GET /mail/messages
```

Query Parameters:

- `folder` (string): Folder ID (inbox, sent, drafts, trash)
- `limit` (number): Max results (default: 50, max: 200)
- `offset` (number): Pagination offset
- `q` (string): Search query

### Get Message

```http
GET /mail/messages/:id
```

### Send Message

```http
POST /mail/messages/send
```

Body:

```json
{
  "to": ["user@example.com"],
  "subject": "Hello",
  "body": "Message content",
  "attachments": []
}
```

---

## Drive API

### List Files

```http
GET /drive/files
```

Query Parameters:

- `folder` (string): Parent folder ID
- `type` (string): File type filter
- `limit` (number): Max results

### Upload File

```http
POST /drive/files/upload
Content-Type: multipart/form-data
```

### Download File

```http
GET /drive/files/:id/download
```

---

## Docs API

### List Documents

```http
GET /docs/documents
```

### Create Document

```http
POST /docs/documents
```

Body:

```json
{
  "title": "New Document",
  "content": "",
  "folder": "folder-id"
}
```

### Collaborate (WebSocket)

```
wss://api.quant.app/v1/docs/documents/:id/collaborate
```

---

## Calendar API

### List Events

```http
GET /calendar/events
```

Query Parameters:

- `start` (ISO 8601): Start of time range
- `end` (ISO 8601): End of time range
- `calendar` (string): Calendar ID

### Create Event

```http
POST /calendar/events
```

Body:

```json
{
  "title": "Team Meeting",
  "start": "2024-01-15T10:00:00Z",
  "end": "2024-01-15T11:00:00Z",
  "attendees": ["user@quant.app"],
  "recurrence": "RRULE:FREQ=WEEKLY"
}
```

---

## Chat API

### List Channels

```http
GET /chat/channels
```

### Send Message

```http
POST /chat/channels/:id/messages
```

### Real-Time (WebSocket)

```
wss://api.quant.app/v1/chat/realtime
```

---

## Tasks API

### List Tasks

```http
GET /tasks/items
```

### Create Task

```http
POST /tasks/items
```

Body:

```json
{
  "title": "Complete API docs",
  "priority": "high",
  "dueDate": "2024-01-20",
  "assignee": "user-id",
  "project": "project-id"
}
```

---

## AI API

### Generate Completion

```http
POST /ai/completions
```

Body:

```json
{
  "prompt": "Summarize this document...",
  "model": "quant-gpt-4",
  "maxTokens": 500,
  "context": "document-id"
}
```

### Semantic Search

```http
POST /ai/search
```

Body:

```json
{
  "query": "quarterly budget reports",
  "scope": ["drive", "docs", "mail"],
  "limit": 20
}
```

---

## Sync API

### Get Sync Status

```http
GET /sync/status
```

### Force Sync

```http
POST /sync/trigger
```

---

## Webhooks

### Register Webhook

```http
POST /webhooks
```

Body:

```json
{
  "url": "https://your-app.com/webhook",
  "events": ["mail.received", "doc.updated", "task.completed"],
  "secret": "your-signing-secret"
}
```

### Webhook Events

- `mail.received` - New email received
- `mail.sent` - Email sent
- `doc.created` - Document created
- `doc.updated` - Document updated
- `task.created` - Task created
- `task.completed` - Task completed
- `calendar.event.created` - Event created
- `drive.file.uploaded` - File uploaded
- `chat.message.sent` - Message sent

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found.",
    "details": {}
  }
}
```

Common error codes:

- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `RESOURCE_NOT_FOUND` (404)
- `RATE_LIMITED` (429)
- `INTERNAL_ERROR` (500)

## SDKs

Official SDKs available:

- [JavaScript/TypeScript](https://github.com/quant-app/sdk-js)
- [Python](https://github.com/quant-app/sdk-python)
- [Go](https://github.com/quant-app/sdk-go)
- [Rust](https://github.com/quant-app/sdk-rust)
