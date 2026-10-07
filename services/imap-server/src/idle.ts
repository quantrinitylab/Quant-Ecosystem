// ============================================================================
// IMAP4rev1 Daemon - RFC 2177 IDLE Push Engine (<30ms latency)
// ============================================================================

import type { Socket } from 'node:net';
import type { ImapSessionState } from './types';
import type { ImapEventBus, ImapNewEmailEvent } from './events';

export class IdleHandler {
  private unsubscribeFn: (() => void) | null = null;
  private readonly session: ImapSessionState;
  private readonly socket: Socket;
  private readonly eventBus: ImapEventBus;

  constructor(session: ImapSessionState, socket: Socket, eventBus: ImapEventBus) {
    this.session = session;
    this.socket = socket;
    this.eventBus = eventBus;
  }

  /**
   * Enters RFC 2177 IDLE mode:
   * 1. Responds with continuation response `+ idling`
   * 2. Binds socket to Redis PubSub channel `channel:imap:${userId}:${folderId}`
   * 3. Sends untagged EXISTS and RECENT updates on event arrival in <30ms
   */
  start(tag: string): void {
    if (!this.session.user || !this.session.selectedFolder) {
      this.socket.write(`${tag} BAD IDLE requires a selected mailbox\r\n`);
      return;
    }

    this.session.isIdling = true;
    this.session.idleTag = tag;

    // Send IMAP continuation response to client
    this.socket.write('+ idling\r\n');

    const userId = this.session.user.id;
    const folderId = this.session.selectedFolder.id;

    // Bind to Redis PubSub
    this.unsubscribeFn = this.eventBus.subscribe(userId, folderId, (event: ImapNewEmailEvent) => {
      this.handleNewEmailEvent(event);
    });
  }

  /**
   * Processes new incoming email event and pushes untagged IMAP notifications immediately.
   */
  private handleNewEmailEvent(event: ImapNewEmailEvent): void {
    if (!this.session.isIdling || !this.session.selectedFolder) {
      return;
    }

    // Update count in selected folder
    const currentCount = this.session.selectedFolder.items.length;
    const newCount = event.newCount ?? currentCount + 1;
    const recentCount = event.recentCount ?? 1;

    // Expand items if necessary to prevent out-of-range errors on immediate subsequent FETCH
    while (this.session.selectedFolder.items.length < newCount) {
      const nextSeq = this.session.selectedFolder.items.length + 1;
      const nextUid = this.session.selectedFolder.uidnext++;
      this.session.selectedFolder.items.push({
        id: event.emailId || `email-idle-${nextUid}`,
        uid: nextUid,
        seq: nextSeq,
        subject: '(New Message)',
        from: 'unknown@quantmail.in',
        to: [this.session.user?.email ?? 'unknown@quantmail.in'],
        cc: [],
        bcc: [],
        date: new Date(),
        size: 1024,
        isRead: false,
        isStarred: false,
        isDeleted: false,
        isDraft: false,
        isAnswered: false,
        messageId: `<idle-${nextUid}@quantmail.in>`,
      });
    }

    // Emit untagged EXISTS and RECENT immediately over socket (<30ms from event arrival)
    this.socket.write(`* ${newCount} EXISTS\r\n`);
    this.socket.write(`* ${recentCount} RECENT\r\n`);
  }

  /**
   * Gracefully exits IDLE mode when client transmits the `DONE` token.
   */
  stop(): void {
    if (!this.session.isIdling) {
      return;
    }

    // Unbind from Redis PubSub
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }

    const tag = this.session.idleTag || '*';
    this.session.isIdling = false;
    this.session.idleTag = undefined;

    // Transmit completion confirmation
    this.socket.write(`${tag} OK IDLE completed\r\n`);
  }

  /**
   * Clean up resources on socket disconnect.
   */
  cleanup(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
    this.session.isIdling = false;
    this.session.idleTag = undefined;
  }
}
