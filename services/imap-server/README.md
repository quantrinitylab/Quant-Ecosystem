# @quant/imap-server

RFC 3501 IMAP4rev1 server daemon listening on port 993 (implicit TLS) and port 143 (STARTTLS).

## Architecture

- **Mailbox Protocol**: Serves standard folders (`INBOX`, `Sent`, `Drafts`, `Trash`, `Archive`) to external mail clients (Apple Mail, Microsoft Outlook, Thunderbird, iOS Mail).
- **Database Mapping**: Backed directly by PostgreSQL `prisma.email`, `prisma.thread`, and `prisma.folder`.
- **RFC 2177 IDLE**: Keeps client connections alive and pushes real-time email arrivals instantly over the persistent TCP socket.
