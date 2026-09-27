import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { QuantCliClient } from '../client.js';
import { loadConfig } from '../config.js';
import { renderTable } from '../git-utils.js';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customer?: { name?: string; email?: string } | string;
  grandTotal?: number;
  total?: number;
  status?: string;
  dueDate?: string | Date;
  items?: InvoiceItem[];
  subtotal?: number;
  tax?: number;
  currency?: string;
}

/**
 * Formats currency amount.
 */
export function formatCurrency(amount?: number, currency = 'USD'): string {
  if (amount === undefined || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Formats invoices list into an ANSI table.
 */
export function formatInvoiceTable(invoices: any[]): string {
  if (!invoices || invoices.length === 0) return chalk.gray('No invoices found.');

  const headers = ['Invoice #', 'Customer', 'Grand Total', 'Status', 'Due Date'];
  const rows = invoices.map((inv) => {
    const invNum = inv.invoiceNumber || inv.number || inv.id || 'N/A';
    const customer =
      inv.customerName ||
      (typeof inv.customer === 'object' ? inv.customer?.name : undefined) ||
      inv.customer ||
      'Unknown';
    const amount = inv.grandTotal !== undefined ? inv.grandTotal : (inv.total ?? 0);
    const currency = inv.currency || 'USD';
    const totalStr = formatCurrency(amount, currency);

    const rawStatus = (inv.status || 'draft').toUpperCase();
    let statusStr = rawStatus;
    if (rawStatus === 'PAID') statusStr = chalk.green('PAID');
    else if (rawStatus === 'SENT') statusStr = chalk.cyan('SENT');
    else if (rawStatus === 'OVERDUE') statusStr = chalk.red('OVERDUE');
    else statusStr = chalk.gray('DRAFT');

    const dueDate = inv.dueDate
      ? new Date(inv.dueDate).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'N/A';

    return [
      chalk.bold.white(invNum),
      String(customer),
      chalk.yellow(totalStr),
      statusStr,
      chalk.gray(dueDate),
    ];
  });

  return renderTable(headers, rows);
}

/**
 * Formats detailed invoice view with line items and totals.
 */
export function formatInvoiceDetails(invoice: any): string {
  if (!invoice) return chalk.gray('Invoice not found.');

  const invNum = invoice.invoiceNumber || invoice.number || invoice.id || 'N/A';
  const customerName =
    invoice.customerName ||
    (typeof invoice.customer === 'object' ? invoice.customer?.name : undefined) ||
    'Unknown';
  const customerEmail =
    invoice.customerEmail ||
    (typeof invoice.customer === 'object' ? invoice.customer?.email : undefined) ||
    '';
  const status = (invoice.status || 'draft').toUpperCase();
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A';
  const currency = invoice.currency || 'USD';

  const lines: string[] = [];
  lines.push(chalk.bold.cyan(`\n📄 ERPGo Invoice Breakdown — ${invNum}`));
  lines.push(chalk.gray('─'.repeat(60)));
  lines.push(
    `${chalk.bold('Customer:   ')} ${white(customerName)} ${customerEmail ? chalk.gray(`<${customerEmail}>`) : ''}`,
  );
  lines.push(
    `${chalk.bold('Status:     ')} ${status === 'PAID' ? chalk.green('PAID') : chalk.yellow(status)}`,
  );
  lines.push(`${chalk.bold('Due Date:   ')} ${chalk.white(dueDate)}`);
  lines.push(chalk.gray('─'.repeat(60)));

  lines.push(chalk.bold('\nLine Items:'));
  const items: InvoiceItem[] = invoice.items || [];
  if (items.length === 0) {
    lines.push(chalk.gray('  (no line items)'));
  } else {
    items.forEach((item, idx) => {
      const itemTotal = item.total !== undefined ? item.total : item.quantity * item.unitPrice;
      lines.push(
        `  ${idx + 1}. ${item.description || 'Item'} — Qty: ${item.quantity} × ${formatCurrency(item.unitPrice, currency)} = ${chalk.green(formatCurrency(itemTotal, currency))}`,
      );
    });
  }

  lines.push(chalk.gray('\n' + '─'.repeat(60)));
  const subtotal =
    invoice.subtotal !== undefined
      ? invoice.subtotal
      : items.reduce((s, i) => s + (i.total !== undefined ? i.total : i.quantity * i.unitPrice), 0);
  const tax = invoice.tax || 0;
  const grandTotal = invoice.grandTotal !== undefined ? invoice.grandTotal : subtotal + tax;

  lines.push(`  Subtotal:    ${formatCurrency(subtotal, currency)}`);
  if (tax > 0) {
    lines.push(`  Tax:         ${formatCurrency(tax, currency)}`);
  }
  lines.push(`  Grand Total: ${chalk.bold.green(formatCurrency(grandTotal, currency))}`);
  lines.push(chalk.gray('─'.repeat(60) + '\n'));

  return lines.join('\n');
}

function white(str: string): string {
  return chalk.white(str);
}

/**
 * Registers all `quant invoice` commands.
 */
export function registerInvoiceCommands(
  program: Command,
  getClient: () => QuantCliClient = () => new QuantCliClient(),
): void {
  const invoice = program
    .command('invoice')
    .description('ERPGo Invoicing: list, view, and create invoices in active workspace');

  // Subcommand: quant invoice list
  invoice
    .command('list')
    .description('List invoices for active workspace in an ANSI table')
    .option('--json', 'Output invoices in JSON format')
    .action(async (options: { json?: boolean }) => {
      const spinner = !options.json
        ? ora('Fetching invoices for active workspace...').start()
        : null;
      const client = getClient();

      try {
        const config = loadConfig();
        const workspaceId = config.defaultWorkspace;
        const headers: Record<string, string> = {};
        if (workspaceId) {
          headers['X-Workspace-ID'] = workspaceId;
        }

        let res: any;
        const queryPath = workspaceId
          ? `/api/workspaces/${encodeURIComponent(workspaceId)}/invoices`
          : '/api/invoices';
        try {
          res = await client.get<any>(queryPath, { headers });
        } catch {
          try {
            res = await client.get<any>('/api/invoices', { headers });
          } catch {
            res = await client.get<any>('/invoices', { headers });
          }
        }

        spinner?.stop();

        const invoices = Array.isArray(res) ? res : res?.data || res?.invoices || [];

        if (options.json) {
          console.log(JSON.stringify(invoices, null, 2));
          return;
        }

        console.log(
          chalk.bold(
            `\n📊 ERPGo Invoices ${workspaceId ? chalk.gray(`(Workspace: ${workspaceId})`) : ''}`,
          ),
        );
        console.log(formatInvoiceTable(invoices));
        console.log(
          chalk.gray(`\n💡 Tip: Run ${chalk.cyan('quant invoice view <id>')} for details\n`),
        );
      } catch (err: any) {
        spinner?.fail(chalk.red('Failed to fetch invoices.'));
        console.error(chalk.red(`Error: ${err.message || 'Unable to load invoices'}`));
        process.exitCode = 1;
      }
    });

  // Subcommand: quant invoice view <id>
  invoice
    .command('view <id>')
    .description('Fetch invoice details and output text breakdown or JSON')
    .option('--json', 'Output invoice details in JSON format')
    .action(async (id: string, options: { json?: boolean }) => {
      const spinner = !options.json ? ora(`Fetching invoice ${chalk.cyan(id)}...`).start() : null;
      const client = getClient();

      try {
        let res: any;
        try {
          res = await client.get<any>(`/api/invoices/${encodeURIComponent(id)}`);
        } catch {
          res = await client.get<any>(`/invoices/${encodeURIComponent(id)}`);
        }

        spinner?.stop();
        const inv = res?.data || res;

        if (options.json) {
          console.log(JSON.stringify(inv, null, 2));
          return;
        }

        console.log(formatInvoiceDetails(inv));
      } catch (err: any) {
        spinner?.fail(chalk.red(`Failed to fetch invoice ${id}.`));
        console.error(chalk.red(`Error: ${err.message || 'Unable to load invoice details'}`));
        process.exitCode = 1;
      }
    });

  // Subcommand: quant invoice create
  invoice
    .command('create')
    .description(
      'Create an invoice with --customer-name, --customer-email, and --items JSON string',
    )
    .requiredOption('--customer-name <name>', 'Customer full name')
    .requiredOption('--customer-email <email>', 'Customer email address')
    .requiredOption(
      '--items <json>',
      'Line items in JSON format (e.g. [{"description":"Consulting","quantity":5,"unitPrice":150}] )',
    )
    .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
    .option('--currency <currency>', 'Currency code (USD, EUR, GBP)', 'USD')
    .option('--json', 'Output created invoice in JSON format')
    .action(
      async (options: {
        customerName: string;
        customerEmail: string;
        items: string;
        dueDate?: string;
        currency?: string;
        json?: boolean;
      }) => {
        const spinner = !options.json ? ora('Creating new ERPGo invoice...').start() : null;
        const client = getClient();

        try {
          let parsedItems: any[];
          try {
            parsedItems = JSON.parse(options.items);
          } catch (parseErr: any) {
            throw new Error(`Invalid JSON for --items: ${parseErr.message}`);
          }

          const config = loadConfig();
          const workspaceId = config.defaultWorkspace;
          const headers: Record<string, string> = {};
          if (workspaceId) {
            headers['X-Workspace-ID'] = workspaceId;
          }

          const payload = {
            customerName: options.customerName,
            customerEmail: options.customerEmail,
            items: parsedItems,
            dueDate:
              options.dueDate ||
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            currency: options.currency || 'USD',
            workspaceId: workspaceId || undefined,
          };

          let res: any;
          const createPath = workspaceId
            ? `/api/workspaces/${encodeURIComponent(workspaceId)}/invoices`
            : '/api/invoices';
          try {
            res = await client.post<any>(createPath, payload, { headers });
          } catch {
            try {
              res = await client.post<any>('/api/invoices', payload, { headers });
            } catch {
              res = await client.post<any>('/invoices', payload, { headers });
            }
          }

          spinner?.stop();
          const created = res?.data || res;

          if (options.json) {
            console.log(JSON.stringify(created, null, 2));
            return;
          }

          console.log(chalk.bold.green('\n✔ ERPGo Invoice created successfully!'));
          console.log(formatInvoiceDetails(created));
        } catch (err: any) {
          spinner?.fail(chalk.red('Failed to create invoice.'));
          console.error(chalk.red(`Error: ${err.message || 'Unable to create invoice'}`));
          process.exitCode = 1;
        }
      },
    );
}
