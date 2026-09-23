// ============================================================================
// IMAP4rev1 Daemon - Entrypoint
// ============================================================================

import { ImapServer } from './server';
import { MailboxManager } from './mailbox';
import { ImapEventBus } from './events';

export * from './server';
export * from './mailbox';
export * from './commands';
export * from './events';
export * from './idle';
export * from './types';
export * from './tls';

async function bootstrap(): Promise<void> {
  const mailboxManager = new MailboxManager();
  const eventBus = new ImapEventBus();

  const server = new ImapServer({
    mailboxManager,
    eventBus,
  });

  const { tlsPort, cleartextPort } = await server.start();
  console.log(
    `[quant-imap-server] Daemon active: Port ${tlsPort} (TLS 993) and Port ${cleartextPort} (STARTTLS 143)`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[quant-imap-server] Received ${signal}, shutting down...`);
    try {
      await server.stop();
      console.log('[quant-imap-server] Server stopped gracefully.');
      process.exit(0);
    } catch (err) {
      console.error('[quant-imap-server] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  bootstrap().catch((err) => {
    console.error('[quant-imap-server] Fatal boot error:', err);
    process.exit(1);
  });
}
