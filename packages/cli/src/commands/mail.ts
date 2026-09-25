import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { QuantCliClient } from '../client.js';
import { formatRelativeTime, renderTable, stripAnsi } from '../git-utils.js';

export interface EmailDto {
  id: string;
  fromAddress?: string;
  fromName?: string;
  from?: { email?: string; name?: string } | string;
  toAddresses?: string[];
  to?: Array<{ email?: string; name?: string }> | string[] | string;
  ccAddresses?: string[];
  cc?: Array<{ email?: string; name?: string }> | string[] | string;
  bccAddresses?: string[];
  bcc?: Array<{ email?: string; name?: string }> | string[] | string;
  subject?: string;
  bodyPlain?: string;
  bodyText?: string;
  bodyHtml?: string;
  aiCategory?: string;
  category?: string;
  isStarred?: boolean;
  isRead?: boolean;
  isDraft?: boolean;
  isTrash?: boolean;
  isSpam?: boolean;
  receivedAt?: string | Date;
  createdAt?: string | Date;
  threadId?: string;
}

/**
 * Truncates a string with an ellipsis if it exceeds maxLength.
 */
function truncate(str: string, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Formats sender display name and email.
 */
function formatSender(email: EmailDto): string {
  const name = email.fromName || (typeof email.from === 'object' ? email.from?.name : undefined);
  const address =
    email.fromAddress ||
    (typeof email.from === 'string'
      ? email.from
      : typeof email.from === 'object'
        ? email.from?.email
        : '') ||
    '';

  if (name && address && name.toLowerCase() !== address.toLowerCase()) {
    return `${name} <${address}>`;
  }
  return address || name || 'Unknown';
}

/**
 * Formats recipient list as string.
 */
function formatRecipients(recipients: any): string {
  if (Array.isArray(recipients)) {
    return recipients
      .map((r) => {
        if (typeof r === 'string') return r;
        if (r && typeof r === 'object') {
          return r.name ? `${r.name} <${r.email}>` : r.email;
        }
        return String(r);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof recipients === 'string') return recipients;
  return '';
}

/**
 * Renders colored category badges with chalk.
 */
function formatCategoryTag(category?: string | null): string {
  const cat = (category || 'primary').toLowerCase();
  switch (cat) {
    case 'primary':
      return chalk.bold.blue('Primary');
    case 'updates':
      return chalk.bold.yellow('Updates');
    case 'promotions':
    case 'promos':
      return chalk.bold.magenta('Promos');
    case 'social':
      return chalk.bold.cyan('Social');
    case 'forums':
      return chalk.bold.green('Forums');
    default:
      return chalk.gray(cat.charAt(0).toUpperCase() + cat.slice(1));
  }
}

/**
 * Converts basic HTML email body into clean terminal plaintext.
 */
function htmlToPlain(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '  • ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n------------------------------------------------------------\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Highlights occurrences of a search query in text.
 */
function highlightMatch(text: string, query: string): string {
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, (match) => chalk.bgYellow.black.bold(match));
}

/**
 * Registers all `quant mail` commands for superhuman terminal email triaging.
 */
export function registerMailCommands(program: Command): void {
  const mail = program
    .command('mail')
    .description('Superhuman-fast terminal email triaging, reading, sending, and search');

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant mail inbox
  // ─────────────────────────────────────────────────────────────────────────────
  mail
    .command('inbox')
    .description('List unread or recent emails with ID, Star, From, Subject, Category, Date')
    .option('-L, --limit <number>', 'Maximum number of emails to display', '25')
    .option('-u, --unread', 'Filter for unread messages only')
    .option('-a, --all', 'Include read and unread messages (default behavior)', true)
    .option(
      '-c, --category <category>',
      'Filter by category (primary, updates, promos, social, forums)',
    )
    .option('--json', 'Output email list in JSON format')
    .action(
      async (options: {
        limit?: string;
        unread?: boolean;
        all?: boolean;
        category?: string;
        json?: boolean;
      }) => {
        const client = new QuantCliClient();
        const limit = parseInt(options.limit || '25', 10);
        const spinner = !options.json ? ora('Fetching inbox messages...').start() : null;

        try {
          const queryParams = new URLSearchParams();
          queryParams.set('pageSize', String(limit));
          queryParams.set('folderType', 'INBOX');
          if (options.category) {
            queryParams.set('category', options.category.toLowerCase());
          }

          let res: any;
          try {
            res = await client.get(`/api/emails?${queryParams.toString()}`);
          } catch (err: any) {
            try {
              res = await client.get(`/emails?${queryParams.toString()}`);
            } catch {
              throw err;
            }
          }

          spinner?.stop();

          let emails: EmailDto[] = Array.isArray(res)
            ? res
            : Array.isArray(res?.data)
              ? res.data
              : Array.isArray(res?.emails)
                ? res.emails
                : [];

          if (options.unread) {
            emails = emails.filter((e) => !e.isRead);
          }

          if (options.json) {
            console.log(JSON.stringify(emails, null, 2));
            return;
          }

          if (emails.length === 0) {
            console.log(
              chalk.gray(
                options.unread
                  ? 'All caught up! Zero unread messages in your inbox.'
                  : 'No messages found in your inbox.',
              ),
            );
            return;
          }

          console.log(
            chalk.bold(
              `\n📬 QuantMail Inbox ${chalk.gray(`(${emails.length} message${emails.length === 1 ? '' : 's'})`)}`,
            ),
          );

          const headers = ['ID', 'Star', 'From', 'Subject', 'Category', 'Date'];
          const rows = emails.map((e) => {
            const rawId = e.id || '';
            const idCol = chalk.gray(truncate(rawId, 12));
            const starCol = e.isStarred ? chalk.yellow('★') : chalk.gray('☆');
            const fromRaw = formatSender(e);
            const fromCol = truncate(fromRaw, 26);
            const subjRaw = e.subject || '(no subject)';
            const subjCol = !e.isRead
              ? chalk.bold.white(truncate(subjRaw, 38))
              : chalk.gray(truncate(subjRaw, 38));
            const categoryCol = formatCategoryTag(e.aiCategory || e.category);
            const dateCol = chalk.gray(formatRelativeTime(e.receivedAt || e.createdAt));

            return [idCol, starCol, fromCol, subjCol, categoryCol, dateCol];
          });

          console.log(renderTable(headers, rows));
          console.log(
            chalk.gray(
              `\n💡 Tip: Run ${chalk.cyan('quant mail read <id>')} to read • ${chalk.cyan('quant mail archive <id>')} to archive\n`,
            ),
          );
        } catch (err: any) {
          spinner?.fail(chalk.red('Failed to load inbox'));
          console.error(chalk.red(`Error: ${err.message || 'Unable to retrieve emails.'}`));
          process.exitCode = 1;
        }
      },
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant mail read <id>
  // ─────────────────────────────────────────────────────────────────────────────
  mail
    .command('read <id>')
    .description('Display formatted email headers and plaintext/rendered body')
    .option('--no-mark-read', 'Do not mark message as read')
    .option('--json', 'Output email payload in JSON format')
    .action(async (id: string, options: { markRead?: boolean; json?: boolean }) => {
      const client = new QuantCliClient();
      const spinner = !options.json ? ora(`Fetching email ${chalk.cyan(id)}...`).start() : null;

      try {
        let res: any;
        try {
          res = await client.get(`/api/emails/${encodeURIComponent(id)}`);
        } catch (err: any) {
          try {
            res = await client.get(`/emails/${encodeURIComponent(id)}`);
          } catch {
            throw err;
          }
        }

        spinner?.stop();

        const email: EmailDto = res?.data || res;
        if (!email || !email.id) {
          throw new Error(`Email with ID "${id}" was not found.`);
        }

        if (options.json) {
          console.log(JSON.stringify(email, null, 2));
          return;
        }

        // Auto-mark as read in background if unread
        if (!email.isRead && options.markRead !== false) {
          client
            .post(`/api/emails/${encodeURIComponent(id)}/read`, {})
            .catch(() => client.post(`/emails/${encodeURIComponent(id)}/read`, {}).catch(() => {}));
        }

        const fromStr = formatSender(email);
        const toStr = formatRecipients(email.toAddresses || email.to) || 'me';
        const ccStr = formatRecipients(email.ccAddresses || email.cc);
        const dateRaw = email.receivedAt || email.createdAt;
        const dateStr = dateRaw
          ? `${new Date(dateRaw).toLocaleString()} (${formatRelativeTime(dateRaw)})`
          : 'Unknown';
        const subjectStr = email.subject || '(no subject)';
        const catBadge = formatCategoryTag(email.aiCategory || email.category);
        const starBadge = email.isStarred ? chalk.yellow(' ★ Starred') : '';

        console.log(chalk.gray('\n' + '─'.repeat(78)));
        console.log(`${chalk.bold.cyan('From:    ')} ${chalk.white(fromStr)}`);
        console.log(`${chalk.bold.cyan('To:      ')} ${chalk.gray(toStr)}`);
        if (ccStr) {
          console.log(`${chalk.bold.cyan('Cc:      ')} ${chalk.gray(ccStr)}`);
        }
        console.log(`${chalk.bold.cyan('Date:    ')} ${chalk.gray(dateStr)}`);
        console.log(
          `${chalk.bold.cyan('Subject: ')} ${chalk.bold.white(subjectStr)}  [${catBadge}]${starBadge}`,
        );
        console.log(chalk.gray('─'.repeat(78) + '\n'));

        // Resolve body: plain text preferred, fallback to cleaned HTML
        const body =
          email.bodyPlain ||
          email.bodyText ||
          (email.bodyHtml ? htmlToPlain(email.bodyHtml) : chalk.gray('(No message body)'));

        console.log(body);
        console.log(chalk.gray('\n' + '─'.repeat(78)));
        console.log(
          chalk.gray(
            `ID: ${chalk.cyan(email.id)}  •  Archive: ${chalk.yellow(`quant mail archive ${email.id}`)}  •  Star: ${chalk.yellow(`quant mail star ${email.id}`)}\n`,
          ),
        );
      } catch (err: any) {
        spinner?.fail(chalk.red(`Failed to read email ${id}`));
        console.error(chalk.red(`Error: ${err.message || 'Unable to retrieve email.'}`));
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant mail send
  // ─────────────────────────────────────────────────────────────────────────────
  mail
    .command('send')
    .description('Send an email with recipient, subject, and body')
    .option('-t, --to <email>', 'Recipient email address')
    .option('-s, --subject <subject>', 'Email subject line')
    .option('-b, --body <text>', 'Email body plaintext content')
    .option('--cc <emails>', 'Comma-separated CC recipient addresses')
    .option('--bcc <emails>', 'Comma-separated BCC recipient addresses')
    .option('--json', 'Output response in JSON format')
    .action(
      async (options: {
        to?: string;
        subject?: string;
        body?: string;
        cc?: string;
        bcc?: string;
        json?: boolean;
      }) => {
        const client = new QuantCliClient();
        let to = options.to;
        let subject = options.subject;
        let body = options.body;

        // Interactive prompts if values are missing and running in interactive TTY
        if ((!to || !subject || body === undefined) && !options.json && process.stdin.isTTY) {
          console.log(chalk.bold('\n✉ QuantMail Interactive Composer'));
          const prompts: any[] = [];
          if (!to) {
            prompts.push({
              type: 'input',
              name: 'to',
              message: 'To (recipient email):',
              validate: (input: string) => {
                const trimmed = input.trim();
                if (!trimmed) return 'Recipient is required';
                if (!trimmed.includes('@')) return 'Enter a valid email address';
                return true;
              },
            });
          }
          if (!subject) {
            prompts.push({
              type: 'input',
              name: 'subject',
              message: 'Subject:',
              validate: (input: string) => (input.trim() ? true : 'Subject is required'),
            });
          }
          if (body === undefined) {
            prompts.push({
              type: 'input',
              name: 'body',
              message: 'Body message:',
            });
          }

          const answers = await inquirer.prompt(prompts);
          if (!to) to = answers.to;
          if (!subject) subject = answers.subject;
          if (body === undefined) body = answers.body;
        }

        if (!to || !subject) {
          console.error(
            chalk.red(
              'Error: Both --to <email> and --subject <subject> are required to send an email.',
            ),
          );
          process.exitCode = 1;
          return;
        }

        const toAddresses = to
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const ccAddresses = options.cc
          ? options.cc
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const bccAddresses = options.bcc
          ? options.bcc
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        const bodyContent = body || '';
        const escapedHtml = bodyContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>');

        const payload = {
          to,
          toAddresses,
          cc: ccAddresses,
          ccAddresses,
          bcc: bccAddresses,
          bccAddresses,
          subject,
          body: bodyContent,
          bodyPlain: bodyContent,
          bodyText: bodyContent,
          bodyHtml: `<p>${escapedHtml}</p>`,
          send: true,
        };

        const spinner = !options.json
          ? ora('Delivering email via Quant outbound pipeline...').start()
          : null;

        try {
          let result: any;
          // Primary specification: Calls POST /api/mail/send
          try {
            result = await client.post('/api/mail/send', payload);
          } catch (postErr: any) {
            // Graceful fallback if backend routes are mapped to /api/emails/compose or /emails/compose
            if (postErr?.status === 404) {
              try {
                result = await client.post('/api/emails/compose', payload);
              } catch {
                result = await client.post('/emails/compose', payload);
              }
            } else {
              throw postErr;
            }
          }

          spinner?.succeed(chalk.green('Email sent successfully!'));

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          const sentData = result?.data || result;
          const sentId = sentData?.id || sentData?.emailId || 'queued';

          console.log(chalk.bold.green('\n✔ Outbound message delivered.'));
          console.log(chalk.gray(`  To:      ${chalk.white(to)}`));
          if (ccAddresses.length > 0) {
            console.log(chalk.gray(`  Cc:      ${chalk.white(ccAddresses.join(', '))}`));
          }
          console.log(chalk.gray(`  Subject: ${chalk.white(subject)}`));
          console.log(chalk.gray(`  Message ID: ${chalk.cyan(sentId)}\n`));
        } catch (err: any) {
          spinner?.fail(chalk.red('Failed to send email'));
          console.error(chalk.red(`Error: ${err.message || 'Unable to deliver message.'}`));
          process.exitCode = 1;
        }
      },
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant mail search <query>
  // ─────────────────────────────────────────────────────────────────────────────
  mail
    .command('search <query>')
    .description('Fast search across messages with highlighted query matches')
    .option('-L, --limit <number>', 'Maximum number of search results to return', '25')
    .option('--json', 'Output search results in JSON format')
    .action(async (query: string, options: { limit?: string; json?: boolean }) => {
      const client = new QuantCliClient();
      const limit = parseInt(options.limit || '25', 10);
      const spinner = !options.json
        ? ora(`Searching messages matching "${query}"...`).start()
        : null;

      try {
        let res: any;
        try {
          res = await client.get(
            `/api/emails/search?q=${encodeURIComponent(query)}&pageSize=${limit}`,
          );
        } catch (err: any) {
          try {
            res = await client.get(
              `/emails/search?q=${encodeURIComponent(query)}&pageSize=${limit}`,
            );
          } catch {
            try {
              res = await client.get(
                `/api/search/emails?q=${encodeURIComponent(query)}&pageSize=${limit}`,
              );
            } catch {
              throw err;
            }
          }
        }

        spinner?.stop();

        const items: EmailDto[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.emails)
              ? res.emails
              : [];

        if (options.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }

        if (items.length === 0) {
          console.log(chalk.gray(`\nNo messages matched query: "${query}"\n`));
          return;
        }

        console.log(
          chalk.bold(
            `\n🔍 Search Results for ${chalk.yellow.bold(`"${query}"`)} ${chalk.gray(`(${items.length} match${items.length === 1 ? '' : 'es'})`)}`,
          ),
        );

        const headers = ['ID', 'From', 'Subject', 'Snippet', 'Date'];
        const rows = items.map((e) => {
          const rawId = e.id || '';
          const idCol = chalk.gray(truncate(rawId, 10));
          const fromRaw = formatSender(e);
          const fromCol = highlightMatch(truncate(fromRaw, 22), query);
          const subjRaw = e.subject || '(no subject)';
          const subjCol = highlightMatch(truncate(subjRaw, 30), query);

          const bodyContent =
            e.bodyPlain || e.bodyText || (e.bodyHtml ? htmlToPlain(e.bodyHtml) : '');
          const snippetClean = bodyContent.replace(/\s+/g, ' ').trim();
          const snippetCol = snippetClean
            ? highlightMatch(truncate(snippetClean, 40), query)
            : chalk.gray('(empty)');
          const dateCol = chalk.gray(formatRelativeTime(e.receivedAt || e.createdAt));

          return [idCol, fromCol, subjCol, snippetCol, dateCol];
        });

        console.log(renderTable(headers, rows));
        console.log(
          chalk.gray(`\n💡 Tip: Run ${chalk.cyan('quant mail read <id>')} to open full message\n`),
        );
      } catch (err: any) {
        spinner?.fail(chalk.red('Search query failed'));
        console.error(chalk.red(`Error: ${err.message || 'Unable to execute search.'}`));
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant mail archive <id>
  // ─────────────────────────────────────────────────────────────────────────────
  mail
    .command('archive <id>')
    .description('Archive email message with instant undo hint')
    .option('--json', 'Output status in JSON format')
    .action(async (id: string, options: { json?: boolean }) => {
      const client = new QuantCliClient();
      const spinner = !options.json ? ora(`Archiving message ${chalk.cyan(id)}...`).start() : null;

      try {
        let res: any;
        try {
          res = await client.post(`/api/emails/${encodeURIComponent(id)}/archive`, {});
        } catch (err: any) {
          try {
            res = await client.post(`/emails/${encodeURIComponent(id)}/archive`, {});
          } catch {
            throw err;
          }
        }

        spinner?.stop();

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                id,
                action: 'archive',
                message: 'Email archived successfully',
                data: res?.data || res,
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(chalk.bold.green(`\n✔ Email ${chalk.cyan(id)} archived.`));
        console.log(
          chalk.gray(
            `  Undo: Run ${chalk.bold.yellow(`quant mail unarchive ${id}`)} to restore it back to your inbox.\n`,
          ),
        );
      } catch (err: any) {
        spinner?.fail(chalk.red(`Failed to archive email ${id}`));
        console.error(chalk.red(`Error: ${err.message || 'Unable to archive email.'}`));
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant mail unarchive <id> and restore <id> (Undo support)
  // ─────────────────────────────────────────────────────────────────────────────
  const unarchiveAction = async (id: string, options: { json?: boolean }) => {
    const client = new QuantCliClient();
    const spinner = !options.json
      ? ora(`Restoring message ${chalk.cyan(id)} to inbox...`).start()
      : null;

    try {
      let res: any;
      try {
        res = await client.post(`/api/emails/${encodeURIComponent(id)}/unarchive`, {});
      } catch (err: any) {
        try {
          res = await client.post(`/emails/${encodeURIComponent(id)}/unarchive`, {});
        } catch {
          throw err;
        }
      }

      spinner?.stop();

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              id,
              action: 'unarchive',
              message: 'Email restored to inbox',
              data: res?.data || res,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(chalk.bold.green(`\n✔ Email ${chalk.cyan(id)} restored to inbox.\n`));
    } catch (err: any) {
      spinner?.fail(chalk.red(`Failed to restore email ${id}`));
      console.error(chalk.red(`Error: ${err.message || 'Unable to restore email.'}`));
      process.exitCode = 1;
    }
  };

  mail
    .command('restore <id>')
    .alias('unarchive')
    .description('Restore an archived email message back to the inbox')
    .option('--json', 'Output status in JSON format')
    .action(unarchiveAction);

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant mail star <id>
  // ─────────────────────────────────────────────────────────────────────────────
  mail
    .command('star <id>')
    .description('Toggle starred state on an email message')
    .option('--json', 'Output status in JSON format')
    .action(async (id: string, options: { json?: boolean }) => {
      const client = new QuantCliClient();
      const spinner = !options.json ? ora(`Toggling star on ${chalk.cyan(id)}...`).start() : null;

      try {
        let res: any;
        try {
          res = await client.post(`/api/emails/${encodeURIComponent(id)}/star`, {});
        } catch (err: any) {
          try {
            res = await client.post(`/emails/${encodeURIComponent(id)}/star`, {});
          } catch {
            throw err;
          }
        }

        spinner?.stop();

        if (options.json) {
          console.log(JSON.stringify(res?.data || res || { success: true, id }, null, 2));
          return;
        }

        console.log(chalk.bold.green(`\n✔ Star toggled on email ${chalk.cyan(id)}.\n`));
      } catch (err: any) {
        spinner?.fail(chalk.red(`Failed to toggle star on email ${id}`));
        console.error(chalk.red(`Error: ${err.message || 'Unable to toggle star.'}`));
        process.exitCode = 1;
      }
    });
}
