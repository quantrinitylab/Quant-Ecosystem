// ============================================================================
// IMAP4rev1 Daemon - Command Parser & Handler (RFC 3501)
// ============================================================================

import argon2 from 'argon2';
import type { Socket } from 'node:net';
import { prisma, type PrismaClient } from '@quant/database';
import { MailboxManager } from './mailbox';
import type { ImapSessionState, ParsedCommand, SelectedFolder } from './types';
import type { IdleHandler } from './idle';

export interface CommandContext {
  session: ImapSessionState;
  socket: Socket;
  mailboxManager: MailboxManager;
  idleHandler?: IdleHandler;
  onStartTls?: () => void;
  db?: PrismaClient;
}

/**
 * Parses raw IMAP command line into structured ParsedCommand:
 * Tag, Command name, Arguments list (respecting quotes and parentheses).
 */
export function parseImapLine(line: string): ParsedCommand | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // IMAP command format: <tag> <command> [arguments...]
  const tokens: string[] = [];
  let currentToken = '';
  let inQuotes = false;
  let inParens = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (char === '"' && trimmed[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      currentToken += char;
    } else if (char === '(' && !inQuotes) {
      inParens++;
      currentToken += char;
    } else if (char === ')' && !inQuotes) {
      inParens = Math.max(0, inParens - 1);
      currentToken += char;
    } else if ((char === ' ' || char === '\t') && !inQuotes && inParens === 0) {
      if (currentToken.length > 0) {
        tokens.push(cleanToken(currentToken));
        currentToken = '';
      }
    } else {
      currentToken += char;
    }
  }

  if (currentToken.length > 0) {
    tokens.push(cleanToken(currentToken));
  }

  if (tokens.length < 2) {
    return null;
  }

  const tag = tokens[0]!;
  const command = tokens[1]!.toUpperCase();
  const args = tokens.slice(2);

  return { tag, command, args, rawLine: trimmed };
}

function cleanToken(token: string): string {
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return token.slice(1, -1);
  }
  return token;
}

/**
 * Parses IMAP sequence sets (e.g., "1:*", "2:5", "1,3,5", "4") into matching sequence numbers or UIDs.
 */
export function parseSequenceSet(spec: string, max: number): number[] {
  const result = new Set<number>();
  const parts = spec.split(',');

  for (const part of parts) {
    if (part.includes(':')) {
      const [startStr, endStr] = part.split(':');
      let start = startStr === '*' ? max : parseInt(startStr || '1', 10);
      let end = endStr === '*' ? max : parseInt(endStr || '1', 10);

      if (isNaN(start)) start = 1;
      if (isNaN(end)) end = max;

      const minVal = Math.min(start, end);
      const maxVal = Math.max(start, end);

      for (let i = minVal; i <= maxVal; i++) {
        if (i >= 1 && i <= max) {
          result.add(i);
        }
      }
    } else {
      const num = part === '*' ? max : parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= max) {
        result.add(num);
      }
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

/**
 * Handles IMAP4rev1 client commands according to RFC 3501 state machine.
 */
export async function executeImapCommand(cmd: ParsedCommand, ctx: CommandContext): Promise<void> {
  const { session, socket, mailboxManager } = ctx;
  const db = ctx.db || (prisma as PrismaClient);

  // If in IDLE mode, only DONE is accepted
  if (session.isIdling) {
    if (cmd.tag.toUpperCase() === 'DONE' || cmd.command === 'DONE') {
      ctx.idleHandler?.stop();
    }
    return;
  }

  const { tag, command, args } = cmd;

  switch (command) {
    case 'CAPABILITY': {
      let caps = 'IMAP4rev1 AUTH=PLAIN IDLE UNSELECT UIDPLUS NAMESPACE';
      if (!session.isTls) {
        caps += ' STARTTLS';
      }
      socket.write(`* CAPABILITY ${caps}\r\n`);
      socket.write(`${tag} OK CAPABILITY completed\r\n`);
      break;
    }

    case 'NOOP': {
      socket.write(`${tag} OK NOOP completed\r\n`);
      break;
    }

    case 'LOGOUT': {
      session.state = 'LOGOUT';
      socket.write(`* BYE IMAP4rev1 Server logging out\r\n`);
      socket.write(`${tag} OK LOGOUT completed\r\n`);
      socket.end();
      break;
    }

    case 'STARTTLS': {
      if (session.isTls) {
        socket.write(`${tag} BAD TLS already active\r\n`);
      } else if (ctx.onStartTls) {
        socket.write(`${tag} OK Begin TLS negotiation now\r\n`);
        ctx.onStartTls();
      } else {
        socket.write(`${tag} NO STARTTLS not available\r\n`);
      }
      break;
    }

    case 'LOGIN': {
      if (session.state !== 'NOT_AUTHENTICATED') {
        socket.write(`${tag} BAD Already authenticated\r\n`);
        break;
      }

      if (args.length < 2) {
        socket.write(`${tag} BAD LOGIN requires username and password\r\n`);
        break;
      }

      const [username = '', password = ''] = args;
      const cleanUser = username.trim().toLowerCase();

      try {
        const user = await db.user.findFirst({
          where: {
            OR: [{ email: cleanUser }, { username: cleanUser }],
          },
        });

        if (!user || !user.passwordHash) {
          socket.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
          break;
        }

        const valid = await argon2.verify(user.passwordHash, password);
        if (!valid) {
          socket.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
          break;
        }

        session.user = {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
        };
        session.state = 'AUTHENTICATED';

        socket.write(`${tag} OK [CAPABILITY IMAP4rev1 IDLE UNSELECT UIDPLUS] Logged in\r\n`);
      } catch {
        socket.write(`${tag} NO [AUTHENTICATIONFAILED] Internal error\r\n`);
      }
      break;
    }

    case 'SELECT':
    case 'EXAMINE': {
      if (session.state === 'NOT_AUTHENTICATED' || !session.user) {
        socket.write(`${tag} NO Must authenticate before selecting mailbox\r\n`);
        break;
      }

      const folderName = args[0] || 'INBOX';
      const isReadOnly = command === 'EXAMINE';

      const folder = await mailboxManager.selectMailbox(session.user, folderName, isReadOnly);
      if (!folder) {
        socket.write(`${tag} NO [NONEXISTENT] Mailbox does not exist: ${folderName}\r\n`);
        break;
      }

      session.selectedFolder = folder;
      session.state = 'SELECTED';

      const count = folder.items.length;
      const recent = folder.items.filter((i) => !i.isRead).length;

      socket.write(`* ${count} EXISTS\r\n`);
      socket.write(`* ${recent} RECENT\r\n`);
      socket.write(`* OK [UIDVALIDITY ${folder.uidvalidity}] UIDs valid\r\n`);
      socket.write(`* OK [UIDNEXT ${folder.uidnext}] Predicted next UID\r\n`);
      socket.write(`* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n`);
      socket.write(
        `* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Limited\r\n`,
      );

      const modeStr = isReadOnly ? '[READ-ONLY]' : '[READ-WRITE]';
      socket.write(`${tag} OK ${modeStr} ${command} completed\r\n`);
      break;
    }

    case 'LIST': {
      if (session.state === 'NOT_AUTHENTICATED' || !session.user) {
        socket.write(`${tag} NO Must authenticate first\r\n`);
        break;
      }

      const folders = await mailboxManager.listFolders(session.user.id);
      for (const f of folders) {
        const flags = f.attributes.join(' ');
        socket.write(`* LIST (${flags}) "/" "${f.name}"\r\n`);
      }
      socket.write(`${tag} OK LIST completed\r\n`);
      break;
    }

    case 'LSUB': {
      if (session.state === 'NOT_AUTHENTICATED' || !session.user) {
        socket.write(`${tag} NO Must authenticate first\r\n`);
        break;
      }

      const folders = await mailboxManager.listFolders(session.user.id);
      for (const f of folders) {
        const flags = f.attributes.join(' ');
        socket.write(`* LSUB (${flags}) "/" "${f.name}"\r\n`);
      }
      socket.write(`${tag} OK LSUB completed\r\n`);
      break;
    }

    case 'STATUS': {
      if (session.state === 'NOT_AUTHENTICATED' || !session.user) {
        socket.write(`${tag} NO Must authenticate first\r\n`);
        break;
      }

      const folderName = args[0] || 'INBOX';
      const itemsSpec = args[1] || '(MESSAGES RECENT UIDNEXT UIDVALIDITY UNSEEN)';
      const folder = await mailboxManager.selectMailbox(session.user, folderName, true);

      if (!folder) {
        socket.write(`${tag} NO Mailbox not found\r\n`);
        break;
      }

      const parts: string[] = [];
      const upperSpec = itemsSpec.toUpperCase();

      if (upperSpec.includes('MESSAGES')) parts.push(`MESSAGES ${folder.items.length}`);
      if (upperSpec.includes('RECENT'))
        parts.push(`RECENT ${folder.items.filter((i) => !i.isRead).length}`);
      if (upperSpec.includes('UIDNEXT')) parts.push(`UIDNEXT ${folder.uidnext}`);
      if (upperSpec.includes('UIDVALIDITY')) parts.push(`UIDVALIDITY ${folder.uidvalidity}`);
      if (upperSpec.includes('UNSEEN'))
        parts.push(`UNSEEN ${folder.items.filter((i) => !i.isRead).length}`);

      socket.write(`* STATUS "${folder.name}" (${parts.join(' ')})\r\n`);
      socket.write(`${tag} OK STATUS completed\r\n`);
      break;
    }

    case 'FETCH': {
      if (session.state !== 'SELECTED' || !session.selectedFolder) {
        socket.write(`${tag} NO No mailbox selected\r\n`);
        break;
      }

      const seqSpec = args[0] || '1:*';
      const dataItems = args.slice(1).join(' ') || 'ALL';
      handleFetch(session.selectedFolder, seqSpec, dataItems, false, socket, tag, mailboxManager);
      break;
    }

    case 'STORE': {
      if (session.state !== 'SELECTED' || !session.selectedFolder) {
        socket.write(`${tag} NO No mailbox selected\r\n`);
        break;
      }

      if (session.selectedFolder.readOnly) {
        socket.write(`${tag} NO [READ-ONLY] Mailbox is read-only\r\n`);
        break;
      }

      const seqSpec = args[0] || '';
      const flagActionStr = (args[1] || '').toUpperCase();
      const flagValues = args.slice(2).join(' ');

      await handleStore(
        session.selectedFolder,
        seqSpec,
        flagActionStr,
        flagValues,
        false,
        socket,
        tag,
        mailboxManager,
      );
      break;
    }

    case 'SEARCH': {
      if (session.state !== 'SELECTED' || !session.selectedFolder) {
        socket.write(`${tag} NO No mailbox selected\r\n`);
        break;
      }

      const criteria = args;
      const matches = handleSearch(session.selectedFolder, criteria, false);
      socket.write(`* SEARCH ${matches.join(' ')}\r\n`);
      socket.write(`${tag} OK SEARCH completed\r\n`);
      break;
    }

    case 'EXPUNGE': {
      if (session.state !== 'SELECTED' || !session.selectedFolder) {
        socket.write(`${tag} NO No mailbox selected\r\n`);
        break;
      }

      if (session.selectedFolder.readOnly) {
        socket.write(`${tag} NO [READ-ONLY] Mailbox is read-only\r\n`);
        break;
      }

      const expungedSeqs = await mailboxManager.expunge(session.selectedFolder);
      for (const seq of expungedSeqs) {
        socket.write(`* ${seq} EXPUNGE\r\n`);
      }
      socket.write(`${tag} OK EXPUNGE completed\r\n`);
      break;
    }

    case 'CLOSE': {
      if (session.state !== 'SELECTED' || !session.selectedFolder) {
        socket.write(`${tag} NO No mailbox selected\r\n`);
        break;
      }

      if (!session.selectedFolder.readOnly) {
        await mailboxManager.expunge(session.selectedFolder);
      }
      session.selectedFolder = undefined;
      session.state = 'AUTHENTICATED';
      socket.write(`${tag} OK CLOSE completed\r\n`);
      break;
    }

    case 'CHECK': {
      socket.write(`${tag} OK CHECK completed\r\n`);
      break;
    }

    case 'IDLE': {
      if (session.state !== 'SELECTED' || !session.selectedFolder) {
        socket.write(`${tag} NO Must select a mailbox before issuing IDLE\r\n`);
        break;
      }

      if (ctx.idleHandler) {
        ctx.idleHandler.start(tag);
      } else {
        socket.write(`${tag} NO IDLE engine unavailable\r\n`);
      }
      break;
    }

    case 'UID': {
      if (session.state !== 'SELECTED' || !session.selectedFolder) {
        socket.write(`${tag} NO No mailbox selected\r\n`);
        break;
      }

      const subCommand = (args[0] || '').toUpperCase();
      const subArgs = args.slice(1);

      if (subCommand === 'FETCH') {
        const uidSpec = subArgs[0] || '1:*';
        const dataItems = subArgs.slice(1).join(' ') || 'ALL';
        handleFetch(session.selectedFolder, uidSpec, dataItems, true, socket, tag, mailboxManager);
      } else if (subCommand === 'STORE') {
        const uidSpec = subArgs[0] || '';
        const action = (subArgs[1] || '').toUpperCase();
        const flagValues = subArgs.slice(2).join(' ');
        await handleStore(
          session.selectedFolder,
          uidSpec,
          action,
          flagValues,
          true,
          socket,
          tag,
          mailboxManager,
        );
      } else if (subCommand === 'SEARCH') {
        const matches = handleSearch(session.selectedFolder, subArgs, true);
        socket.write(`* SEARCH ${matches.join(' ')}\r\n`);
        socket.write(`${tag} OK UID SEARCH completed\r\n`);
      } else {
        socket.write(`${tag} BAD Unknown UID command ${subCommand}\r\n`);
      }
      break;
    }

    default: {
      socket.write(`${tag} BAD Command unrecognized: ${command}\r\n`);
      break;
    }
  }
}

/**
 * Handle FETCH and UID FETCH commands.
 */
function handleFetch(
  folder: SelectedFolder,
  spec: string,
  dataItems: string,
  isUid: boolean,
  socket: Socket,
  tag: string,
  mailboxManager: MailboxManager,
): void {
  const upperItems = dataItems.toUpperCase();
  const max = isUid ? Math.max(0, ...folder.items.map((i) => i.uid)) : folder.items.length;

  const targetNums = parseSequenceSet(spec, max);

  for (const item of folder.items) {
    const key = isUid ? item.uid : item.seq;
    if (!targetNums.includes(key)) continue;

    const parts: string[] = [];

    // Always include UID if UID FETCH or requested
    if (isUid || upperItems.includes('UID')) {
      parts.push(`UID ${item.uid}`);
    }

    // Flags
    if (
      upperItems.includes('FLAGS') ||
      upperItems === 'ALL' ||
      upperItems === 'FAST' ||
      upperItems === 'FULL'
    ) {
      const flags: string[] = [];
      if (item.isRead) flags.push('\\Seen');
      if (item.isStarred) flags.push('\\Flagged');
      if (item.isDeleted) flags.push('\\Deleted');
      if (item.isDraft) flags.push('\\Draft');
      if (item.isAnswered) flags.push('\\Answered');
      parts.push(`FLAGS (${flags.join(' ')})`);
    }

    // RFC822.SIZE
    if (
      upperItems.includes('RFC822.SIZE') ||
      upperItems === 'FAST' ||
      upperItems === 'ALL' ||
      upperItems === 'FULL'
    ) {
      parts.push(`RFC822.SIZE ${item.size}`);
    }

    // INTERNALDATE
    if (upperItems.includes('INTERNALDATE') || upperItems === 'ALL' || upperItems === 'FULL') {
      const dateStr = item.date.toISOString().replace(/T/, ' ').slice(0, 19);
      parts.push(`INTERNALDATE "${dateStr} +0000"`);
    }

    // ENVELOPE
    if (upperItems.includes('ENVELOPE') || upperItems === 'ALL' || upperItems === 'FULL') {
      parts.push(`ENVELOPE ${mailboxManager.formatEnvelope(item)}`);
    }

    // BODYSTRUCTURE / BODY
    if (upperItems.includes('BODYSTRUCTURE')) {
      parts.push(`BODYSTRUCTURE ${mailboxManager.formatBodyStructure(item)}`);
    } else if (upperItems.includes('BODY') && !upperItems.includes('BODY[')) {
      parts.push(`BODY ${mailboxManager.formatBodyStructure(item)}`);
    }

    // Full RFC 822 body literal
    if (
      upperItems.includes('BODY[]') ||
      upperItems.includes('BODY.PEEK[]') ||
      upperItems.includes('RFC822')
    ) {
      const mime = item.rawMime || '';
      parts.push(`BODY[] {${Buffer.byteLength(mime, 'utf-8')}}\r\n${mime}`);
      if (!upperItems.includes('BODY.PEEK') && !item.isRead) {
        item.isRead = true;
      }
    }

    socket.write(`* ${item.seq} FETCH (${parts.join(' ')})\r\n`);
  }

  socket.write(`${tag} OK FETCH completed\r\n`);
}

/**
 * Handle STORE and UID STORE commands.
 */
async function handleStore(
  folder: SelectedFolder,
  spec: string,
  actionStr: string,
  flagValues: string,
  isUid: boolean,
  socket: Socket,
  tag: string,
  mailboxManager: MailboxManager,
): Promise<void> {
  const isSilent = actionStr.endsWith('.SILENT');
  let action: 'SET' | 'ADD' | 'REMOVE' = 'SET';

  if (actionStr.startsWith('+')) action = 'ADD';
  else if (actionStr.startsWith('-')) action = 'REMOVE';

  const cleanFlags = flagValues
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((f) => f.length > 0);

  const max = isUid ? Math.max(0, ...folder.items.map((i) => i.uid)) : folder.items.length;

  const targetNums = parseSequenceSet(spec, max);

  for (const item of folder.items) {
    const key = isUid ? item.uid : item.seq;
    if (!targetNums.includes(key)) continue;

    const updatedFlags = await mailboxManager.updateFlags(folder, item, action, cleanFlags);

    if (!isSilent) {
      socket.write(`* ${item.seq} FETCH (FLAGS (${updatedFlags.join(' ')}))\r\n`);
    }
  }

  socket.write(`${tag} OK STORE completed\r\n`);
}

/**
 * Handle SEARCH and UID SEARCH commands.
 */
function handleSearch(folder: SelectedFolder, criteria: string[], isUid: boolean): number[] {
  const matches: number[] = [];

  for (const item of folder.items) {
    let matchesAll = true;

    for (let i = 0; i < criteria.length; i++) {
      const term = criteria[i]!.toUpperCase();

      if (term === 'ALL') {
        continue;
      } else if (term === 'UNSEEN') {
        if (item.isRead) matchesAll = false;
      } else if (term === 'SEEN') {
        if (!item.isRead) matchesAll = false;
      } else if (term === 'FLAGGED') {
        if (!item.isStarred) matchesAll = false;
      } else if (term === 'UNFLAGGED') {
        if (item.isStarred) matchesAll = false;
      } else if (term === 'DELETED') {
        if (!item.isDeleted) matchesAll = false;
      } else if (term === 'UNDELETED') {
        if (item.isDeleted) matchesAll = false;
      } else if (term === 'FROM' && criteria[i + 1]) {
        const query = criteria[++i]!.toLowerCase();
        if (!item.from.toLowerCase().includes(query)) matchesAll = false;
      } else if (term === 'SUBJECT' && criteria[i + 1]) {
        const query = criteria[++i]!.toLowerCase();
        if (!item.subject.toLowerCase().includes(query)) matchesAll = false;
      } else if (term === 'UID' && criteria[i + 1]) {
        const uidSpec = criteria[++i]!;
        const targetUids = parseSequenceSet(uidSpec, item.uid);
        if (!targetUids.includes(item.uid)) matchesAll = false;
      }
    }

    if (matchesAll) {
      matches.push(isUid ? item.uid : item.seq);
    }
  }

  return matches;
}
