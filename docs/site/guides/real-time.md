# Real-Time Collaboration Guide

Quant uses CRDT-based real-time sync for conflict-free collaboration across all apps.

## How It Works

### CRDT (Conflict-Free Replicated Data Types)

CRDTs allow multiple users to edit the same data simultaneously without conflicts:

- No central server needed for conflict resolution
- Changes merge automatically and deterministically
- Works offline - syncs when reconnected
- Preserves user intent without data loss

### Architecture

```
User A (typing) --> Local CRDT --> Sync Engine --> User B's CRDT
User B (typing) --> Local CRDT --> Sync Engine --> User A's CRDT
```

Both users see each other's changes in real-time (typically < 100ms latency).

## Supported Apps

| App    | Collaboration Type                            |
| ------ | --------------------------------------------- |
| Docs   | Real-time text editing, comments, suggestions |
| Sheets | Cell-level concurrent editing                 |
| Slides | Slide-level collaboration                     |
| Code   | Multi-cursor editing, shared terminals        |
| Chat   | Real-time messaging with presence             |
| Tasks  | Concurrent task updates                       |
| Notes  | Real-time note editing                        |

## Setting Up Collaboration

### Share a Document

1. Open any document in Docs, Sheets, or Slides
2. Click "Share" in the top right
3. Add collaborators by email or team name
4. Set permissions (view, comment, edit)

### Permission Levels

- **Viewer**: Read-only access
- **Commenter**: Can add comments and suggestions
- **Editor**: Full edit access
- **Owner**: Edit + manage sharing + delete

### Real-Time Presence

When collaborating, you see:

- Colored cursors for each participant
- Name labels on cursor positions
- Selection highlights
- Typing indicators

## WebSocket API

For custom integrations, connect to the collaboration WebSocket:

```typescript
const ws = new WebSocket('wss://api.quant.app/v1/docs/documents/doc-123/collaborate');

ws.onopen = () => {
  ws.send(
    JSON.stringify({
      type: 'join',
      token: 'your-auth-token',
      clientId: 'unique-client-id',
    }),
  );
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'update':
      // Apply CRDT update
      applyUpdate(message.payload);
      break;
    case 'presence':
      // Update user presence
      updatePresence(message.users);
      break;
  }
};
```

## Offline Collaboration

When offline, Quant queues changes locally:

1. Edit normally while offline
2. Changes stored in local CRDT
3. When reconnected, changes sync automatically
4. CRDTs merge without conflicts
5. No manual conflict resolution needed

## Performance

- Typical sync latency: 50-100ms
- Maximum concurrent editors: 100 per document
- Document size limit: 10MB of content
- History retention: Unlimited on Pro/Enterprise

## Troubleshooting

### Sync Delays

If you experience sync delays:

1. Check your network connection
2. Verify WebSocket connections in browser DevTools
3. Try refreshing the page
4. Check [status.quant.app](https://status.quant.app) for service issues

### Merge Issues

CRDTs handle most merges automatically. In rare edge cases:

- Character-level insertions always merge correctly
- Structural changes (moving paragraphs) may need manual review
- Deletions are always preserved (delete wins)
